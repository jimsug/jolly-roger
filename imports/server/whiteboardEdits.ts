import { Match } from "meteor/check";
import { Meteor } from "meteor/meteor";
import type { Mongo } from "meteor/mongo";
import isReaction from "../lib/isReaction";
import ChatMessages from "../lib/models/ChatMessages";
import ChatNotifications from "../lib/models/ChatNotifications";
import Puzzles from "../lib/models/Puzzles";
import type { WhiteboardEdgeType } from "../lib/models/WhiteboardEdges";
import WhiteboardEdges, {
  LINE_STYLE_FIELDS,
} from "../lib/models/WhiteboardEdges";
import type {
  WhiteboardContributorType,
  WhiteboardNodeType,
} from "../lib/models/WhiteboardNodes";
import WhiteboardNodes, {
  WhiteboardShapes,
} from "../lib/models/WhiteboardNodes";
import { userMayWritePuzzlesForHunt } from "../lib/permission_stubs";
import { Id } from "../lib/typedModel/regexes";
import type { InkPoint } from "../lib/whiteboard/ink";
import { inkPointCount, simplifyInk } from "../lib/whiteboard/ink";
import isWhiteboardPuzzle from "../lib/whiteboard/isWhiteboardPuzzle";
import { POINT_SIZE } from "../lib/whiteboard/layout";
import {
  MAX_BATCH,
  MAX_CONTRIBUTORS,
  MAX_DIMENSION,
  MAX_EDGES_PER_BOARD,
  MAX_FRAME_DEPTH,
  MAX_IMAGES_PER_BOARD,
  MAX_INK_POINTS,
  MAX_INK_POINTS_PER_BOARD,
  MAX_LABEL_LENGTH,
  MAX_NODES_PER_BOARD,
  MAX_TEXT_LENGTH,
} from "../lib/whiteboard/limits";
import type { CommentAnchorInput } from "../methods/sendChatMessage";
import type { WhiteboardEdgeInput } from "../methods/upsertWhiteboardEdges";
import type { WhiteboardNodeInput } from "../methods/upsertWhiteboardNodes";
import { assertStoredImages } from "./getS3UploadParams";
import { deferSyncRoundsOnBoard } from "./whiteboard";
import { detachComments } from "./whiteboardComments";
import {
  assertMayCommentOnBoard,
  assertMayEditBoard,
  inkPointsOnBoard,
  inRange,
  isInkPoint,
  LOCKED_FIELDS,
  lockedError,
  modifier,
  tooMuchInkError,
} from "./whiteboardShared";
import {
  recordVersionBeforeEdit,
  recordVersionUnderLock,
  withBoardLock,
} from "./whiteboardVersions";
import withLock from "./withLock";

// Types whose content belongs to whoever wrote it.
const NATIVE_TYPES = new Set([
  "frame",
  "sticky",
  "text",
  "ink",
  "image",
  "shape",
]);

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

// What a parent check needs to know about a node.
type ParentLink = Pick<WhiteboardNodeType, "_id" | "board" | "type" | "parent">;

const PARENT_LINK_PROJECTION = { board: 1, type: 1, parent: 1 } as const;

// The board as a batch would leave it, as far as parents go: nodes are read
// from the database, and those the batch has already been checked for are
// taken as it will write them. Checking a batch against this before writing
// any of it means a node late in the batch can't be refused after earlier
// ones have been written.
class PlannedParents {
  private readonly planned = new Map<string, ParentLink>();

  constructor(private readonly boardId: string) {}

  async get(id: string): Promise<ParentLink | undefined> {
    return (
      this.planned.get(id) ??
      (await WhiteboardNodes.findOneAsync(id, {
        projection: PARENT_LINK_PROJECTION,
      }))
    );
  }

  set(node: ParentLink) {
    this.planned.set(node._id, node);
  }

  // The nodes directly inside any of the frames in level.
  async childrenOf(level: string[]) {
    const inLevel = new Set(level);
    const stored = await WhiteboardNodes.find(
      { board: this.boardId, parent: { $in: level } },
      { projection: PARENT_LINK_PROJECTION },
    ).fetchAsync();
    return [
      ...stored.filter((node) => !this.planned.has(node._id)),
      ...[...this.planned.values()].filter(
        (node) => node.parent !== undefined && inLevel.has(node.parent),
      ),
    ];
  }
}

// How many frames a node inside parent would be in: parent and each frame
// above it. Infinity if the node would be inside itself, being parent or
// somewhere above it. A chain deeper than any board should have counts as a
// loop.
async function depthInside(
  nodeId: string,
  parent: ParentLink | undefined,
  nodes: PlannedParents,
) {
  let depth = 0;
  for (let current = parent; current; depth++) {
    if (current._id === nodeId || depth > MAX_FRAME_DEPTH) return Infinity;
    current = current.parent ? await nodes.get(current.parent) : undefined;
  }
  return depth;
}

// How many levels of nodes sit inside a frame (0 for an empty one), counted
// no further than any board allows.
async function depthBelow(frameId: string, nodes: PlannedParents) {
  let depth = 0;
  let level = [frameId];
  while (level.length > 0 && depth <= MAX_FRAME_DEPTH) {
    const children = await nodes.childrenOf(level);
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
  nodes: PlannedParents,
  boardId: string,
  nodeId: string,
  parentId: string,
  contentDepth = 0,
) {
  const parent = await nodes.get(parentId);
  if (!parent || parent.board !== boardId || parent.type !== "frame") {
    throw badRequest("Parent must be a frame on this board");
  }
  const depth = await depthInside(nodeId, parent, nodes);
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
  if (input.image) {
    assertDimension(input.image.width);
    assertDimension(input.image.height);
  }
}

const sameImage = (
  a: NonNullable<WhiteboardNodeInput["image"]>,
  b: WhiteboardNodeType["image"],
) => !!b && a.url === b.url && a.width === b.width && a.height === b.height;

// A node of a kind (image, shape) comes with its kind's field and a size,
// nothing else has that field, and it never changes once the node is on the
// board: an image stays the same image, a rectangle stays a rectangle.
// Returns the batch's new nodes of that kind.
function assertKindField(
  inputs: WhiteboardNodeInput[],
  existingById: Map<string, WhiteboardNodeType>,
  kind: "image" | "shape",
  same: (input: WhiteboardNodeInput, existing: WhiteboardNodeType) => boolean,
  messages: { only: string; changed: string; needs: string },
) {
  return inputs.filter((input) => {
    const existing = existingById.get(input._id);
    if (existing) {
      if (input[kind] === undefined) return false;
      if (existing.type !== kind) throw badRequest(messages.only);
      if (!same(input, existing)) throw badRequest(messages.changed);
      return false;
    }
    if (input.type === kind) {
      if (
        !input[kind] ||
        input.width === undefined ||
        input.height === undefined
      ) {
        throw badRequest(messages.needs);
      }
      return true;
    }
    if (input[kind] !== undefined) throw badRequest(messages.only);
    return false;
  });
}

// Returns how many images the batch adds, which the caller counts against
// the cap under the board's lock.
async function assertImagesAllowed(
  board: { _id: string; hunt: string },
  inputs: WhiteboardNodeInput[],
  existingById: Map<string, WhiteboardNodeType>,
) {
  const added = assertKindField(
    inputs,
    existingById,
    "image",
    (input, existing) =>
      !!input.image && sameImage(input.image, existing.image),
    {
      only: "Only image nodes have an image",
      changed: "An image can't be changed",
      needs: "Image nodes need an image and a size",
    },
  );
  await assertStoredImages(
    board.hunt,
    added.flatMap((input) => (input.image ? [input.image.url] : [])),
  );
  return added.length;
}

function assertShapesAllowed(
  inputs: WhiteboardNodeInput[],
  existingById: Map<string, WhiteboardNodeType>,
) {
  if (
    inputs.some(
      (input) =>
        input.shape !== undefined &&
        !WhiteboardShapes.some((s) => s === input.shape),
    )
  ) {
    throw badRequest("Unknown shape");
  }
  assertKindField(
    inputs,
    existingById,
    "shape",
    (input, existing) => input.shape === existing.shape,
    {
      only: "Only shape nodes have a shape",
      changed: "A shape can't be changed",
      needs: "Shape nodes need a shape and a size",
    },
  );
}

interface NodeUpdate {
  existing: WhiteboardNodeType;
  input: WhiteboardNodeInput;
}

const cardPuzzles = (inserts: NewNodeInput[]) =>
  inserts.flatMap((input) =>
    input.type === "puzzle" && input.puzzle ? [input.puzzle] : [],
  );

// A puzzle has one card on a board.
async function assertNoCardsFor(boardId: string, puzzleIds: string[]) {
  if (
    puzzleIds.length > 0 &&
    (await WhiteboardNodes.find({
      board: boardId,
      puzzle: { $in: puzzleIds },
    }).countAsync()) > 0
  ) {
    throw badRequest("That puzzle is already on the board");
  }
}

// The checks on each node that need the board: a node keeps its type, a
// parent is a frame on this board that doesn't put anything inside itself
// or too deep, a new card's puzzle is one of this hunt's and not on the
// board yet, and new ink has its points. Made for the whole batch, in the
// order it's written (new nodes, then changes), before any of it is.
async function assertNodesValid(
  board: { _id: string; hunt: string },
  inserts: NewNodeInput[],
  updates: NodeUpdate[],
) {
  const puzzleIds = cardPuzzles(inserts);
  if (new Set(puzzleIds).size !== puzzleIds.length) {
    throw badRequest("That puzzle is already on the board");
  }
  await assertNoCardsFor(board._id, puzzleIds);
  const puzzles = new Map(
    (puzzleIds.length > 0
      ? await Puzzles.find({ _id: { $in: puzzleIds } }).fetchAsync()
      : []
    ).map((p) => [p._id, p]),
  );

  const nodes = new PlannedParents(board._id);
  for (const input of inserts) {
    if (input.parent) {
      await assertValidParent(nodes, board._id, input._id, input.parent);
    }
    if (input.type === "puzzle") {
      if (!input.puzzle) throw badRequest("Puzzle cards need a puzzle");
      const puzzle = puzzles.get(input.puzzle);
      if (!puzzle || puzzle.hunt !== board.hunt || isWhiteboardPuzzle(puzzle)) {
        throw badRequest("Unknown puzzle");
      }
    }
    if (input.type === "ink" && (!input.points || !input.strokeWidth)) {
      throw badRequest("Ink needs points and a stroke width");
    }
    nodes.set({
      _id: input._id,
      board: board._id,
      type: input.type,
      parent: input.parent ?? undefined,
    });
  }
  for (const { existing, input } of updates) {
    if (input.type && input.type !== existing.type) {
      throw badRequest("Can't change a node's type");
    }
    if (input.parent === undefined) continue;
    if (input.parent !== null) {
      await assertValidParent(
        nodes,
        board._id,
        existing._id,
        input.parent,
        existing.type === "frame" ? await depthBelow(existing._id, nodes) : 0,
      );
    }
    nodes.set({
      _id: existing._id,
      board: existing.board,
      type: existing.type,
      parent: input.parent ?? undefined,
    });
  }
}

async function updateNode(
  userId: string,
  existing: WhiteboardNodeType,
  input: WhiteboardNodeInput,
) {
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

  const update = modifier($set, $unset);
  if (!update) return;
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
  const updated = await WhiteboardNodes.updateAsync(selector, update);
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
    (await depthInside(
      existing._id,
      await WhiteboardNodes.findOneAsync(parent),
      new PlannedParents(existing.board),
    )) === Infinity
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

type NewNodeInput = WhiteboardNodeInput &
  Required<Pick<WhiteboardNodeInput, "type" | "position">>;

const isNewNodeInput = (input: WhiteboardNodeInput): input is NewNodeInput =>
  !!input.type && !!input.position;

async function insertNode(
  userId: string,
  board: { _id: string; hunt: string },
  input: NewNodeInput,
) {
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
    image: input.type === "image" ? input.image : undefined,
    shape: input.type === "shape" ? input.shape : undefined,
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
// frame is resized in the same batch, an origin that moves keeps the
// opposite edge where it was (as a resize from that side does), and the
// child stays where it was on the board, measured against where the batch
// leaves the frame.
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
  const parentInputs = inputs.filter((i) => i._id === existing.parent);
  const position = parentInputs.findLast((i) => i.position)?.position;
  const width = parentInputs.findLast((i) => i.width !== undefined)?.width;
  const height = parentInputs.findLast((i) => i.height !== undefined)?.height;
  if (
    !parent ||
    !position ||
    parentInputs.some((i) => i.parent !== undefined) ||
    ((width === undefined || width === parent.width) &&
      (height === undefined || height === parent.height))
  ) {
    return false;
  }
  const keepsEdge = (
    from: number,
    to: number,
    size: number | undefined,
    newSize: number | undefined,
  ) => near(from, to) || near(from + (size ?? 0), to + (newSize ?? size ?? 0));
  if (
    !keepsEdge(parent.position.x, position.x, parent.width, width) ||
    !keepsEdge(parent.position.y, position.y, parent.height, height)
  ) {
    return false;
  }
  return (
    near(
      parent.position.x + existing.position.x,
      position.x + input.position.x,
    ) &&
    near(parent.position.y + existing.position.y, position.y + input.position.y)
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

// The nodes or lines among ids that are on the board already, by id. One on
// another board refuses the batch.
async function loadExisting<T extends { _id: string; board: string }>(
  model: {
    find(selector: { _id: { $in: string[] } }): { fetchAsync(): Promise<T[]> };
  },
  boardId: string,
  ids: string[],
  what: string,
) {
  const existing = await model.find({ _id: { $in: ids } }).fetchAsync();
  if (existing.some((doc) => doc.board !== boardId)) {
    throw new Meteor.Error(403, `${what} belongs to another board`);
  }
  return new Map(existing.map((doc) => [doc._id, doc]));
}

export async function upsertNodes(
  userId: string,
  boardId: string,
  sent: WhiteboardNodeInput[],
) {
  const { board, hunt, user } = await assertMayEditBoard(userId, boardId);
  if (sent.length > MAX_BATCH) throw badRequest("Too many nodes at once");
  sent.forEach(validateCommonFields);

  const existingById = await loadExisting(
    WhiteboardNodes,
    boardId,
    sent.map((n) => n._id),
    "Node",
  );
  // New ink is stored simplified (a saved stroke's points never change), and
  // counts towards the board's ink budget as stored.
  const inputs = sent.map((input) =>
    input.type === "ink" && input.points && !existingById.has(input._id)
      ? { ...input, points: simplifyInk(input.points) }
      : input,
  );

  const fresh = inputs.filter((n) => !existingById.has(n._id));
  if (new Set(fresh.map((n) => n._id)).size !== fresh.length) {
    throw badRequest("A new node can only be in a batch once");
  }
  const updates = inputs.flatMap((input): NodeUpdate[] => {
    const existing = existingById.get(input._id);
    return existing ? [{ existing, input }] : [];
  });
  const inserts = fresh.filter(isNewNodeInput);
  if (inserts.length !== fresh.length) {
    throw badRequest("New nodes need a type and a position");
  }
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
  assertShapesAllowed(inputs, existingById);
  const newImages = await assertImagesAllowed(board, inputs, existingById);
  await assertNodesValid(board, inserts, updates);

  if (inserts.length > 0) {
    // The caps are counted and the new nodes written under the board's
    // lock, so two batches at once can't both fit in the room for one.
    // Placement, resets and restores hold the same lock. A batch that waited
    // for it behind one of those checks again that it may still edit, that
    // the frames its new nodes go in are still there, and that placement
    // hasn't since put its puzzles on the board.
    const newInk = inkPointCount(inserts);
    const insertIds = new Set(inserts.map((n) => n._id));
    const outsideParents = [
      ...new Set(
        inserts.flatMap((n) =>
          n.parent && !insertIds.has(n.parent) ? [n.parent] : [],
        ),
      ),
    ];
    await withBoardLock(boardId, async (renew) => {
      await assertMayEditBoard(userId, boardId);
      if (
        outsideParents.length > 0 &&
        (await WhiteboardNodes.find({
          _id: { $in: outsideParents },
          board: boardId,
          type: "frame",
        }).countAsync()) !== outsideParents.length
      ) {
        throw badRequest("Parent must be a frame on this board");
      }
      await assertNoCardsFor(boardId, cardPuzzles(inserts));
      const count = await WhiteboardNodes.find({ board: boardId }).countAsync();
      if (count + inserts.length > MAX_NODES_PER_BOARD) {
        throw badRequest("This board is full");
      }
      if (newImages > 0) {
        const images = await WhiteboardNodes.find({
          board: boardId,
          type: "image",
        }).countAsync();
        if (images + newImages > MAX_IMAGES_PER_BOARD) {
          throw badRequest("This board can't take any more images");
        }
      }
      if (
        newInk > 0 &&
        (await inkPointsOnBoard(boardId)) + newInk > MAX_INK_POINTS_PER_BOARD
      ) {
        throw tooMuchInkError();
      }
      // This also checks the lock is still held: another server may have
      // taken it while this one counted.
      await recordVersionUnderLock(board, userId, "edits", renew);
      for (const input of inserts) {
        await insertNode(userId, board, input);
      }
    });
  } else {
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
  }
  for (const { existing, input } of updates) {
    await updateNode(userId, existing, input);
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

// Removes the lines selector picks out on the board, and the free ends that
// leaves unused.
async function removeEdgesAndOrphans(
  boardId: string,
  selector: Mongo.Selector<WhiteboardEdgeType>,
) {
  const doomed = await WhiteboardEdges.find(selector).fetchAsync();
  await WhiteboardEdges.removeAsync(selector);
  await removeOrphanPoints(
    boardId,
    doomed.flatMap((e) => [e.source, e.target]),
  );
}

// Puzzle cards and seeded frames are hidden rather than removed, so placement
// doesn't put them back. Deleting one segment of an ink stroke deletes the
// whole stroke.
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
    await removeEdgesAndOrphans(boardId, {
      board: boardId,
      $or: [{ source: { $in: removed } }, { target: { $in: removed } }],
    });
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

  const existingById = await loadExisting(
    WhiteboardEdges,
    boardId,
    inputs.map((e) => e._id),
    "Edge",
  );
  const newIds = inputs.flatMap((e) =>
    existingById.has(e._id) ? [] : [e._id],
  );
  if (new Set(newIds).size !== newIds.length) {
    throw badRequest("A new line can only be in a batch once");
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

  inputs.forEach((input) => {
    assertId(input._id, "edge");
    if (typeof input.label === "string") {
      assertText(input.label, MAX_LABEL_LENGTH);
    }
    const existing = existingById.get(input._id);
    if (existing) {
      if (existing.auto && (input.source || input.target)) {
        throw badRequest("Feeder arrows follow their tags");
      }
      if (
        (input.source ?? existing.source) === (input.target ?? existing.target)
      ) {
        throw badRequest("A line needs two different ends");
      }
    } else if (
      !input.source ||
      !input.target ||
      input.source === input.target
    ) {
      throw badRequest("New arrows need two different ends");
    }
  });
  const endpoints = inputs.flatMap((input) =>
    [input.source, input.target].filter((id): id is string => !!id),
  );
  if (endpoints.length > 0) await assertNodesOnBoard(boardId, endpoints);

  // A line's end can't come off a locked node, though the line can be
  // restyled and lines can still be drawn to it.
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

  const inserts = inputs.flatMap(({ source, target, ...input }) =>
    !existingById.has(input._id) && source && target
      ? [{ ...input, source, target }]
      : [],
  );
  if (inserts.length > 0) {
    // Counted and written under the board's lock, as upsertNodes does,
    // checking again that the nodes the new lines join are still there.
    const insertEnds = inserts.flatMap((e) => [e.source, e.target]);
    await withBoardLock(boardId, async (renew) => {
      await assertMayEditBoard(userId, boardId);
      await assertNodesOnBoard(boardId, insertEnds);
      const count = await WhiteboardEdges.find({ board: boardId }).countAsync();
      if (count + inserts.length > MAX_EDGES_PER_BOARD) {
        throw badRequest("This board has too many arrows");
      }
      await recordVersionUnderLock(board, userId, "edits", renew);
      for (const input of inserts) {
        await WhiteboardEdges.insertAsync({
          _id: input._id,
          hunt: board.hunt,
          board: boardId,
          source: input.source,
          target: input.target,
          label: nonBlank(input.label),
          pathStyle: input.pathStyle,
          arrowHead: input.arrowHead,
          color: input.color ?? undefined,
          dashed: input.dashed,
          contributors: appendContributor([], userId),
          createdBy: userId,
        });
      }
    });
  } else {
    await recordVersionBeforeEdit(board, userId);
  }

  for (const input of inputs) {
    const existing = existingById.get(input._id);
    if (!existing) continue;
    const label = nonBlank(input.label);
    const source = input.source ?? existing.source;
    const target = input.target ?? existing.target;
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
    const update = modifier($set, $unset);
    if (!update) continue;
    await WhiteboardEdges.updateAsync(existing._id, update);
    // An end that moved off a free point leaves that point unused.
    await removeOrphanPoints(
      boardId,
      [existing.source, existing.target].filter(
        (id) => id !== source && id !== target,
      ),
    );
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
  await removeEdgesAndOrphans(boardId, {
    _id: { $in: edgeIds },
    board: boardId,
    auto: { $ne: true },
  });
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
// can always delete one. The whole thread goes with it. Replies are written
// under the thread's lock (see sendChatMessageInternal), so one can't land
// between the check for replies and the delete.
export async function deleteComment(userId: string, messageId: string) {
  const { message, hunt, user } = await rootCommentForWrite(userId, messageId);
  await withLock(`chat-message:${messageId}:thread`, async () => {
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
  });
}
