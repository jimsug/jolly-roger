import { Meteor } from "meteor/meteor";
import Flags from "../Flags";
import Hunts from "../lib/models/Hunts";
import MeteorUsers from "../lib/models/MeteorUsers";
import WhiteboardNodes from "../lib/models/WhiteboardNodes";
import Whiteboards from "../lib/models/Whiteboards";
import { whiteboardAccess } from "../lib/permission_stubs";
import { MAX_COORDINATE } from "../lib/whiteboard/limits";
import { assertWhiteboardEnabled } from "./whiteboard";

// The permission gates and helpers the other whiteboard modules use. Of
// those modules it imports only whiteboard.ts, which imports only
// whiteboardComments.ts, a leaf that imports no other whiteboard server
// module, so there's no cycle.

export const inRange = (n: number) =>
  Number.isFinite(n) && Math.abs(n) <= MAX_COORDINATE;

// [x, y, pressure] on the board, with the pressure between 0 and 1.
export function isInkPoint(point: number[]) {
  const [x = Number.NaN, y = Number.NaN, pressure = Number.NaN] = point;
  return (
    point.length === 3 &&
    inRange(x) &&
    inRange(y) &&
    pressure >= 0 &&
    pressure <= 1
  );
}

export const lockedError = () => new Meteor.Error(403, "That's locked");

export const tooMuchInkError = () =>
  new Meteor.Error(400, "This board has as much drawing as it can hold");

// How many points the ink on a board holds, for MAX_INK_POINTS_PER_BOARD.
// Summed by the database, so the points aren't sent here, though it still
// reads every ink document on the board to count them.
export async function inkPointsOnBoard(boardId: string) {
  const [result] = await WhiteboardNodes.collection
    .rawCollection()
    .aggregate<{ total: number }>([
      { $match: { board: boardId, type: "ink" } },
      {
        $group: {
          _id: null,
          total: { $sum: { $size: { $ifNull: ["$points", []] } } },
        },
      },
    ])
    .toArray();
  return result?.total ?? 0;
}

// The board, for a publication of its contents: only for a member of its
// hunt, and not while disable.whiteboard is on. Otherwise undefined.
export async function boardForMember(userId: string | null, boardId: string) {
  if (!userId) return undefined;
  const board = await Whiteboards.findOneAsync(boardId);
  if (!board) return undefined;
  const user = await MeteorUsers.findOneAsync(userId);
  if (!user?.hunts?.includes(board.hunt)) return undefined;
  if (await Flags.activeAsync("disable.whiteboard")) return undefined;
  return board;
}

// What a lock stops on a node. Folding a frame changes no geometry, so it's
// still allowed.
export const LOCKED_FIELDS = [
  "position",
  "parent",
  "width",
  "height",
  "text",
  "label",
  "color",
  "hidden",
] as const;

const archived = () => new Meteor.Error(403, "This hunt is archived");

// Finds the board by its id, or by the puzzle behind it, and works out what
// the caller may do on it. Read fresh on every call, so a change to the edit
// policy, the hunt or the caller's roles applies to the next one.
export async function loadBoardAccess(
  userId: string,
  selector: string | { puzzle: string },
) {
  await assertWhiteboardEnabled();
  const board = await Whiteboards.findOneAsync(selector);
  if (!board) {
    throw new Meteor.Error(404, "Unknown whiteboard");
  }
  // One read of the user serves both the membership check and the access,
  // so the two can't disagree.
  const user = await MeteorUsers.findOneAsync(userId, {
    projection: { roles: 1, hunts: 1 },
  });
  if (!user?.hunts?.includes(board.hunt)) {
    throw new Meteor.Error(
      403,
      `User ${userId} is not a member of hunt ${board.hunt}`,
    );
  }
  const hunt = await Hunts.findOneAsync(board.hunt);
  if (!hunt) {
    throw new Meteor.Error(404, "Unknown hunt");
  }
  const { access, reason } = whiteboardAccess(user, hunt, board);
  return { board, hunt, user, access, reason };
}

// Comments, replies, reactions and resolving are open to everyone in the
// hunt, whatever the edit policy, until the hunt is archived.
export async function assertMayCommentOnBoard(
  userId: string,
  selector: string | { puzzle: string },
) {
  const loaded = await loadBoardAccess(userId, selector);
  if (loaded.access === "view") throw archived();
  return loaded;
}

export async function assertMayEditBoard(
  userId: string,
  selector: string | { puzzle: string },
) {
  const loaded = await assertMayCommentOnBoard(userId, selector);
  if (loaded.access !== "edit") {
    throw new Meteor.Error(
      403,
      loaded.reason === "operatorsAndEditors"
        ? "Only operators and people they've chosen can edit this whiteboard"
        : "Only operators can edit this whiteboard",
    );
  }
  return loaded;
}
