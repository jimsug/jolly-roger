import { Meteor } from "meteor/meteor";
import Flags from "../Flags";
import Logger from "../Logger";
import MeteorUsers from "../lib/models/MeteorUsers";
import WhiteboardNodes from "../lib/models/WhiteboardNodes";
import Whiteboards from "../lib/models/Whiteboards";
import { Id } from "../lib/typedModel/regexes";
import { MAX_INK_POINTS, MAX_LIVE_DRAG_NODES } from "../lib/whiteboard/limits";
import type { WhiteboardLiveState } from "../methods/setWhiteboardLive";
import { registerPeriodicCleanupHook } from "./garbage-collection";
import WhiteboardPresence from "./models/WhiteboardPresence";
import serverId from "./serverId";
import { inRange, isInkPoint } from "./whiteboardEdits";

// Live updates arrive several times a second per person, so remember which
// boards each connection may write to rather than checking membership on
// every call.
const MEMBERSHIP_TTL = 60 * 1000;
interface ConnectionState {
  boards: Map<string, { hunt: string; until: number }>;
  validatedDrag: string;
  // How many times each board's presence subscription has stopped, and
  // whether the connection has gone. An update that was already under way
  // when either cleanup ran takes its document back out.
  stops: Map<string, number>;
  closed: boolean;
}
const connections = new Map<string, ConnectionState>();

function connectionState(connection: Meteor.Connection): ConnectionState {
  const existing = connections.get(connection.id);
  if (existing) return existing;
  const state: ConnectionState = {
    boards: new Map(),
    validatedDrag: "",
    stops: new Map(),
    closed: false,
  };
  connections.set(connection.id, state);
  connection.onClose(() => {
    state.closed = true;
    connections.delete(connection.id);
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

async function boardHuntIfMember(
  userId: string,
  boardId: string,
  state: ConnectionState,
): Promise<string> {
  // Keyed by user too, so logging in as someone else on the same connection
  // doesn't inherit the previous user's access.
  const key = `${userId}:${boardId}`;
  const cached = state.boards.get(key);
  if (cached && cached.until > Date.now()) return cached.hunt;

  const board = await Whiteboards.findOneAsync(boardId);
  const user = await MeteorUsers.findOneAsync(userId);
  if (!board || !user?.hunts?.includes(board.hunt)) {
    throw new Meteor.Error(403, "Not a member of this hunt");
  }
  state.boards.set(key, {
    hunt: board.hunt,
    until: Date.now() + MEMBERSHIP_TTL,
  });
  return board.hunt;
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

  const hunt = await boardHuntIfMember(userId, boardId, state);

  if (live.drag && live.drag.length > 0) {
    const ids = `${boardId}:${[...new Set(live.drag.map((d) => d.node))].toSorted().join(",")}`;
    if (ids !== state.validatedDrag) {
      const found = await WhiteboardNodes.find({
        _id: { $in: live.drag.map((d) => d.node) },
        board: boardId,
      }).countAsync();
      if (found !== new Set(live.drag.map((d) => d.node)).size) {
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
      drag: live.drag,
      stroke: live.stroke,
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
