import { Match } from "meteor/check";
import { Meteor } from "meteor/meteor";
import isReaction from "../lib/isReaction";
import ChatMessages from "../lib/models/ChatMessages";
import ChatNotifications from "../lib/models/ChatNotifications";
import Hunts from "../lib/models/Hunts";
import MeteorUsers from "../lib/models/MeteorUsers";
import Puzzles from "../lib/models/Puzzles";
import WhiteboardEdges, {
  LINE_STYLE_FIELDS,
} from "../lib/models/WhiteboardEdges";
import type {
  WhiteboardContributorType,
  WhiteboardNodeType,
} from "../lib/models/WhiteboardNodes";
import WhiteboardNodes from "../lib/models/WhiteboardNodes";
import Whiteboards from "../lib/models/Whiteboards";
import { userMayWritePuzzlesForHunt } from "../lib/permission_stubs";
import { Id } from "../lib/typedModel/regexes";
import type { InkPoint } from "../lib/whiteboard/ink";
import isWhiteboardPuzzle from "../lib/whiteboard/isWhiteboardPuzzle";
import { CARD_HEIGHT, CARD_WIDTH, POINT_SIZE } from "../lib/whiteboard/layout";
import {
  MAX_BATCH,
  MAX_CONTRIBUTORS,
  MAX_COORDINATE,
  MAX_DIMENSION,
  MAX_EDGES_PER_BOARD,
  MAX_FRAME_DEPTH,
  MAX_INK_POINTS,
  MAX_LABEL_LENGTH,
  MAX_NODES_PER_BOARD,
  MAX_TEXT_LENGTH,
} from "../lib/whiteboard/limits";
import type { CommentAnchorInput } from "../methods/sendChatMessage";
import type { WhiteboardEdgeInput } from "../methods/upsertWhiteboardEdges";
import type { WhiteboardNodeInput } from "../methods/upsertWhiteboardNodes";
import { assertHuntMember } from "./sendChatMessageInternal";
import { assertWhiteboardEnabled } from "./whiteboard";

// Types whose content belongs to whoever wrote it.
const NATIVE_TYPES = new Set(["frame", "sticky", "text", "ink"]);

// Ink is split into segments and points are a line's loose end, so neither is
// something a comment can sensibly hang off.
const UNCOMMENTABLE_TYPES = new Set(["ink", "point"]);

const badRequest = (message: string) => new Meteor.Error(400, message);

export const inRange = (n: number) =>
  Number.isFinite(n) && Math.abs(n) <= MAX_COORDINATE;

// An ink sample's shape, [x, y, pressure], for the methods' check(). Whether
// it's on the board is up to isInkPoint.
export const InkPointPattern = Match.Where(
  (point: unknown): point is InkPoint =>
    Array.isArray(point) &&
    point.length === 3 &&
    point.every((n) => typeof n === "number"),
);

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

// Blank text counts as none.
const nonBlank = (text: string | null | undefined) =>
  text?.trim() ? text : undefined;

function assertId(id: string, what: string) {
  if (!Id.test(id)) throw badRequest(`Invalid ${what} id`);
}

function assertCoordinate(n: number) {
  if (!inRange(n)) throw badRequest("Coordinate out of range");
}

function assertDimension(n: number) {
  if (!Number.isFinite(n) || n <= 0 || n > MAX_DIMENSION) {
    throw badRequest("Size out of range");
  }
}

function assertText(text: string, max: number) {
  if (text.length > max) throw badRequest("Text too long");
}

function validatePoints(points: number[][]) {
  if (points.length === 0 || points.length > MAX_INK_POINTS) {
    throw badRequest("Ink stroke has too many or too few points");
  }
  if (!points.every(isInkPoint)) throw badRequest("Invalid ink point");
}

// Finds the board by its id, or by the puzzle behind it.
async function assertMayWriteBoard(
  userId: string,
  selector: string | { puzzle: string },
) {
  await assertWhiteboardEnabled();
  const board = await Whiteboards.findOneAsync(selector);
  if (!board) {
    throw new Meteor.Error(404, "Unknown whiteboard");
  }
  await assertHuntMember(userId, board.hunt);
  const hunt = await Hunts.findOneAsync(board.hunt);
  if (!hunt) {
    throw new Meteor.Error(404, "Unknown hunt");
  }
  if (hunt.isArchived) {
    throw new Meteor.Error(403, "This hunt is archived");
  }
  return { board, hunt };
}

// How many frames a node inside parent would be in: parent and each frame
// above it. Infinity if the node would be inside itself, being parent or
// somewhere above it. A chain deeper than any board should have counts as a
// loop.
async function depthInside(
  nodeId: string,
  parent: WhiteboardNodeType | undefined,
) {
  let depth = 0;
  for (let current = parent; current; depth++) {
    if (current._id === nodeId || depth > MAX_FRAME_DEPTH) return Infinity;
    current = current.parent
      ? await WhiteboardNodes.findOneAsync(current.parent)
      : undefined;
  }
  return depth;
}

async function wouldContainItself(
  nodeId: string,
  parent: WhiteboardNodeType | undefined,
) {
  return (await depthInside(nodeId, parent)) === Infinity;
}

// How many levels of nodes sit inside a frame (0 for an empty one), counted
// no further than any board allows.
async function depthBelow(boardId: string, frameId: string) {
  let depth = 0;
  let level = [frameId];
  while (level.length > 0 && depth <= MAX_FRAME_DEPTH) {
    const children = await WhiteboardNodes.find(
      { board: boardId, parent: { $in: level } },
      { projection: { type: 1 } },
    ).fetchAsync();
    if (children.length === 0) break;
    depth += 1;
    level = children.filter((c) => c.type === "frame").map((c) => c._id);
  }
  return depth;
}

// Parents must be frames on the same board, a frame can't end up inside
// itself, and nothing can end up inside more than MAX_FRAME_DEPTH frames,
// counting the levels already inside the node (contentDepth).
async function assertValidParent(
  boardId: string,
  nodeId: string,
  parentId: string,
  contentDepth = 0,
) {
  const parent = await WhiteboardNodes.findOneAsync(parentId);
  if (!parent || parent.board !== boardId || parent.type !== "frame") {
    throw badRequest("Parent must be a frame on this board");
  }
  const depth = await depthInside(nodeId, parent);
  if (depth === Infinity) {
    throw badRequest("A frame can't contain itself");
  }
  if (depth + contentDepth > MAX_FRAME_DEPTH) {
    throw badRequest("Frames can't be nested that deeply");
  }
}

function appendContributor(
  existing: WhiteboardContributorType[] | undefined,
  userId: string,
) {
  const log = [...(existing ?? []), { user: userId, at: new Date() }];
  if (log.length <= MAX_CONTRIBUTORS) return log;
  // Keep the creator, and the most recent edits after them.
  return [...log.slice(0, 1), ...log.slice(-(MAX_CONTRIBUTORS - 1))];
}

function validateCommonFields(input: WhiteboardNodeInput) {
  assertId(input._id, "node");
  if (input.position) {
    assertCoordinate(input.position.x);
    assertCoordinate(input.position.y);
  }
  if (input.width !== undefined) assertDimension(input.width);
  if (input.height !== undefined) assertDimension(input.height);
  if (typeof input.text === "string") assertText(input.text, MAX_TEXT_LENGTH);
  if (typeof input.label === "string") {
    assertText(input.label, MAX_LABEL_LENGTH);
  }
  if (input.points) validatePoints(input.points);
  if (input.stroke !== undefined) assertId(input.stroke, "stroke");
}

async function updateNode(
  userId: string,
  existing: WhiteboardNodeType,
  input: WhiteboardNodeInput,
) {
  if (input.type && input.type !== existing.type) {
    throw badRequest("Can't change a node's type");
  }

  const $set: Record<string, unknown> = {};
  const $unset: Record<string, ""> = {};

  if (input.position) {
    $set.position = input.position;
    $set.manual = true;
  }
  if (input.parent !== undefined) {
    if (input.parent === null) {
      $unset.parent = "";
    } else {
      await assertValidParent(
        existing.board,
        existing._id,
        input.parent,
        existing.type === "frame"
          ? await depthBelow(existing.board, existing._id)
          : 0,
      );
      $set.parent = input.parent;
    }
    $set.manual = true;
  }
  if (existing.type !== "point") {
    if (input.width !== undefined) $set.width = input.width;
    if (input.height !== undefined) $set.height = input.height;
  }
  if (input.hidden === false) $unset.hidden = "";

  let contentChanged = false;
  const setContent = (
    field: "text" | "label",
    value: string | null | undefined,
  ) => {
    if (value === undefined) return;
    const next = nonBlank(value);
    if (next === existing[field]) return;
    contentChanged = true;
    if (next === undefined) {
      $unset[field] = "";
    } else {
      $set[field] = next;
    }
  };
  if (existing.type === "sticky" || existing.type === "text") {
    setContent("text", input.text);
  }
  if (existing.type === "frame") {
    setContent("label", input.label);
  }
  if (input.color !== undefined && input.color !== existing.color) {
    $set.color = input.color;
    contentChanged = true;
  }

  if (contentChanged && NATIVE_TYPES.has(existing.type)) {
    $set.contributors = appendContributor(existing.contributors, userId);
  }

  if (Object.keys($set).length === 0 && Object.keys($unset).length === 0) {
    return;
  }
  await WhiteboardNodes.updateAsync(existing._id, {
    ...(Object.keys($set).length > 0 ? { $set } : {}),
    ...(Object.keys($unset).length > 0 ? { $unset } : {}),
  });

  // The check above read the board before this write, so a concurrent move
  // may have put the new parent inside this frame since. The move that closes
  // the loop sees it here and is taken back. Only frames contain anything, so
  // only a frame's move can close one.
  const parent = $set.parent;
  if (
    existing.type === "frame" &&
    typeof parent === "string" &&
    parent !== existing.parent &&
    (await wouldContainItself(
      existing._id,
      await WhiteboardNodes.findOneAsync(parent),
    ))
  ) {
    await WhiteboardNodes.updateAsync(
      { _id: existing._id, parent },
      existing.parent
        ? { $set: { parent: existing.parent, position: existing.position } }
        : { $set: { position: existing.position }, $unset: { parent: "" } },
    );
    throw badRequest("A frame can't contain itself");
  }
}

async function insertNode(
  userId: string,
  board: { _id: string; hunt: string },
  input: WhiteboardNodeInput,
) {
  if (!input.type || !input.position) {
    throw badRequest("New nodes need a type and a position");
  }
  if (input.parent) {
    await assertValidParent(board._id, input._id, input.parent);
  }

  if (input.type === "puzzle") {
    if (!input.puzzle) throw badRequest("Puzzle cards need a puzzle");
    const puzzle = await Puzzles.findOneAsync(input.puzzle);
    if (!puzzle || puzzle.hunt !== board.hunt || isWhiteboardPuzzle(puzzle)) {
      throw badRequest("Unknown puzzle");
    }
  }
  if (input.type === "ink" && (!input.points || !input.strokeWidth)) {
    throw badRequest("Ink needs points and a stroke width");
  }

  const text = nonBlank(input.text);
  const label = nonBlank(input.label);

  await WhiteboardNodes.insertAsync({
    _id: input._id,
    hunt: board.hunt,
    board: board._id,
    type: input.type,
    position: input.position,
    parent: input.parent ?? undefined,
    width: input.type === "point" ? POINT_SIZE : input.width,
    height: input.type === "point" ? POINT_SIZE : input.height,
    manual: true,
    puzzle: input.type === "puzzle" ? input.puzzle : undefined,
    frameKind: input.type === "frame" ? "user" : undefined,
    label: input.type === "frame" ? label : undefined,
    text: input.type === "sticky" || input.type === "text" ? text : undefined,
    color: input.type === "point" ? undefined : input.color,
    points: input.type === "ink" ? input.points : undefined,
    strokeWidth: input.type === "ink" ? input.strokeWidth : undefined,
    stroke: input.type === "ink" ? input.stroke : undefined,
    contributors: NATIVE_TYPES.has(input.type)
      ? appendContributor([], userId)
      : [],
    createdBy: userId,
  });
}

export async function upsertNodes(
  userId: string,
  boardId: string,
  inputs: WhiteboardNodeInput[],
) {
  const { board } = await assertMayWriteBoard(userId, boardId);
  if (inputs.length > MAX_BATCH) throw badRequest("Too many nodes at once");
  inputs.forEach(validateCommonFields);

  const existingNodes = await WhiteboardNodes.find({
    _id: { $in: inputs.map((n) => n._id) },
  }).fetchAsync();
  const existingById = new Map(existingNodes.map((n) => [n._id, n]));
  if (existingNodes.some((n) => n.board !== boardId)) {
    throw new Meteor.Error(403, "Node belongs to another board");
  }

  const inserts = inputs.filter((n) => !existingById.has(n._id));
  // Check every new node is complete before writing anything, so a batch that
  // refers to a node someone else has just deleted fails as a whole.
  if (inserts.some((n) => !n.type || !n.position)) {
    throw badRequest("New nodes need a type and a position");
  }
  if (inserts.length > 0) {
    const count = await WhiteboardNodes.find({ board: boardId }).countAsync();
    if (count + inserts.length > MAX_NODES_PER_BOARD) {
      throw badRequest("This board is full");
    }
  }

  for (const input of inputs) {
    const existing = existingById.get(input._id);
    if (existing) {
      await updateNode(userId, existing, input);
    } else {
      await insertNode(userId, board, input);
    }
  }
}

// A line's free end only exists for that line. Once nothing uses it, it goes.
async function removeOrphanPoints(boardId: string, candidates: string[]) {
  const ids = [...new Set(candidates)];
  if (ids.length === 0) return;
  const edges = await WhiteboardEdges.find(
    {
      board: boardId,
      $or: [{ source: { $in: ids } }, { target: { $in: ids } }],
    },
    { projection: { source: 1, target: 1 } },
  ).fetchAsync();
  const used = new Set(edges.flatMap((e) => [e.source, e.target]));
  const unused = ids.filter((id) => !used.has(id));
  if (unused.length === 0) return;
  await WhiteboardNodes.removeAsync({
    _id: { $in: unused },
    board: boardId,
    type: "point",
  });
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

// Comments on a node that's going away stay where they were on the board as
// free pins.
async function detachComments(puzzleId: string, node: WhiteboardNodeType) {
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
  const width = node.width ?? (node.type === "puzzle" ? CARD_WIDTH : undefined);
  const height =
    node.height ?? (node.type === "puzzle" ? CARD_HEIGHT : undefined);
  for (const message of comments) {
    if (!message.comment) continue;
    await ChatMessages.updateAsync(
      { _id: message._id, "comment.node": node._id },
      {
        $set: {
          "comment.x": origin.x + clampOffset(message.comment.x, width),
          "comment.y": origin.y + clampOffset(message.comment.y, height),
        },
        $unset: { "comment.node": 1 },
      },
    );
  }
}

export async function deleteNodes(
  userId: string,
  boardId: string,
  nodeIds: string[],
) {
  const { board } = await assertMayWriteBoard(userId, boardId);
  if (nodeIds.length > MAX_BATCH) throw badRequest("Too many nodes at once");

  const targets = await WhiteboardNodes.find({
    _id: { $in: nodeIds },
    board: boardId,
  }).fetchAsync();
  const strokes = targets.flatMap((n) => (n.stroke ? [n.stroke] : []));
  const strokeSegments =
    strokes.length > 0
      ? await WhiteboardNodes.find({
          board: boardId,
          stroke: { $in: strokes },
        }).fetchAsync()
      : [];
  const ids = [...new Set([...targets, ...strokeSegments].map((n) => n._id))];

  const removed: string[] = [];
  for (const id of ids) {
    // Re-read each time: removing an earlier frame may have moved this node.
    const node = await WhiteboardNodes.findOneAsync(id);
    if (!node) continue;

    if (node.type === "frame") {
      // Children stay where they are on screen and move up to the frame's
      // parent (or the top level).
      const children = await WhiteboardNodes.find({
        board: boardId,
        parent: node._id,
      }).fetchAsync();
      for (const child of children) {
        await WhiteboardNodes.updateAsync(child._id, {
          $set: {
            position: {
              x: child.position.x + node.position.x,
              y: child.position.y + node.position.y,
            },
            ...(node.parent ? { parent: node.parent } : {}),
          },
          ...(node.parent ? {} : { $unset: { parent: "" } }),
        });
      }
    }

    // Comments on anything that leaves the board stay where they were, even
    // if it's only hidden: nothing shows pins on hidden nodes.
    if (!UNCOMMENTABLE_TYPES.has(node.type)) {
      await detachComments(board.puzzle, node);
    }
    const keep =
      node.type === "puzzle" ||
      (node.type === "frame" &&
        (node.tag !== undefined || node.frameKind === "ungrouped"));
    if (keep) {
      await WhiteboardNodes.updateAsync(node._id, { $set: { hidden: true } });
    } else {
      await WhiteboardNodes.removeAsync(node._id);
      removed.push(node._id);
    }
  }

  if (removed.length > 0) {
    const doomed = await WhiteboardEdges.find({
      board: boardId,
      $or: [{ source: { $in: removed } }, { target: { $in: removed } }],
    }).fetchAsync();
    await WhiteboardEdges.removeAsync({
      board: boardId,
      $or: [{ source: { $in: removed } }, { target: { $in: removed } }],
    });
    await removeOrphanPoints(
      boardId,
      doomed.flatMap((e) => [e.source, e.target]),
    );
  }
}

async function assertNodesOnBoard(boardId: string, nodeIds: string[]) {
  const found = await WhiteboardNodes.find({
    _id: { $in: nodeIds },
    board: boardId,
  }).countAsync();
  if (found !== new Set(nodeIds).size) {
    throw badRequest("Edges must join nodes on this board");
  }
}

export async function upsertEdges(
  userId: string,
  boardId: string,
  inputs: WhiteboardEdgeInput[],
) {
  const { board } = await assertMayWriteBoard(userId, boardId);
  if (inputs.length > MAX_BATCH) throw badRequest("Too many edges at once");

  const existingEdges = await WhiteboardEdges.find({
    _id: { $in: inputs.map((e) => e._id) },
  }).fetchAsync();
  const existingById = new Map(existingEdges.map((e) => [e._id, e]));
  if (existingEdges.some((e) => e.board !== boardId)) {
    throw new Meteor.Error(403, "Edge belongs to another board");
  }

  const inserts = inputs.filter((e) => !existingById.has(e._id));
  if (inserts.length > 0) {
    const count = await WhiteboardEdges.find({ board: boardId }).countAsync();
    if (count + inserts.length > MAX_EDGES_PER_BOARD) {
      throw badRequest("This board has too many arrows");
    }
  }

  for (const input of inputs) {
    assertId(input._id, "edge");
    if (typeof input.label === "string") {
      assertText(input.label, MAX_LABEL_LENGTH);
    }
    const label = nonBlank(input.label);
    const endpoints = [input.source, input.target].filter(
      (id): id is string => !!id,
    );
    if (endpoints.length > 0) await assertNodesOnBoard(boardId, endpoints);

    const existing = existingById.get(input._id);
    if (existing) {
      if (existing.auto && (input.source || input.target)) {
        throw badRequest("Feeder arrows follow their tags");
      }
      const source = input.source ?? existing.source;
      const target = input.target ?? existing.target;
      if (source === target)
        throw badRequest("A line needs two different ends");

      const $set: Record<string, unknown> = {};
      if (input.source) $set.source = input.source;
      if (input.target) $set.target = input.target;
      // Restyling or relabelling is authorship; moving an end isn't.
      let contentChanged = false;
      LINE_STYLE_FIELDS.forEach((field) => {
        if (input[field] !== undefined && input[field] !== existing[field]) {
          $set[field] = input[field];
          contentChanged = true;
        }
      });
      if (label && label !== existing.label) {
        $set.label = label;
        contentChanged = true;
      }
      const unsetLabel =
        input.label !== undefined && !label && !!existing.label;
      if (unsetLabel) contentChanged = true;
      if (contentChanged && !existing.auto) {
        $set.contributors = appendContributor(existing.contributors, userId);
      }
      if (Object.keys($set).length === 0 && !unsetLabel) continue;
      await WhiteboardEdges.updateAsync(existing._id, {
        ...(Object.keys($set).length > 0 ? { $set } : {}),
        ...(unsetLabel ? { $unset: { label: "" } } : {}),
      });
      // An end that moved off a free point leaves that point unused.
      await removeOrphanPoints(
        boardId,
        [existing.source, existing.target].filter(
          (id) => id !== source && id !== target,
        ),
      );
    } else {
      if (!input.source || !input.target || input.source === input.target) {
        throw badRequest("New arrows need two different ends");
      }
      await WhiteboardEdges.insertAsync({
        _id: input._id,
        hunt: board.hunt,
        board: boardId,
        source: input.source,
        target: input.target,
        label,
        pathStyle: input.pathStyle,
        arrowHead: input.arrowHead,
        color: input.color,
        dashed: input.dashed,
        contributors: appendContributor([], userId),
        createdBy: userId,
      });
    }
  }
}

export async function deleteEdges(
  userId: string,
  boardId: string,
  edgeIds: string[],
) {
  await assertMayWriteBoard(userId, boardId);
  if (edgeIds.length > MAX_BATCH) throw badRequest("Too many edges at once");

  await WhiteboardEdges.updateAsync(
    { _id: { $in: edgeIds }, board: boardId, auto: true },
    { $set: { hidden: true } },
    { multi: true },
  );
  const doomed = await WhiteboardEdges.find({
    _id: { $in: edgeIds },
    board: boardId,
    auto: { $ne: true },
  }).fetchAsync();
  await WhiteboardEdges.removeAsync({
    _id: { $in: edgeIds },
    board: boardId,
    auto: { $ne: true },
  });
  await removeOrphanPoints(
    boardId,
    doomed.flatMap((e) => [e.source, e.target]),
  );
}

// A reply (or reaction) that joins a comment thread adds to the board, so it
// needs a board that can be written to, as a new comment does. A resolved
// thread would otherwise reopen on a board nobody can resolve it on again.
export async function assertMayReplyInThread(
  userId: string,
  puzzleId: string,
  parentId: string,
) {
  const parent = await ChatMessages.findOneAsync(parentId, {
    projection: { puzzle: 1, comment: 1, thread: 1 },
  });
  if (parent?.puzzle === puzzleId && (parent.comment || parent.thread)) {
    await assertMayWriteBoard(userId, { puzzle: puzzleId });
  }
}

// Checks a new comment's pin before it's sent. It has to be on the board
// behind puzzleId, either loose or on a node that's still showing.
export async function assertValidCommentAnchor(
  userId: string,
  puzzleId: string,
  anchor: CommentAnchorInput,
) {
  const { board } = await assertMayWriteBoard(userId, { puzzle: puzzleId });
  assertCoordinate(anchor.x);
  assertCoordinate(anchor.y);
  if (anchor.node !== undefined) {
    const node = await WhiteboardNodes.findOneAsync(anchor.node);
    if (
      !node ||
      node.board !== board._id ||
      node.hidden ||
      UNCOMMENTABLE_TYPES.has(node.type)
    ) {
      throw badRequest("Comments can't be pinned there");
    }
  }
}

async function rootCommentForWrite(userId: string, messageId: string) {
  const message = await ChatMessages.findOneAsync(messageId);
  if (!message?.comment) {
    throw new Meteor.Error(404, "Unknown comment");
  }
  const { hunt } = await assertMayWriteBoard(userId, {
    puzzle: message.puzzle,
  });
  return { message, hunt };
}

export async function setCommentResolved(
  userId: string,
  messageId: string,
  resolved: boolean,
) {
  await rootCommentForWrite(userId, messageId);
  if (!resolved) {
    await ChatMessages.updateAsync(messageId, {
      $unset: { "comment.resolvedAt": 1, "comment.resolvedBy": 1 },
    });
    return;
  }

  // Resolving twice keeps the first resolution.
  await ChatMessages.updateAsync(
    { _id: messageId, "comment.resolvedAt": { $exists: false } },
    {
      $set: {
        "comment.resolvedAt": new Date(),
        "comment.resolvedBy": userId,
      },
    },
  );
}

// Authors can take back a comment until someone else replies to it. Operators
// can always delete one. The whole thread goes with it.
export async function deleteComment(userId: string, messageId: string) {
  const { message, hunt } = await rootCommentForWrite(userId, messageId);
  const user = await MeteorUsers.findOneAsync(userId);
  if (!userMayWritePuzzlesForHunt(user, hunt)) {
    if (message.sender !== userId) {
      throw new Meteor.Error(403, "Only its author can delete a comment");
    }
    const othersReplies = await ChatMessages.find({
      thread: messageId,
      sender: { $ne: userId },
    }).fetchAsync();
    if (othersReplies.some((reply) => !isReaction(reply))) {
      throw new Meteor.Error(
        403,
        "Someone has replied, so only an operator can delete this comment",
      );
    }
  }

  await ChatMessages.destroyAsync({
    $or: [{ _id: messageId }, { thread: messageId }],
  });
  await ChatNotifications.destroyAsync({ thread: messageId });
}
