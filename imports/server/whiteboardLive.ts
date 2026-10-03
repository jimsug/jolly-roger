import { Meteor } from "meteor/meteor";
import Flags from "../Flags";
import MeteorUsers from "../lib/models/MeteorUsers";
import { Id } from "../lib/models/regexes";
import WhiteboardNodes from "../lib/models/WhiteboardNodes";
import WhiteboardPresence from "../lib/models/WhiteboardPresence";
import Whiteboards from "../lib/models/Whiteboards";
import {
  MAX_COORDINATE,
  MAX_INK_POINTS,
  MAX_LIVE_DRAG_NODES,
} from "../lib/whiteboard/limits";
import type { WhiteboardLiveState } from "../methods/setWhiteboardLive";
import { registerPeriodicCleanupHook, serverId } from "./garbage-collection";

// Live updates arrive several times a second per person, so remember which
// boards each connection may write to rather than checking membership on
// every call.
const MEMBERSHIP_TTL = 60 * 1000;
interface ConnectionState {
  boards: Map<string, { hunt: string; until: number }>;
  validatedDrag: string;
}
const connections = new Map<string, ConnectionState>();

function connectionState(connection: Meteor.Connection): ConnectionState {
  let state = connections.get(connection.id);
  if (!state) {
    state = { boards: new Map(), validatedDrag: "" };
    connections.set(connection.id, state);
    connection.onClose(() => {
      connections.delete(connection.id);
      void WhiteboardPresence.removeAsync({ connection: connection.id });
    });
  }
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

const inRange = (n: number) =>
  Number.isFinite(n) && Math.abs(n) <= MAX_COORDINATE;

function validateLive({ cursor, drag, stroke }: WhiteboardLiveState) {
  const bad = () => new Meteor.Error(400, "Invalid live update");
  if (cursor && !(inRange(cursor.x) && inRange(cursor.y))) throw bad();
  if (drag) {
    if (drag.length > MAX_LIVE_DRAG_NODES) throw bad();
    drag.forEach((d) => {
      if (!Id.test(d.node) || !inRange(d.x) || !inRange(d.y)) throw bad();
      if (d.parent && !Id.test(d.parent)) throw bad();
    });
  }
  if (stroke) {
    if (!Id.test(stroke.id)) throw bad();
    if (stroke.points.length > MAX_INK_POINTS) throw bad();
    stroke.points.forEach((p) => {
      if (
        p.length !== 3 ||
        !inRange(p[0]) ||
        !inRange(p[1]) ||
        !Number.isFinite(p[2]) ||
        p[2] < 0 ||
        p[2] > 1
      ) {
        throw bad();
      }
    });
  }
}

export async function setLive(
  userId: string,
  connection: Meteor.Connection,
  boardId: string,
  live: WhiteboardLiveState,
) {
  if (
    (await Flags.activeAsync("disable.whiteboard")) ||
    (await Flags.activeAsync("disable.whiteboard_live"))
  ) {
    return;
  }
  validateLive(live);

  const state = connectionState(connection);
  const hunt = await boardHuntIfMember(userId, boardId, state);

  if (live.drag && live.drag.length > 0) {
    const ids = `${boardId}:${[...new Set(live.drag.map((d) => d.node))].sort().join(",")}`;
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

  // Only the caller's own connection's document is ever written.
  await WhiteboardPresence.upsertAsync(
    { board: boardId, connection: connection.id },
    {
      $set: {
        hunt,
        user: userId,
        server: serverId,
        cursor: live.cursor,
        drag: live.drag,
        stroke: live.stroke,
      },
    },
  );
}

export async function removePresence(boardId: string, connectionId: string) {
  await WhiteboardPresence.removeAsync({
    board: boardId,
    connection: connectionId,
  });
}

registerPeriodicCleanupHook(async (deadServers) => {
  await WhiteboardPresence.removeAsync({ server: { $in: deadServers } });
});
