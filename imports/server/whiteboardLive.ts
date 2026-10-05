import { Meteor } from "meteor/meteor";
import type { Mongo } from "meteor/mongo";
import Flags from "../Flags";
import Logger from "../Logger";
import Hunts from "../lib/models/Hunts";
import MeteorUsers from "../lib/models/MeteorUsers";
import WhiteboardEdges from "../lib/models/WhiteboardEdges";
import WhiteboardNodes from "../lib/models/WhiteboardNodes";
import Whiteboards from "../lib/models/Whiteboards";
import { whiteboardAccess } from "../lib/permission_stubs";
import { Id } from "../lib/typedModel/regexes";
import {
  LIVE_UPDATE_BURST,
  LIVE_UPDATES_PER_SECOND,
  MAX_INK_POINTS,
  MAX_LIVE_DRAG_NODES,
  MAX_LIVE_SELECTION,
} from "../lib/whiteboard/limits";
import { MAX_ZOOM, MIN_ZOOM } from "../lib/whiteboard/links";
import type { WhiteboardLiveState } from "../methods/setWhiteboardLive";
import { registerPeriodicCleanupHook } from "./garbage-collection";
import type { WhiteboardPresenceType } from "./models/WhiteboardPresence";
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
  // Everyone who may comment shows what they're looking at and who they're
  // following; someone who can only view (on an archived hunt) doesn't.
  mayComment: boolean;
  until: number;
}
type Watch = Promise<{ stop: () => void }>;
interface ConnectionState {
  connection: string;
  boards: Map<string, CachedAccess>;
  // Bumped whenever this connection's answers are dropped, so a check that
  // was reading at the time doesn't remember what it read.
  epoch: number;
  // The user whose roles and hunts are being watched for this connection.
  watchedUser: string | undefined;
  userWatch: Watch | undefined;
  // The last dragged, selected and edited sets, and the person followed,
  // found on their board, so an unchanged one isn't looked up again on every
  // update.
  validatedDrag: string;
  validatedSelection: string;
  validatedEditing: string;
  validatedFollowed: string;
  // How many times each board's presence subscription has stopped, and
  // whether the connection has gone. An update that was already under way
  // when either cleanup ran takes its document back out.
  stops: Map<string, number>;
  closed: boolean;
  // Updates run side by side (the method unblocks), so each board counts
  // the updates it's been sent and the latest one written. An update that's
  // overtaken while it looks things up isn't written over the newer one.
  sent: Map<string, number>;
  written: Map<string, number>;
  // A token bucket for the connection's live updates, across every board:
  // up to LIVE_UPDATE_BURST tokens, refilled at LIVE_UPDATES_PER_SECOND,
  // one taken per update. droppedLoggedAt is when dropping updates was last
  // logged, so a flood logs once a minute at most.
  tokens: number;
  refilledAt: number;
  droppedLoggedAt: number;
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
    connection: connection.id,
    boards: new Map(),
    epoch: 0,
    watchedUser: undefined,
    userWatch: undefined,
    validatedDrag: "",
    validatedSelection: "",
    validatedEditing: "",
    validatedFollowed: "",
    stops: new Map(),
    closed: false,
    sent: new Map(),
    written: new Map(),
    tokens: LIVE_UPDATE_BURST,
    refilledAt: Date.now(),
    droppedLoggedAt: Number.NEGATIVE_INFINITY,
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

const DROPPED_LOG_INTERVAL = 60 * 1000;

// Takes a token for one live update, or says there isn't one. Live updates
// come again a moment later, so one that's dropped is only ever a little
// late, and nothing is sent back.
function takeLiveToken(state: ConnectionState, userId: string) {
  const now = Date.now();
  state.tokens = Math.min(
    LIVE_UPDATE_BURST,
    state.tokens + ((now - state.refilledAt) / 1000) * LIVE_UPDATES_PER_SECOND,
  );
  state.refilledAt = now;
  if (state.tokens >= 1) {
    state.tokens -= 1;
    return true;
  }
  if (now - state.droppedLoggedAt >= DROPPED_LOG_INTERVAL) {
    state.droppedLoggedAt = now;
    Logger.debug("Dropping whiteboard live updates over the rate limit", {
      user: userId,
      connection: state.connection,
    });
  }
  return false;
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

const NO_LIVE_EDITS = {
  drag: null,
  stroke: null,
  selection: null,
  editing: null,
  editingAt: null,
};
const NO_FOLLOWING = { view: null, followedUser: null };

// Takes away what people were dragging, drawing, selecting or typing in on
// boards they can no longer edit, and what they were looking at and who they
// were following on boards they can no longer comment on, rather than
// leaving it until they next move. rows picks the presence documents looked
// at.
export async function clearLiveEditsOfNonEditors(
  rows: Mongo.Selector<WhiteboardPresenceType>,
) {
  const present = await WhiteboardPresence.find(rows, {
    projection: { board: 1, user: 1 },
  }).fetchAsync();
  const usersByBoard = new Map<string, Set<string>>();
  present.forEach(({ board, user }) => {
    usersByBoard.set(board, (usersByBoard.get(board) ?? new Set()).add(user));
  });
  for (const [boardId, userIds] of usersByBoard) {
    const board = await Whiteboards.findOneAsync(boardId);
    const hunt = board ? await Hunts.findOneAsync(board.hunt) : undefined;
    const people = await MeteorUsers.find(
      { _id: { $in: [...userIds] } },
      { projection: { roles: 1, hunts: 1 } },
    ).fetchAsync();
    const accessOf = new Map(
      board
        ? people.map((p) => [p._id, whiteboardAccess(p, hunt, board).access])
        : [],
    );
    const losingEdits = [...userIds].filter(
      (id) => accessOf.get(id) !== "edit",
    );
    const losingAll = losingEdits.filter(
      (id) => accessOf.get(id) !== "comment",
    );
    const editsOnly = losingEdits.filter((id) => !losingAll.includes(id));
    if (editsOnly.length > 0) {
      await WhiteboardPresence.updateAsync(
        { $and: [rows, { board: boardId, user: { $in: editsOnly } }] },
        { $set: NO_LIVE_EDITS },
        { multi: true },
      );
    }
    if (losingAll.length > 0) {
      await WhiteboardPresence.updateAsync(
        { $and: [rows, { board: boardId, user: { $in: losingAll } }] },
        { $set: { ...NO_LIVE_EDITS, ...NO_FOLLOWING } },
        { multi: true },
      );
    }
  }
}

function clearLiveEditsLogged(rows: Mongo.Selector<WhiteboardPresenceType>) {
  clearLiveEditsOfNonEditors(rows).catch((error: unknown) => {
    Logger.warn("Failed to clear live edits on the whiteboard", { error });
  });
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
      changed: () => {
        forgetConnectionAccess(state);
        clearLiveEditsLogged({ connection: state.connection });
      },
      removed: () => {
        forgetConnectionAccess(state);
        clearLiveEditsLogged({ connection: state.connection });
      },
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
    mayComment: access === "edit" || access === "comment",
    until: Date.now() + MEMBERSHIP_TTL,
  };
  if (epochs[0] === boardsEpoch && epochs[1] === state.epoch) {
    state.boards.set(key, entry);
  }
  return entry;
}

const invalidLiveUpdate = () => new Meteor.Error(400, "Invalid live update");

function validateLive({
  cursor,
  drag,
  stroke,
  selection,
  editing,
  editingAt,
  view,
  followedUser,
}: WhiteboardLiveState) {
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
  if (
    selection &&
    (selection.length > MAX_LIVE_SELECTION ||
      !selection.every((id) => Id.test(id)))
  ) {
    throw invalidLiveUpdate();
  }
  if (editing != null && !Id.test(editing)) throw invalidLiveUpdate();
  if (editingAt && !Number.isFinite(editingAt.getTime())) {
    throw invalidLiveUpdate();
  }
  if (
    view &&
    !(
      inRange(view.x) &&
      inRange(view.y) &&
      view.zoom >= MIN_ZOOM &&
      view.zoom <= MAX_ZOOM
    )
  ) {
    throw invalidLiveUpdate();
  }
  if (followedUser != null && !Id.test(followedUser)) {
    throw invalidLiveUpdate();
  }
}

// Checks that every node in `ids` is on the board, unless the same set was
// found there last time.
async function assertNodesOnBoard(
  boardId: string,
  ids: string[],
  validated: string,
  message: string,
) {
  const unique = [...new Set(ids)];
  const key = `${boardId}:${unique.toSorted().join(",")}`;
  if (key === validated) return key;
  const found = await WhiteboardNodes.find({
    _id: { $in: unique },
    board: boardId,
  }).countAsync();
  if (found !== unique.length) throw new Meteor.Error(400, message);
  return key;
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
  if (!takeLiveToken(state, userId)) return;
  const stops = state.stops.get(boardId) ?? 0;
  const cleanedUp = () =>
    state.closed || (state.stops.get(boardId) ?? 0) !== stops;
  const seq = (state.sent.get(boardId) ?? 0) + 1;
  state.sent.set(boardId, seq);

  if (
    (await Flags.activeAsync("disable.whiteboard")) ||
    (await Flags.activeAsync("disable.whiteboard_live"))
  ) {
    return;
  }
  validateLive(live);

  const { hunt, mayEdit, mayComment } = await boardAccess(
    userId,
    boardId,
    state,
  );
  // Someone who can't edit still shows their cursor, but nothing they drag,
  // draw, select or type in, and someone who can only view doesn't show what
  // they're looking at or who they follow either. Dropped rather than
  // refused, since a refusal would come back every 100ms.
  const drag = mayEdit ? live.drag : null;
  const stroke = mayEdit ? live.stroke : null;
  const selection = mayEdit ? (live.selection ?? null) : null;
  const editing = mayEdit ? (live.editing ?? null) : null;
  const editingAt = editing ? (live.editingAt ?? null) : null;
  const view = mayComment ? (live.view ?? null) : null;
  const followedUser = mayComment ? (live.followedUser ?? null) : null;

  if (drag && drag.length > 0) {
    state.validatedDrag = await assertNodesOnBoard(
      boardId,
      drag.map((d) => d.node),
      state.validatedDrag,
      "Dragged nodes must be on this board",
    );
  }
  if (selection && selection.length > 0) {
    state.validatedSelection = await assertNodesOnBoard(
      boardId,
      selection,
      state.validatedSelection,
      "Selected nodes must be on this board",
    );
  }
  // A line's label is typed in too, so a line will do as well as a node.
  if (editing && `${boardId}:${editing}` !== state.validatedEditing) {
    const selector = { _id: editing, board: boardId };
    const found =
      (await WhiteboardNodes.find(selector).countAsync()) +
      (await WhiteboardEdges.find(selector).countAsync());
    if (found === 0) {
      throw new Meteor.Error(400, "Edited items must be on this board");
    }
    state.validatedEditing = `${boardId}:${editing}`;
  }
  // Only someone with a tab on the board can be followed there.
  if (
    followedUser &&
    `${boardId}:${followedUser}` !== state.validatedFollowed
  ) {
    const found = await WhiteboardPresence.find({
      board: boardId,
      user: followedUser,
    }).countAsync();
    if (found === 0) {
      throw new Meteor.Error(400, "Followed people must be on this board");
    }
    state.validatedFollowed = `${boardId}:${followedUser}`;
  }

  if (cleanedUp() || (state.written.get(boardId) ?? 0) > seq) return;
  state.written.set(boardId, seq);
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
      selection,
      editing,
      editingAt,
      view,
      followedUser,
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
// and drops what it remembers about them. Archiving a hunt, or changing who
// its default roles make an operator, also clears the live edits of anyone
// on its boards through this process who can no longer edit.
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
    changed: (huntId) => {
      forgetAccess((entry) => entry.hunt === huntId);
      clearLiveEditsLogged({ hunt: huntId, server: serverId });
    },
  });
  onExit(() => {
    boards.stop();
    hunts.stop();
  });
});
