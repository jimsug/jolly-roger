import { Match } from "meteor/check";
import { Meteor } from "meteor/meteor";
import isReaction from "../lib/isReaction";
import type { ChatMessageType } from "../lib/models/ChatMessages";
import ChatMessages from "../lib/models/ChatMessages";
import ChatNotifications from "../lib/models/ChatNotifications";
import Hunts from "../lib/models/Hunts";
import MeteorUsers from "../lib/models/MeteorUsers";
import Puzzles from "../lib/models/Puzzles";
import { Id } from "../lib/models/regexes";
import type { WhiteboardEdgeType } from "../lib/models/WhiteboardEdges";
import WhiteboardEdges, {
  WhiteboardArrowHeads,
  WhiteboardPathStyles,
} from "../lib/models/WhiteboardEdges";
import type { WhiteboardNodeType } from "../lib/models/WhiteboardNodes";
import WhiteboardNodes, {
  WhiteboardColours,
  WhiteboardNodeKinds,
  WhiteboardStrokeWidths,
} from "../lib/models/WhiteboardNodes";
import Whiteboards from "../lib/models/Whiteboards";
import { userMayWritePuzzlesForHunt } from "../lib/permission_stubs";
import isWhiteboardPuzzle from "../lib/whiteboard/isWhiteboardPuzzle";
import { CARD_HEIGHT, CARD_WIDTH } from "../lib/whiteboard/layout";
import {
  MAX_BATCH,
  MAX_CONTRIBUTORS,
  MAX_COORDINATE,
  MAX_DIMENSION,
  MAX_EDGES_PER_BOARD,
  MAX_INK_POINTS,
  MAX_LABEL_LENGTH,
  MAX_NODES_PER_BOARD,
  MAX_TEXT_LENGTH,
  POINT_SIZE,
} from "../lib/whiteboard/limits";
import type { CommentAnchorInput } from "../methods/sendChatMessage";
import type { WhiteboardEdgeInput } from "../methods/upsertWhiteboardEdges";
import type { WhiteboardNodeInput } from "../methods/upsertWhiteboardNodes";
import { assertWhiteboardEnabled } from "./whiteboard";

export const NodeInputPattern = {
  _id: String,
  type: Match.Optional(Match.OneOf(...WhiteboardNodeKinds)),
  puzzle: Match.Optional(String),
  position: Match.Optional({ x: Number, y: Number }),
  parent: Match.Optional(Match.OneOf(String, null)),
  width: Match.Optional(Number),
  height: Match.Optional(Number),
  hidden: Match.Optional(Boolean),
  text: Match.Optional(Match.OneOf(String, null)),
  label: Match.Optional(Match.OneOf(String, null)),
  colour: Match.Optional(Match.OneOf(...WhiteboardColours)),
  points: Match.Optional([[Number]]),
  strokeWidth: Match.Optional(Match.OneOf(...WhiteboardStrokeWidths)),
  stroke: Match.Optional(String),
};

export const EdgeInputPattern = {
  _id: String,
  source: Match.Optional(String),
  target: Match.Optional(String),
  label: Match.Optional(Match.OneOf(String, null)),
  pathStyle: Match.Optional(Match.OneOf(...WhiteboardPathStyles)),
  arrowHead: Match.Optional(Match.OneOf(...WhiteboardArrowHeads)),
  colour: Match.Optional(Match.OneOf(...WhiteboardColours)),
  dashed: Match.Optional(Boolean),
};

// Types whose content belongs to whoever wrote it.
const NATIVE_TYPES = new Set(["frame", "sticky", "text", "ink"]);

// Ink is split into segments and points are a line's loose end, so neither is
// something a comment can sensibly hang off.
const UNCOMMENTABLE_TYPES = new Set(["ink", "point"]);

const badRequest = (message: string) => new Meteor.Error(400, message);

function assertId(id: string, what: string) {
  if (!Id.test(id)) throw badRequest(`Invalid ${what} id`);
}

function assertCoordinate(n: number) {
  if (!Number.isFinite(n) || Math.abs(n) > MAX_COORDINATE) {
    throw badRequest("Coordinate out of range");
  }
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
  points.forEach((point) => {
    if (point.length !== 3) throw badRequest("Invalid ink point");
    const [x, y, pressure] = point as [number, number, number];
    assertCoordinate(x);
    assertCoordinate(y);
    if (!Number.isFinite(pressure) || pressure < 0 || pressure > 1) {
      throw badRequest("Invalid ink pressure");
    }
  });
}

export async function assertMayWriteBoard(userId: string, boardId: string) {
  await assertWhiteboardEnabled();
  const board = await Whiteboards.findOneAsync(boardId);
  if (!board) {
    throw new Meteor.Error(404, "Unknown whiteboard");
  }
  const user = await MeteorUsers.findOneAsync(userId);
  if (!user?.hunts?.includes(board.hunt)) {
    throw new Meteor.Error(403, "Not a member of this hunt");
  }
  const hunt = await Hunts.findOneAsync(board.hunt);
  if (!hunt) {
    throw new Meteor.Error(404, "Unknown hunt");
  }
  if (hunt.isArchived) {
    throw new Meteor.Error(403, "This hunt is archived");
  }
  return { board, hunt };
}

// Parents must be frames on the same board, and a frame can't end up inside
// itself.
async function assertValidParent(
  boardId: string,
  nodeId: string,
  parentId: string,
) {
  let current = await WhiteboardNodes.findOneAsync(parentId);
  if (!current || current.board !== boardId || current.type !== "frame") {
    throw badRequest("Parent must be a frame on this board");
  }
  for (let depth = 0; current; depth++) {
    if (current._id === nodeId || depth > 64) {
      throw badRequest("A frame can't contain itself");
    }
    current = current.parent
      ? await WhiteboardNodes.findOneAsync(current.parent)
      : undefined;
  }
}

function appendContributor(
  existing: WhiteboardNodeType["contributors"] | undefined,
  userId: string,
) {
  const log = [...(existing ?? []), { user: userId, at: new Date() }];
  if (log.length <= MAX_CONTRIBUTORS) return log;
  // Keep the creator, and the most recent edits after them.
  return [log[0]!, ...log.slice(-(MAX_CONTRIBUTORS - 1))];
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
      await assertValidParent(existing.board, existing._id, input.parent);
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
    const next = value === null || value.trim() === "" ? undefined : value;
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
  if (input.colour !== undefined && input.colour !== existing.colour) {
    $set.colour = input.colour;
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
  if (input.type === "ink") {
    if (!input.points || !input.strokeWidth) {
      throw badRequest("Ink needs points and a stroke width");
    }
  }

  const text =
    typeof input.text === "string" && input.text.trim() !== ""
      ? input.text
      : undefined;
  const label =
    typeof input.label === "string" && input.label.trim() !== ""
      ? input.label
      : undefined;

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
    colour: input.type === "point" ? undefined : input.colour,
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

  const existingNodes: WhiteboardNodeType[] = await WhiteboardNodes.find({
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
  const points = await WhiteboardNodes.find({
    _id: { $in: ids },
    board: boardId,
    type: "point",
  }).fetchAsync();
  for (const point of points) {
    const used = await WhiteboardEdges.find({
      board: boardId,
      $or: [{ source: point._id }, { target: point._id }],
    }).countAsync();
    if (used === 0) await WhiteboardNodes.removeAsync(point._id);
  }
}

async function absolutePosition(node: WhiteboardNodeType) {
  let { x, y } = node.position;
  let parentId = node.parent;
  for (let depth = 0; parentId && depth <= 64; depth++) {
    const parent = await WhiteboardNodes.findOneAsync(parentId);
    if (!parent) break;
    x += parent.position.x;
    y += parent.position.y;
    parentId = parent.parent;
  }
  return { x, y };
}

// Comments on a node that's going away stay where they were on the board as
// free pins.
async function detachComments(puzzleId: string, node: WhiteboardNodeType) {
  // The comment predicate lets Mongo use the partial {puzzle, comment.node}
  // index, which it can't infer from comment.node alone.
  const comments: ChatMessageType[] = await ChatMessages.find({
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
  const within = (offset: number, size: number | undefined) =>
    size === undefined ? offset : Math.min(Math.max(offset, 0), size);
  for (const message of comments) {
    if (!message.comment) continue;
    await ChatMessages.updateAsync(
      { _id: message._id, "comment.node": node._id },
      {
        $set: {
          "comment.x": origin.x + within(message.comment.x, width),
          "comment.y": origin.y + within(message.comment.y, height),
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
      (node.type === "frame" && (node.tag || node.frameKind === "ungrouped"));
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

  const existingEdges: WhiteboardEdgeType[] = await WhiteboardEdges.find({
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
    const label =
      typeof input.label === "string" && input.label.trim() !== ""
        ? input.label
        : undefined;
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
      const style = ["pathStyle", "arrowHead", "colour", "dashed"] as const;
      style.forEach((field) => {
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
        colour: input.colour,
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

// Checks a new comment's pin before it's sent. It has to be on the board
// behind puzzleId, either loose or on a node that's still showing.
export async function assertValidCommentAnchor(
  userId: string,
  puzzleId: string,
  anchor: CommentAnchorInput,
) {
  const board = await Whiteboards.findOneAsync({ puzzle: puzzleId });
  if (!board) {
    throw new Meteor.Error(404, "Unknown whiteboard");
  }
  await assertMayWriteBoard(userId, board._id);
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
  const board = await Whiteboards.findOneAsync({ puzzle: message.puzzle });
  if (!board) {
    throw new Meteor.Error(404, "Unknown comment");
  }
  const { hunt } = await assertMayWriteBoard(userId, board._id);
  return { message, comment: message.comment, hunt };
}

export async function setCommentResolved(
  userId: string,
  messageId: string,
  resolved: boolean,
) {
  if (!resolved) {
    await rootCommentForWrite(userId, messageId);
    await ChatMessages.updateAsync(messageId, {
      $unset: { "comment.resolvedAt": 1, "comment.resolvedBy": 1 },
    });
    return;
  }

  // A partial $set on comment only passes the schema with x and y included,
  // so they're written back as read, and only if nothing (like a node being
  // deleted) has moved the pin in the meantime.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { comment } = await rootCommentForWrite(userId, messageId);
    if (comment.resolvedAt) return;
    const updated = await ChatMessages.updateAsync(
      {
        _id: messageId,
        "comment.node": comment.node ?? { $exists: false },
        "comment.x": comment.x,
        "comment.y": comment.y,
        "comment.resolvedAt": { $exists: false },
      },
      {
        $set: {
          "comment.x": comment.x,
          "comment.y": comment.y,
          "comment.resolvedAt": new Date(),
          "comment.resolvedBy": userId,
        },
      },
    );
    if (updated > 0) return;
  }
  throw new Meteor.Error(409, "The comment changed while resolving it");
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
