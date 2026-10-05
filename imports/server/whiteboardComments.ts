import ChatMessages from "../lib/models/ChatMessages";
import type { WhiteboardNodeType } from "../lib/models/WhiteboardNodes";
import WhiteboardNodes from "../lib/models/WhiteboardNodes";
import { CARD_HEIGHT, CARD_WIDTH } from "../lib/whiteboard/layout";
import { MAX_FRAME_DEPTH } from "../lib/whiteboard/limits";

// Taking comment pins off nodes and putting them back. It imports no other
// whiteboard server module, so placement in whiteboard.ts can use it as well
// as edits and restores.

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
