import { Meteor } from "meteor/meteor";
import Flags from "../Flags";
import Logger from "../Logger";
import Hunts from "../lib/models/Hunts";
import MeteorUsers from "../lib/models/MeteorUsers";
import WhiteboardNodes from "../lib/models/WhiteboardNodes";
import Whiteboards from "../lib/models/Whiteboards";
import { whiteboardAccess } from "../lib/permission_stubs";
import { Id } from "../lib/typedModel/regexes";
import { MAX_INK_POINTS, MAX_LIVE_DRAG_NODES } from "../lib/whiteboard/limits";
import type { WhiteboardLiveState } from "../methods/setWhiteboardLive";
import { registerPeriodicCleanupHook } from "./garbage-collection";
import WhiteboardPresence from "./models/WhiteboardPresence";
import onExit from "./onExit";
import serverId from "./serverId";
import { inRange, isInkPoint } from "./whiteboardShared";

// Live updates arrive several times a second per person, so remember what
// each connection may do on each board rather than checking on every call.
// Anything that changes the answer (the board's edit policy, the hunt being
// archived or its default roles, the user's own roles and hunts) drops the
// remembered answer as soon as an observer sees it; the TTL is only a
// backstop.
const MEMBERSHIP_TTL = 60 * 1000;
interface CachedAccess {
  board: string;
  hunt: string;
  mayEdit: boolean;
  until: number;
}
type Watch = Promise<{ stop: () => void }>;
interface ConnectionState {
  boards: Map<string, CachedAccess>;
  // Bumped whenever this connection's answers are dropped, so a check that
  // was reading at the time doesn't remember what it read.
  epoch: number;
  // The user whose roles and hunts are being watched for this connection.
  watchedUser: string | undefined;
  userWatch: Watch | undefined;
  validatedDrag: string;
  // How many times each board's presence subscription has stopped, and
  // whether the connection has gone. An update that was already under way
  // when either cleanup ran takes its document back out.
  stops: Map<string, number>;
  closed: boolean;
}
const connections = new Map<string, ConnectionState>();
// As ConnectionState.epoch, for changes to boards and hunts.
let boardsEpoch = 0;

function stopWatch(watch: Watch | undefined) {
  watch
    ?.then((handle) => handle.stop())
    .catch((error: unknown) => {
      Logger.warn("Failed to stop watching a whiteboard user", { error });
    });
}

function connectionState(connection: Meteor.Connection): ConnectionState {
  const existing = connections.get(connection.id);
  if (existing) return existing;
  const state: ConnectionState = {
    boards: new Map(),
    epoch: 0,
    watchedUser: undefined,
    userWatch: undefined,
    validatedDrag: "",
    stops: new Map(),
    closed: false,
  };
  connections.set(connection.id, state);
  connection.onClose(() => {
    state.closed = true;
    connections.delete(connection.id);
    stopWatch(state.userWatch);
    WhiteboardPresence.removeAsync({ connection: connection.id }).catch(
      (error: unknown) => {
        Logger.error("Failed to remove whiteboard presence", {
          connection: connection.id,
          error,
        });
      },
    );
  });
  return state;
}

function forgetAccess(matches: (entry: CachedAccess) => boolean) {
  boardsEpoch += 1;
  for (const state of connections.values()) {
    for (const [key, entry] of state.boards) {
      if (matches(entry)) state.boards.delete(key);
    }
  }
}

// Drops what this process remembers about who may do what on a board, for
// a change it has just made itself. Other processes hear of it through their
// observers.
export function forgetBoardAccess(boardId: string) {
  forgetAccess((entry) => entry.board === boardId);
}

function forgetConnectionAccess(state: ConnectionState) {
  state.epoch += 1;
  state.boards.clear();
}

// Watches the user's roles and hunts for as long as the connection is open,
// so a promotion, demotion or leaving the hunt takes effect at once.
async function watchUser(state: ConnectionState, userId: string) {
  if (state.closed) return;
  if (state.watchedUser !== userId) {
    // Nobody watches the previous user's roles from here on, so nothing
    // remembered about them can be trusted.
    forgetConnectionAccess(state);
    const previous = state.userWatch;
    const watch: Watch = MeteorUsers.find(userId, {
      projection: { roles: 1, hunts: 1 },
    }).observeAsync({
      changed: () => forgetConnectionAccess(state),
      removed: () => forgetConnectionAccess(state),
    });
    state.watchedUser = userId;
    state.userWatch = watch;
    // A watch that failed to start is tried again on the next update.
    watch.catch(() => {
      if (state.userWatch === watch) {
        state.watchedUser = undefined;
        state.userWatch = undefined;
      }
    });
    stopWatch(previous);
  }
  await state.userWatch;
}

async function boardAccess(
  userId: string,
  boardId: string,
  state: ConnectionState,
): Promise<CachedAccess> {
  // Keyed by user too, so logging in as someone else on the same connection
  // doesn't inherit the previous user's access.
  const key = `${userId}:${boardId}`;
  const cached = state.boards.get(key);
  if (cached && cached.until > Date.now() && state.watchedUser === userId) {
    return cached;
  }

  // The watch starts before anything is read, so no change slips between
  // the read and the watch.
  await watchUser(state, userId);
  const epochs = [boardsEpoch, state.epoch];
  const board = await Whiteboards.findOneAsync(boardId);
  const hunt = board ? await Hunts.findOneAsync(board.hunt) : undefined;
  const user = await MeteorUsers.findOneAsync(userId, {
    projection: { roles: 1, hunts: 1 },
  });
  const access = board ? whiteboardAccess(user, hunt, board).access : "none";
  if (!board || access === "none") {
    throw new Meteor.Error(403, "Not a member of this hunt");
  }
  const entry = {
    board: boardId,
    hunt: board.hunt,
    mayEdit: access === "edit",
    until: Date.now() + MEMBERSHIP_TTL,
  };
  if (epochs[0] === boardsEpoch && epochs[1] === state.epoch) {
    state.boards.set(key, entry);
  }
  return entry;
}

const invalidLiveUpdate = () => new Meteor.Error(400, "Invalid live update");

function validateLive({ cursor, drag, stroke }: WhiteboardLiveState) {
  if (cursor && !(inRange(cursor.x) && inRange(cursor.y))) {
    throw invalidLiveUpdate();
  }
  if (drag) {
    if (drag.length > MAX_LIVE_DRAG_NODES) throw invalidLiveUpdate();
    drag.forEach((d) => {
      if (!Id.test(d.node) || !inRange(d.x) || !inRange(d.y)) {
        throw invalidLiveUpdate();
      }
      if (d.parent && !Id.test(d.parent)) throw invalidLiveUpdate();
    });
  }
  if (
    stroke &&
    (stroke.points.length > MAX_INK_POINTS || !stroke.points.every(isInkPoint))
  ) {
    throw invalidLiveUpdate();
  }
}

export async function setLive(
  userId: string,
  connection: Meteor.Connection,
  boardId: string,
  live: WhiteboardLiveState,
) {
  // Read before anything is awaited, so a close or unsubscribe that lands
  // while this call is under way shows up as a change.
  const state = connectionState(connection);
  const stops = state.stops.get(boardId) ?? 0;
  const cleanedUp = () =>
    state.closed || (state.stops.get(boardId) ?? 0) !== stops;

  if (
    (await Flags.activeAsync("disable.whiteboard")) ||
    (await Flags.activeAsync("disable.whiteboard_live"))
  ) {
    return;
  }
  validateLive(live);

  const { hunt, mayEdit } = await boardAccess(userId, boardId, state);
  // Someone who can't edit still shows their cursor, but nothing they drag
  // or draw. Dropped rather than refused, since a refusal would come back
  // every 100ms.
  const drag = mayEdit ? live.drag : null;
  const stroke = mayEdit ? live.stroke : null;

  if (drag && drag.length > 0) {
    const ids = `${boardId}:${[...new Set(drag.map((d) => d.node))].toSorted().join(",")}`;
    if (ids !== state.validatedDrag) {
      const found = await WhiteboardNodes.find({
        _id: { $in: drag.map((d) => d.node) },
        board: boardId,
      }).countAsync();
      if (found !== new Set(drag.map((d) => d.node)).size) {
        throw new Meteor.Error(400, "Dragged nodes must be on this board");
      }
      state.validatedDrag = ids;
    }
  }

  if (cleanedUp()) return;
  // Only the caller's own connection's document is ever written.
  const selector = { board: boardId, connection: connection.id };
  await WhiteboardPresence.upsertAsync(selector, {
    $set: {
      hunt,
      user: userId,
      server: serverId,
      cursor: live.cursor,
      drag,
      stroke,
    },
  });
  if (cleanedUp()) await WhiteboardPresence.removeAsync(selector);
}

// For the presence publication's onStop.
export async function removePresence(boardId: string, connectionId: string) {
  const state = connections.get(connectionId);
  state?.stops.set(boardId, (state.stops.get(boardId) ?? 0) + 1);
  await WhiteboardPresence.removeAsync({
    board: boardId,
    connection: connectionId,
  });
}

registerPeriodicCleanupHook(async (deadServer) => {
  await WhiteboardPresence.removeAsync({ server: deadServer });
});

// Every process watches boards and hunts for changes that alter who may edit,
// and drops what it remembers about them.
Meteor.startup(async () => {
  const boards = await Whiteboards.find(
    {},
    { projection: { editPolicy: 1, editors: 1 } },
  ).observeChangesAsync({
    changed: (boardId) => forgetBoardAccess(boardId),
  });
  const hunts = await Hunts.find(
    {},
    { projection: { isArchived: 1, defaultRoles: 1 } },
  ).observeChangesAsync({
    changed: (huntId) => forgetAccess((entry) => entry.hunt === huntId),
  });
  onExit(() => {
    boards.stop();
    hunts.stop();
  });
});
