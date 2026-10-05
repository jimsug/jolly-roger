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
  LIVE_USER_UPDATE_BURST,
  LIVE_USER_UPDATES_PER_SECOND,
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
import type { Bucket } from "./rateLimits";
import { refill, remember } from "./rateLimits";
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
  // Set when a change drops this answer, or when one landed while it was
  // being worked out, so an update that read it knows it may be stale.
  dropped?: boolean;
}
type Watch = Promise<{ stop: () => void }>;
interface ConnectionState {
  connection: string;
  // Only ever holds boards the connection has been let onto, as do written
  // and stops, and at most MAX_TRACKED_BOARDS of them.
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
  // Updates run side by side (the method unblocks), so the connection
  // numbers the updates it's sent, and each board remembers the latest one
  // written there. An update that's overtaken while it looks things up isn't
  // written over the newer one.
  sent: number;
  written: Map<string, number>;
  // The connection's live updates, across every board: LIVE_UPDATE_BURST
  // tokens refilled at LIVE_UPDATES_PER_SECOND. droppedLoggedAt is when
  // dropping updates was last logged, so a flood logs once a minute at most.
  bucket: Bucket;
  droppedLoggedAt: number;
}
const connections = new Map<string, ConnectionState>();
// Each person's live updates across all their connections:
// LIVE_USER_UPDATE_BURST tokens refilled at LIVE_USER_UPDATES_PER_SECOND.
// A full bucket is the same as none, so those are dropped as connections
// close.
const userBuckets = new Map<string, Bucket>();

// How many boards a connection's bookkeeping remembers. A tab is on one
// board at a time, so this only matters to a connection that moves between
// boards, which forgets the one it used longest ago.
const MAX_TRACKED_BOARDS = 16;
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
    sent: 0,
    written: new Map(),
    bucket: { tokens: LIVE_UPDATE_BURST, refilledAt: Date.now() },
    droppedLoggedAt: Number.NEGATIVE_INFINITY,
  };
  connections.set(connection.id, state);
  connection.onClose(() => {
    state.closed = true;
    connections.delete(connection.id);
    dropFullUserBuckets();
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

function dropFullUserBuckets() {
  const now = Date.now();
  userBuckets.forEach((bucket, userId) => {
    refill(bucket, now, LIVE_USER_UPDATE_BURST, LIVE_USER_UPDATES_PER_SECOND);
    if (bucket.tokens >= LIVE_USER_UPDATE_BURST) userBuckets.delete(userId);
  });
}

// Takes a token for one live update from the connection's bucket and the
// person's, or says there isn't one in both. Live updates come again a
// moment later, so one that's dropped is only ever a little late, and
// nothing is sent back.
function takeLiveToken(state: ConnectionState, userId: string) {
  const now = Date.now();
  refill(state.bucket, now, LIVE_UPDATE_BURST, LIVE_UPDATES_PER_SECOND);
  const userBucket = userBuckets.get(userId) ?? {
    tokens: LIVE_USER_UPDATE_BURST,
    refilledAt: now,
  };
  userBuckets.set(userId, userBucket);
  refill(userBucket, now, LIVE_USER_UPDATE_BURST, LIVE_USER_UPDATES_PER_SECOND);
  if (state.bucket.tokens >= 1 && userBucket.tokens >= 1) {
    state.bucket.tokens -= 1;
    userBucket.tokens -= 1;
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
      if (matches(entry)) {
        entry.dropped = true;
        state.boards.delete(key);
      }
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

// What userId may do on the board, and the connection's epoch it was worked
// out under. The answer's dropped flag and that epoch say whether it may
// have changed since.
async function boardAccess(
  userId: string,
  boardId: string,
  state: ConnectionState,
): Promise<{ access: CachedAccess; epoch: number }> {
  // Keyed by user too, so logging in as someone else on the same connection
  // doesn't inherit the previous user's access.
  const key = `${userId}:${boardId}`;
  const cached = state.boards.get(key);
  if (cached && cached.until > Date.now() && state.watchedUser === userId) {
    return { access: cached, epoch: state.epoch };
  }

  // The watch starts before anything is read, so no change slips between
  // the read and the watch.
  await watchUser(state, userId);
  const epochs: [number, number] = [boardsEpoch, state.epoch];
  const board = await Whiteboards.findOneAsync(boardId);
  const hunt = board ? await Hunts.findOneAsync(board.hunt) : undefined;
  const user = await MeteorUsers.findOneAsync(userId, {
    projection: { roles: 1, hunts: 1 },
  });
  const access = board ? whiteboardAccess(user, hunt, board).access : "none";
  if (!board || access === "none") {
    throw new Meteor.Error(403, "Not a member of this hunt");
  }
  const entry: CachedAccess = {
    board: boardId,
    hunt: board.hunt,
    mayEdit: access === "edit",
    mayComment: access === "edit" || access === "comment",
    until: Date.now() + MEMBERSHIP_TTL,
  };
  if (epochs[0] === boardsEpoch && epochs[1] === state.epoch) {
    remember(state.boards, key, entry, MAX_TRACKED_BOARDS);
  } else {
    entry.dropped = true;
  }
  return { access: entry, epoch: epochs[1] };
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
  // Nothing is kept for a board until the caller is shown to be allowed on
  // it, so the method's check of the id is repeated here.
  if (!Id.test(boardId)) throw invalidLiveUpdate();
  // Read before anything is awaited, so a close or unsubscribe that lands
  // while this call is under way shows up as a change.
  const state = connectionState(connection);
  if (!takeLiveToken(state, userId)) return;
  const stops = state.stops.get(boardId) ?? 0;
  const cleanedUp = () =>
    state.closed || (state.stops.get(boardId) ?? 0) !== stops;
  state.sent += 1;
  const seq = state.sent;

  if (
    (await Flags.activeAsync("disable.whiteboard")) ||
    (await Flags.activeAsync("disable.whiteboard_live"))
  ) {
    return;
  }
  validateLive(live);

  const { access, epoch } = await boardAccess(userId, boardId, state);
  const { hunt, mayEdit, mayComment } = access;
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
  remember(state.written, boardId, seq, MAX_TRACKED_BOARDS);
  // Who may do what changed while this looked things up (a demotion, say),
  // so only the cursor goes through rather than what was allowed before.
  const accessChanged = access.dropped === true || epoch !== state.epoch;
  // Only the caller's own connection's document is ever written.
  const selector = { board: boardId, connection: connection.id };
  await WhiteboardPresence.upsertAsync(selector, {
    $set: {
      hunt,
      user: userId,
      server: serverId,
      cursor: live.cursor,
      ...(accessChanged
        ? { ...NO_LIVE_EDITS, ...NO_FOLLOWING }
        : {
            drag,
            stroke,
            selection,
            editing,
            editingAt,
            view,
            followedUser,
          }),
    },
  });
  if (cleanedUp()) await WhiteboardPresence.removeAsync(selector);
}

// How many boards a connection's bookkeeping holds, for tests.
export function trackedBoardCounts(connectionId: string) {
  const state = connections.get(connectionId);
  return (
    state && {
      boards: state.boards.size,
      written: state.written.size,
      stops: state.stops.size,
    }
  );
}

// For the presence publication's onStop, which only runs for a board the
// subscriber is a member of. Updates after this are numbered after any that
// were under way, so the board's last written number isn't needed.
export async function removePresence(boardId: string, connectionId: string) {
  const state = connections.get(connectionId);
  if (state) {
    remember(
      state.stops,
      boardId,
      (state.stops.get(boardId) ?? 0) + 1,
      MAX_TRACKED_BOARDS,
    );
    state.written.delete(boardId);
  }
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
    // A purged board takes its presence with it, so an update that was
    // still allowed a moment ago can't put a row back.
    removed: (boardId) => {
      forgetBoardAccess(boardId);
      WhiteboardPresence.removeAsync({ board: boardId }).catch(
        (error: unknown) => {
          Logger.warn("Failed to remove a removed whiteboard's presence", {
            board: boardId,
            error,
          });
        },
      );
    },
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
