import { Match } from "meteor/check";
import { Meteor } from "meteor/meteor";
import type { Mongo } from "meteor/mongo";
import isReaction from "../lib/isReaction";
import ChatMessages from "../lib/models/ChatMessages";
import ChatNotifications from "../lib/models/ChatNotifications";
import Puzzles from "../lib/models/Puzzles";
import WhiteboardEdges, {
  LINE_STYLE_FIELDS,
} from "../lib/models/WhiteboardEdges";
import type {
  WhiteboardContributorType,
  WhiteboardNodeType,
} from "../lib/models/WhiteboardNodes";
import WhiteboardNodes from "../lib/models/WhiteboardNodes";
import { userMayWritePuzzlesForHunt } from "../lib/permission_stubs";
import { Id } from "../lib/typedModel/regexes";
import type { InkPoint } from "../lib/whiteboard/ink";
import isWhiteboardPuzzle from "../lib/whiteboard/isWhiteboardPuzzle";
import { POINT_SIZE } from "../lib/whiteboard/layout";
import {
  MAX_BATCH,
  MAX_CONTRIBUTORS,
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
import { deferSyncRoundsOnBoard } from "./whiteboard";
import { detachComments } from "./whiteboardComments";
import {
  assertMayCommentOnBoard,
  assertMayEditBoard,
  inRange,
  isInkPoint,
  LOCKED_FIELDS,
  lockedError,
} from "./whiteboardShared";
import { recordVersionBeforeEdit, withBoardLock } from "./whiteboardVersions";

// Types whose content belongs to whoever wrote it.
const NATIVE_TYPES = new Set(["frame", "sticky", "text", "ink"]);

// Ink is split into segments and points are a line's loose end, so neither is
// something a comment can sensibly hang off.
const UNCOMMENTABLE_TYPES = new Set(["ink", "point"]);

const badRequest = (message: string) => new Meteor.Error(400, message);

// An ink sample's shape, [x, y, pressure], for the methods' check(). Whether
// it's on the board is up to isInkPoint.
export const InkPointPattern = Match.Where(
  (point: unknown): point is InkPoint =>
    Array.isArray(point) &&
    point.length === 3 &&
    point.every((n) => typeof n === "number"),
);

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

async function assertPuzzlesLive(huntId: string, puzzleIds: string[]) {
  const ids = [...new Set(puzzleIds)];
  if (ids.length === 0) return;
  const live = await Puzzles.find({
    hunt: huntId,
    _id: { $in: ids },
  }).countAsync();
  if (live !== ids.length) {
    throw badRequest("That puzzle has been deleted");
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
  if (input.hidden === false) {
    $unset.hidden = "";
    $unset.hiddenWithPuzzle = "";
  }
  // Folding is a view of the frame, not an edit to it: it doesn't make the
  // frame manual or name anyone as a contributor.
  if (input.collapsed !== undefined) {
    if (input.collapsed) {
      $set.collapsed = true;
    } else {
      $unset.collapsed = "";
    }
  }

  // Locking isn't authorship either.
  if (input.locked === true && !existing.locked) {
    $set.locked = true;
    $set.lockedBy = userId;
  } else if (input.locked === false && existing.locked) {
    $unset.locked = "";
    $unset.lockedBy = "";
  }

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
  if (
    input.color !== undefined &&
    (input.color ?? undefined) !== existing.color
  ) {
    if (input.color === null) {
      $unset.color = "";
    } else {
      $set.color = input.color;
    }
    contentChanged = true;
  }

  if (contentChanged && NATIVE_TYPES.has(existing.type)) {
    $set.contributors = appendContributor(existing.contributors, userId);
  }

  if (Object.keys($set).length === 0 && Object.keys($unset).length === 0) {
    return;
  }
  // The lock checks read the node before this write, so a write they let
  // through on the strength of the lock only lands if the lock is still as
  // it was then: a node locked in the meantime keeps its locker and isn't
  // moved, and an unlock doesn't remove someone else's newer lock.
  const touchesLocked = LOCKED_FIELDS.some((f) => input[f] !== undefined);
  let selector: Mongo.Selector<WhiteboardNodeType> = { _id: existing._id };
  if (existing.locked && input.locked === false) {
    selector = {
      _id: existing._id,
      locked: true,
      ...(existing.lockedBy ? { lockedBy: existing.lockedBy } : {}),
    };
  } else if (!existing.locked && (touchesLocked || input.locked === true)) {
    selector = { _id: existing._id, locked: { $ne: true } };
  }
  const updated = await WhiteboardNodes.updateAsync(selector, {
    ...(Object.keys($set).length > 0 ? { $set } : {}),
    ...(Object.keys($unset).length > 0 ? { $unset } : {}),
  });
  if (updated === 0) {
    if (touchesLocked && (await WhiteboardNodes.findOneAsync(existing._id))) {
      throw lockedError();
    }
    return;
  }

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
    collapsed: input.type === "frame" && input.collapsed ? true : undefined,
    text: input.type === "sticky" || input.type === "text" ? text : undefined,
    color: input.type === "point" ? undefined : (input.color ?? undefined),
    points: input.type === "ink" ? input.points : undefined,
    strokeWidth: input.type === "ink" ? input.strokeWidth : undefined,
    stroke: input.type === "ink" ? input.stroke : undefined,
    contributors: NATIVE_TYPES.has(input.type)
      ? appendContributor([], userId)
      : [],
    createdBy: userId,
  });
}

// Rounding on the client can leave a kept-still position a fraction out.
const near = (a: number, b: number) => Math.abs(a - b) < 0.5;

// Resizing a frame from its top or left edge moves its origin, and the
// client keeps the frame's contents still by moving each child the other
// way. A locked child's new position is allowed when it's only that: its
// frame moves in the same batch and it stays where it was on the board.
function staysPutInMovedFrame(
  input: WhiteboardNodeInput,
  existing: WhiteboardNodeType,
  inputs: WhiteboardNodeInput[],
  existingById: Map<string, WhiteboardNodeType>,
) {
  if (
    !input.position ||
    !existing.parent ||
    LOCKED_FIELDS.some((f) => f !== "position" && input[f] !== undefined)
  ) {
    return false;
  }
  const parent = existingById.get(existing.parent);
  const parentInput = inputs.find((i) => i._id === existing.parent);
  if (!parent || !parentInput?.position || parentInput.parent !== undefined) {
    return false;
  }
  return (
    near(
      parent.position.x + existing.position.x,
      parentInput.position.x + input.position.x,
    ) &&
    near(
      parent.position.y + existing.position.y,
      parentInput.position.y + input.position.y,
    )
  );
}

// Checks a batch against locks before any of it is written, so a batch that
// touches something locked fails as a whole. Only nodes already on the board
// can be locked, and not a line's free end. Unlocking is for whoever locked
// the node, or an operator. A node being unlocked in the same input can be
// changed.
function assertLocksAllow(
  inputs: WhiteboardNodeInput[],
  existingById: Map<string, WhiteboardNodeType>,
  caller: { userId: string; operator: boolean },
) {
  inputs.forEach((input) => {
    const existing = existingById.get(input._id);
    if (
      input.locked !== undefined &&
      (!existing || existing.type === "point")
    ) {
      throw badRequest("That can't be locked");
    }
    if (!existing?.locked) return;
    if (input.locked === false) {
      if (existing.lockedBy !== caller.userId && !caller.operator) {
        throw new Meteor.Error(
          403,
          "Only the person who locked this, or an operator, can unlock it",
        );
      }
      return;
    }
    if (
      LOCKED_FIELDS.some((field) => input[field] !== undefined) &&
      !staysPutInMovedFrame(input, existing, inputs, existingById)
    ) {
      throw lockedError();
    }
  });
}

export async function upsertNodes(
  userId: string,
  boardId: string,
  inputs: WhiteboardNodeInput[],
) {
  const { board, hunt, user } = await assertMayEditBoard(userId, boardId);
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
  // Only frames fold: an existing node by its saved type, a new one by the
  // type it's given.
  if (
    inputs.some(
      (n) =>
        n.collapsed !== undefined &&
        (existingById.get(n._id)?.type ?? n.type) !== "frame",
    )
  ) {
    throw badRequest("Only frames can be collapsed");
  }
  assertLocksAllow(inputs, existingById, {
    userId,
    operator: userMayWritePuzzlesForHunt(user, hunt),
  });
  // A deleted puzzle's card stays off the board until the puzzle is back.
  const puttingBack = inputs.flatMap((input) => {
    const existing = existingById.get(input._id);
    return input.hidden === false && existing?.hidden && existing.puzzle
      ? [existing.puzzle]
      : [];
  });
  await assertPuzzlesLive(board.hunt, puttingBack);
  if (inserts.length > 0) {
    const count = await WhiteboardNodes.find({ board: boardId }).countAsync();
    if (count + inserts.length > MAX_NODES_PER_BOARD) {
      throw badRequest("This board is full");
    }
  }

  // Folding, opening, locking or unlocking on its own doesn't start a
  // version: none of them changes the layout, they're undone the way they
  // were done, and Collapse finished rounds sends a lot.
  const viewOnly = inputs.every(
    (input) =>
      (input.collapsed !== undefined || input.locked !== undefined) &&
      Object.keys(input).every(
        (key) => key === "_id" || key === "collapsed" || key === "locked",
      ),
  );
  if (!viewOnly) await recordVersionBeforeEdit(board, userId);
  for (const input of inputs) {
    const existing = existingById.get(input._id);
    if (existing) {
      await updateNode(userId, existing, input);
    } else {
      await insertNode(userId, board, input);
    }
  }

  // A round's frame that comes back takes its cards back with it.
  const restoredRounds = inputs.flatMap((input) => {
    const existing = existingById.get(input._id);
    return input.hidden === false &&
      existing?.type === "frame" &&
      existing.hidden &&
      existing.tag
      ? [existing.tag]
      : [];
  });
  deferSyncRoundsOnBoard(board.hunt, restoredRounds);
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

export async function deleteNodes(
  userId: string,
  boardId: string,
  nodeIds: string[],
) {
  const { board } = await assertMayEditBoard(userId, boardId);
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
  // Nothing is deleted if anything asked for is locked
  if ([...targets, ...strokeSegments].some((n) => n.locked)) {
    throw lockedError();
  }
  const ids = [...new Set([...targets, ...strokeSegments].map((n) => n._id))];
  await recordVersionBeforeEdit(board, userId);

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
      // A seeded frame that's put back comes back open. Taken off by a
      // person, it isn't hidden with its puzzle any more, so the puzzle
      // coming back doesn't put it back.
      await WhiteboardNodes.updateAsync(node._id, {
        $set: { hidden: true },
        $unset: {
          hiddenWithPuzzle: "",
          ...(node.type === "frame" ? { collapsed: "" } : {}),
        },
      });
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
  const { board } = await assertMayEditBoard(userId, boardId);
  if (inputs.length > MAX_BATCH) throw badRequest("Too many edges at once");

  const existingEdges = await WhiteboardEdges.find({
    _id: { $in: inputs.map((e) => e._id) },
  }).fetchAsync();
  const existingById = new Map(existingEdges.map((e) => [e._id, e]));
  if (existingEdges.some((e) => e.board !== boardId)) {
    throw new Meteor.Error(403, "Edge belongs to another board");
  }

  // Deleting a feeder arrow only hides it, so it can be put back; every
  // other line is really deleted, and nothing is hidden from here.
  if (
    inputs.some(
      (e) =>
        e.hidden !== undefined && (e.hidden || !existingById.get(e._id)?.auto),
    )
  ) {
    throw badRequest("Only a feeder arrow can be put back");
  }

  // So does a deleted puzzle's feeder arrow.
  await assertPuzzlesLive(
    board.hunt,
    inputs.flatMap((input) => {
      const existing = existingById.get(input._id);
      return input.hidden === false && existing?.hidden
        ? [existing.feeder, existing.meta].filter((id): id is string => !!id)
        : [];
    }),
  );

  const inserts = inputs.filter((e) => !existingById.has(e._id));
  if (inserts.length > 0) {
    const count = await WhiteboardEdges.find({ board: boardId }).countAsync();
    if (count + inserts.length > MAX_EDGES_PER_BOARD) {
      throw badRequest("This board has too many arrows");
    }
  }

  // A line's end can't come off a locked node, though the line can be
  // restyled and lines can still be drawn to it. Checked for the whole batch
  // before any of it is written.
  const leaving = inputs.flatMap((input) => {
    const existing = existingById.get(input._id);
    if (!existing) return [];
    return [
      ...(input.source && input.source !== existing.source
        ? [existing.source]
        : []),
      ...(input.target && input.target !== existing.target
        ? [existing.target]
        : []),
    ];
  });
  if (
    leaving.length > 0 &&
    (await WhiteboardNodes.find({
      _id: { $in: leaving },
      board: boardId,
      locked: true,
    }).countAsync()) > 0
  ) {
    throw lockedError();
  }

  await recordVersionBeforeEdit(board, userId);

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
      const $unset: Record<string, ""> = {};
      if (input.source) $set.source = input.source;
      if (input.target) $set.target = input.target;
      // Restyling or relabelling is authorship; moving an end isn't.
      let contentChanged = false;
      LINE_STYLE_FIELDS.forEach((field) => {
        const value = input[field];
        if (value === undefined || (value ?? undefined) === existing[field]) {
          return;
        }
        if (value === null) {
          $unset[field] = "";
        } else {
          $set[field] = value;
        }
        contentChanged = true;
      });
      if (label && label !== existing.label) {
        $set.label = label;
        contentChanged = true;
      }
      if (input.label !== undefined && !label && !!existing.label) {
        $unset.label = "";
        contentChanged = true;
      }
      if (input.hidden === false && existing.hidden) {
        $unset.hidden = "";
        $unset.hiddenWithPuzzle = "";
      }
      if (contentChanged && !existing.auto) {
        $set.contributors = appendContributor(existing.contributors, userId);
      }
      if (Object.keys($set).length === 0 && Object.keys($unset).length === 0) {
        continue;
      }
      await WhiteboardEdges.updateAsync(existing._id, {
        ...(Object.keys($set).length > 0 ? { $set } : {}),
        ...(Object.keys($unset).length > 0 ? { $unset } : {}),
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
        color: input.color ?? undefined,
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
  const { board } = await assertMayEditBoard(userId, boardId);
  if (edgeIds.length > MAX_BATCH) throw badRequest("Too many edges at once");
  await recordVersionBeforeEdit(board, userId);

  // Taken off by a person, an arrow isn't hidden with a puzzle any more, so
  // the puzzle coming back doesn't put it back.
  await WhiteboardEdges.updateAsync(
    { _id: { $in: edgeIds }, board: boardId, auto: true },
    { $set: { hidden: true }, $unset: { hiddenWithPuzzle: "" } },
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

// Locks or unlocks every frame on the board at once, seeded and hand-made,
// for operators settling the map. Locking takes the frames on show that
// aren't locked yet, with the caller as their locker: a frame already locked
// keeps its locker, and one taken off the board stays unlocked so it can be
// put back. Unlocking takes every locked frame. Records no version, since it
// changes no layout.
export async function setLayoutLocked(
  userId: string,
  boardId: string,
  locked: boolean,
) {
  const { hunt, user } = await assertMayEditBoard(userId, boardId);
  if (!userMayWritePuzzlesForHunt(user, hunt)) {
    throw new Meteor.Error(403, "Only operators can lock or unlock the layout");
  }
  await withBoardLock(boardId, async () => {
    if (locked) {
      await WhiteboardNodes.updateAsync(
        {
          board: boardId,
          type: "frame",
          hidden: { $ne: true },
          locked: { $ne: true },
        },
        { $set: { locked: true, lockedBy: userId } },
        { multi: true },
      );
    } else {
      await WhiteboardNodes.updateAsync(
        { board: boardId, type: "frame", locked: true },
        { $unset: { locked: "", lockedBy: "" } },
        { multi: true },
      );
    }
  });
}

// A reply (or reaction) that joins a comment thread adds to the board, so it
// needs a board that can be commented on, as a new comment does. A resolved
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
    await assertMayCommentOnBoard(userId, { puzzle: puzzleId });
  }
}

// Checks a new comment's pin before it's sent. It has to be on the board
// behind puzzleId, either loose or on a node that's still showing.
export async function assertValidCommentAnchor(
  userId: string,
  puzzleId: string,
  anchor: CommentAnchorInput,
) {
  const { board } = await assertMayCommentOnBoard(userId, {
    puzzle: puzzleId,
  });
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
  const { hunt, user } = await assertMayCommentOnBoard(userId, {
    puzzle: message.puzzle,
  });
  return { message, hunt, user };
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
  const { message, hunt, user } = await rootCommentForWrite(userId, messageId);
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
