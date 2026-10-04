import { Meteor } from "meteor/meteor";
import ChatMessages from "../lib/models/ChatMessages";
import Hunts from "../lib/models/Hunts";
import MeteorUsers from "../lib/models/MeteorUsers";
import type { WhiteboardNodeType } from "../lib/models/WhiteboardNodes";
import WhiteboardNodes from "../lib/models/WhiteboardNodes";
import Whiteboards from "../lib/models/Whiteboards";
import { whiteboardAccess } from "../lib/permission_stubs";
import { CARD_HEIGHT, CARD_WIDTH } from "../lib/whiteboard/layout";
import { MAX_COORDINATE, MAX_FRAME_DEPTH } from "../lib/whiteboard/limits";
import { assertWhiteboardEnabled } from "./whiteboard";

// The permission gates and helpers the other whiteboard modules use. Of
// those modules it imports only whiteboard.ts, which imports none of the
// others, so there's no cycle.

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

async function absolutePosition(node: WhiteboardNodeType) {
  let { x, y } = node.position;
  let parentId = node.parent;
  for (let depth = 0; parentId && depth <= MAX_FRAME_DEPTH; depth++) {
    const parent = await WhiteboardNodes.findOneAsync(parentId);
    if (!parent) break;
    x += parent.position.x;
    y += parent.position.y;
    parentId = parent.parent;
  }
  return { x, y };
}

const clampOffset = (offset: number, size: number | undefined) =>
  size === undefined ? offset : Math.min(Math.max(offset, 0), size);

// A node's width and height as drawn, where they're known.
const nodeSize = (node: WhiteboardNodeType) => ({
  width: node.width ?? (node.type === "puzzle" ? CARD_WIDTH : undefined),
  height: node.height ?? (node.type === "puzzle" ? CARD_HEIGHT : undefined),
});

// Comments on a node that's going away stay where they were on the board as
// free pins, remembering the node so a restore can put them back on it.
export async function detachComments(
  puzzleId: string,
  node: WhiteboardNodeType,
) {
  // The comment predicate lets Mongo use the partial {puzzle, comment.node}
  // index, which it can't infer from comment.node alone.
  const comments = await ChatMessages.find({
    puzzle: puzzleId,
    comment: { $exists: true },
    "comment.node": node._id,
  }).fetchAsync();
  if (comments.length === 0) return;
  const origin = await absolutePosition(node);
  // Pins are drawn with their offset kept inside the node (see
  // commentPosition), so a node that has shrunk leaves them on its edge.
  const { width, height } = nodeSize(node);
  for (const message of comments) {
    if (!message.comment) continue;
    await ChatMessages.updateAsync(
      { _id: message._id, "comment.node": node._id },
      {
        $set: {
          "comment.x": origin.x + clampOffset(message.comment.x, width),
          "comment.y": origin.y + clampOffset(message.comment.y, height),
          "comment.detachedFrom": node._id,
        },
        $unset: { "comment.node": 1 },
      },
    );
  }
}

// Puts free pins that came off a node (under any of the ids in from) back on
// it, where they are on the board, kept inside it.
export async function reattachComments(
  puzzleId: string,
  node: WhiteboardNodeType,
  from: string[],
) {
  const comments = await ChatMessages.find({
    puzzle: puzzleId,
    comment: { $exists: true },
    "comment.detachedFrom": { $in: from },
    "comment.node": { $exists: false },
  }).fetchAsync();
  if (comments.length === 0) return;
  const origin = await absolutePosition(node);
  const { width, height } = nodeSize(node);
  for (const message of comments) {
    if (!message.comment) continue;
    await ChatMessages.updateAsync(
      {
        _id: message._id,
        "comment.detachedFrom": message.comment.detachedFrom,
        "comment.node": { $exists: false },
      },
      {
        $set: {
          "comment.node": node._id,
          "comment.x": clampOffset(message.comment.x - origin.x, width),
          "comment.y": clampOffset(message.comment.y - origin.y, height),
        },
        $unset: { "comment.detachedFrom": 1 },
      },
    );
  }
}
