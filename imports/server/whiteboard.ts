import { Meteor } from "meteor/meteor";
import { Random } from "meteor/random";
import Flags from "../Flags";
import Logger from "../Logger";
import Hunts from "../lib/models/Hunts";
import MeteorUsers from "../lib/models/MeteorUsers";
import type { PuzzleType } from "../lib/models/Puzzles";
import Puzzles from "../lib/models/Puzzles";
import type { TagType } from "../lib/models/Tags";
import Tags from "../lib/models/Tags";
import WhiteboardEdges from "../lib/models/WhiteboardEdges";
import type { WhiteboardNodeType } from "../lib/models/WhiteboardNodes";
import WhiteboardNodes from "../lib/models/WhiteboardNodes";
import type { WhiteboardType } from "../lib/models/Whiteboards";
import Whiteboards from "../lib/models/Whiteboards";
import { userMayWritePuzzlesForHunt } from "../lib/permission_stubs";
import isWhiteboardPuzzle from "../lib/whiteboard/isWhiteboardPuzzle";
import type { Rect, Size } from "../lib/whiteboard/layout";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  chooseFrameForPuzzle,
  computeFeederPairs,
  frameLabelForTag,
  growToContain,
  MIN_FRAME_HEIGHT,
  MIN_FRAME_WIDTH,
  placeIntoFrame,
  seedLayout,
  topLevelSlot,
  UNGROUPED_LABEL,
} from "../lib/whiteboard/layout";
import withLock from "./withLock";

const isDuplicateKeyError = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === 11000;

export async function assertWhiteboardEnabled() {
  if (await Flags.activeAsync("disable.whiteboard")) {
    throw new Meteor.Error(403, "The whiteboard is disabled");
  }
}

// Every method that changes a puzzle calls this so the hidden puzzle behind
// the whiteboard can't be given answers, guesses, tags or a document.
export async function assertNotWhiteboardPuzzle(puzzleId: string) {
  const puzzle = await Puzzles.findOneAllowingDeletedAsync(puzzleId, {
    projection: { kind: 1 },
  });
  if (isWhiteboardPuzzle(puzzle)) {
    throw new Meteor.Error(400, "The whiteboard isn't a puzzle");
  }
}

function nodeRect(node: WhiteboardNodeType): Rect {
  return {
    ...node.position,
    width: node.width ?? CARD_WIDTH,
    height: node.height ?? CARD_HEIGHT,
  };
}

function frameDepth(
  node: WhiteboardNodeType,
  nodesById: Map<string, WhiteboardNodeType>,
): number {
  let depth = 0;
  let parent = node.parent && nodesById.get(node.parent);
  while (parent && depth < 64) {
    depth += 1;
    parent = parent.parent && nodesById.get(parent.parent);
  }
  return depth;
}

// Grows each ancestor of a node so it still contains the node.
async function growAncestors(
  node: WhiteboardNodeType,
  size: Size,
  nodesById: Map<string, WhiteboardNodeType>,
) {
  let child: WhiteboardNodeType = {
    ...node,
    width: size.width,
    height: size.height,
  };
  let parent = child.parent && nodesById.get(child.parent);
  while (parent) {
    const current = {
      width: parent.width ?? MIN_FRAME_WIDTH,
      height: parent.height ?? MIN_FRAME_HEIGHT,
    };
    const grown = growToContain(current, nodeRect(child));
    if (grown.width === current.width && grown.height === current.height) {
      return;
    }
    await WhiteboardNodes.updateAsync(parent._id, {
      $set: { width: grown.width, height: grown.height },
    });
    parent = { ...parent, ...grown };
    nodesById.set(parent._id, parent);
    child = parent;
    parent = child.parent && nodesById.get(child.parent);
  }
}

async function insertTopLevelFrame(
  board: WhiteboardType,
  nodes: WhiteboardNodeType[],
  frame: Pick<WhiteboardNodeType, "frameKind" | "tag" | "label">,
  createdBy: string,
) {
  const topLevel = nodes.filter((n) => !n.parent && !n.hidden).map(nodeRect);
  const _id = await WhiteboardNodes.insertAsync({
    hunt: board.hunt,
    board: board._id,
    type: "frame",
    position: topLevelSlot(topLevel),
    width: MIN_FRAME_WIDTH,
    height: MIN_FRAME_HEIGHT,
    ...frame,
    createdBy,
  });
  const inserted = (await WhiteboardNodes.findOneAsync(_id))!;
  nodes.push(inserted);
  return inserted;
}

async function placePuzzle(
  board: WhiteboardType,
  puzzle: PuzzleType,
  tags: TagType[],
  nodes: WhiteboardNodeType[],
) {
  const card = nodes.find((n) => n.puzzle === puzzle._id);
  if (card?.hidden || card?.manual) return;

  const nodesById = new Map(nodes.map((n) => [n._id, n]));
  const frames = nodes.filter((n) => n.type === "frame");
  const visibleFrames = frames.filter((f) => !f.hidden);
  const choice = chooseFrameForPuzzle(
    puzzle,
    tags,
    visibleFrames.map((f) => ({
      id: f._id,
      tag: f.tag,
      depth: frameDepth(f, nodesById),
    })),
  );

  let frame: WhiteboardNodeType | undefined;
  if ("frameId" in choice) {
    frame = nodesById.get(choice.frameId);
  } else if (
    "createForTag" in choice &&
    // Someone removed this group's frame; don't bring it back.
    !frames.some((f) => f.tag === choice.createForTag._id)
  ) {
    frame = await insertTopLevelFrame(
      board,
      nodes,
      {
        frameKind: "group",
        tag: choice.createForTag._id,
        label: frameLabelForTag(choice.createForTag),
      },
      puzzle.createdBy,
    );
  } else {
    frame = visibleFrames.find((f) => f.frameKind === "ungrouped");
    if (!frame && !frames.some((f) => f.frameKind === "ungrouped")) {
      frame = await insertTopLevelFrame(
        board,
        nodes,
        { frameKind: "ungrouped", label: UNGROUPED_LABEL },
        puzzle.createdBy,
      );
    }
  }

  if (card && frame && card.parent === frame._id) return;
  if (card && !frame && !card.parent) return;

  let position;
  if (frame) {
    const occupied = nodes
      .filter((n) => n.parent === frame._id && !n.hidden && n !== card)
      .map(nodeRect);
    const placed = placeIntoFrame(
      {
        width: frame.width ?? MIN_FRAME_WIDTH,
        height: frame.height ?? MIN_FRAME_HEIGHT,
      },
      occupied,
    );
    position = placed.position;
    if (
      placed.frame.width !== frame.width ||
      placed.frame.height !== frame.height
    ) {
      await WhiteboardNodes.updateAsync(frame._id, {
        $set: { width: placed.frame.width, height: placed.frame.height },
      });
      await growAncestors(frame, placed.frame, nodesById);
    }
  } else {
    position = topLevelSlot(
      nodes.filter((n) => !n.parent && !n.hidden && n !== card).map(nodeRect),
    );
  }

  if (card) {
    await WhiteboardNodes.updateAsync(card._id, {
      $set: { position, ...(frame ? { parent: frame._id } : {}) },
      ...(frame ? {} : { $unset: { parent: "" } }),
    });
  } else {
    try {
      const _id = await WhiteboardNodes.insertAsync({
        hunt: board.hunt,
        board: board._id,
        type: "puzzle",
        puzzle: puzzle._id,
        parent: frame?._id,
        position,
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        createdBy: puzzle.createdBy,
      });
      nodes.push((await WhiteboardNodes.findOneAsync(_id))!);
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
    }
  }
}

async function syncAutoEdges(board: WhiteboardType, puzzle: PuzzleType) {
  const cards = await WhiteboardNodes.find({
    board: board._id,
    type: "puzzle",
  }).fetchAsync();
  const cardsByPuzzle = new Map(cards.map((c) => [c.puzzle!, c]));
  const puzzles = await Puzzles.find({
    hunt: board.hunt,
    _id: { $in: [...cardsByPuzzle.keys()] },
  }).fetchAsync();
  const tags = await Tags.find({ hunt: board.hunt }).fetchAsync();

  const wanted = computeFeederPairs(puzzles, tags).filter(
    (p) => p.feeder === puzzle._id || p.meta === puzzle._id,
  );
  const wantedKeys = new Set(wanted.map((p) => `${p.feeder}:${p.meta}`));
  const existing = await WhiteboardEdges.find({
    board: board._id,
    auto: true,
    $or: [{ feeder: puzzle._id }, { meta: puzzle._id }],
  }).fetchAsync();
  const existingKeys = new Set(existing.map((e) => `${e.feeder}:${e.meta}`));

  const stale = existing.filter(
    (e) => !wantedKeys.has(`${e.feeder}:${e.meta}`),
  );
  if (stale.length > 0) {
    await WhiteboardEdges.removeAsync({
      _id: { $in: stale.map((e) => e._id) },
    });
  }

  for (const pair of wanted) {
    if (existingKeys.has(`${pair.feeder}:${pair.meta}`)) continue;
    const source = cardsByPuzzle.get(pair.feeder);
    const target = cardsByPuzzle.get(pair.meta);
    if (!source || !target) continue;
    try {
      await WhiteboardEdges.insertAsync({
        hunt: board.hunt,
        board: board._id,
        source: source._id,
        target: target._id,
        auto: true,
        feeder: pair.feeder,
        meta: pair.meta,
        createdBy: puzzle.createdBy,
      });
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
    }
  }
}

// Brings the board up to date with a set of puzzles: places any that aren't
// on it yet, moves untouched cards whose groups changed, and redraws their
// feeder arrows. Safe to call as often as you like.
export async function syncPuzzlesOnBoard(huntId: string, puzzleIds: string[]) {
  if (puzzleIds.length === 0) return;
  const board = await Whiteboards.findOneAsync({ hunt: huntId });
  if (!board) return;
  if (await Flags.activeAsync("disable.whiteboard")) return;

  await withLock(`whiteboard:${board._id}`, async () => {
    const tags = await Tags.find({ hunt: huntId }).fetchAsync();
    for (const puzzleId of puzzleIds) {
      const puzzle = await Puzzles.findOneAsync(puzzleId);
      if (!puzzle || puzzle.hunt !== huntId || isWhiteboardPuzzle(puzzle)) {
        continue;
      }
      const nodes = await WhiteboardNodes.find({
        board: board._id,
      }).fetchAsync();
      await placePuzzle(board, puzzle, tags, nodes);
      await syncAutoEdges(board, puzzle);
    }
  });
}

export function deferSyncPuzzlesOnBoard(huntId: string, puzzleIds: string[]) {
  Meteor.defer(() => {
    syncPuzzlesOnBoard(huntId, puzzleIds).catch((error: unknown) => {
      Logger.error("Failed to sync puzzles onto whiteboard", {
        hunt: huntId,
        error,
      });
    });
  });
}

export async function syncPuzzleOnBoard(puzzleId: string) {
  const puzzle = await Puzzles.findOneAsync(puzzleId, {
    projection: { hunt: 1 },
  });
  if (!puzzle) return;
  try {
    await syncPuzzlesOnBoard(puzzle.hunt, [puzzleId]);
  } catch (error) {
    Logger.error("Failed to sync puzzle onto whiteboard", {
      puzzle: puzzleId,
      error,
    });
  }
}

async function seedBoard(board: WhiteboardType, renew: () => Promise<void>) {
  const puzzles = await Puzzles.find({ hunt: board.hunt }).fetchAsync();
  const tags = await Tags.find({ hunt: board.hunt }).fetchAsync();
  const { nodes, edges } = seedLayout(puzzles, tags);

  const ids = new Map<string, string>();
  const cardsByPuzzle = new Map<string, string>();
  let written = 0;
  const tick = async () => {
    written += 1;
    if (written % 50 === 0) await renew();
  };

  for (const seed of nodes) {
    await tick();
    const _id = Random.id();
    ids.set(seed.key, _id);
    if (seed.puzzle) cardsByPuzzle.set(seed.puzzle, _id);
    await WhiteboardNodes.insertAsync({
      _id,
      hunt: board.hunt,
      board: board._id,
      type: seed.type,
      parent: seed.parentKey ? ids.get(seed.parentKey) : undefined,
      position: seed.position,
      width: seed.width,
      height: seed.height,
      puzzle: seed.puzzle,
      tag: seed.tag,
      label: seed.label,
      frameKind: seed.frameKind,
      createdBy: board.createdBy,
    });
  }

  for (const { feeder, meta } of edges) {
    await tick();
    await WhiteboardEdges.insertAsync({
      hunt: board.hunt,
      board: board._id,
      source: cardsByPuzzle.get(feeder)!,
      target: cardsByPuzzle.get(meta)!,
      auto: true,
      feeder,
      meta,
      createdBy: board.createdBy,
    });
  }
}

export async function createWhiteboard(
  userId: string,
  huntId: string,
): Promise<string> {
  await assertWhiteboardEnabled();
  const hunt = await Hunts.findOneAsync(huntId);
  if (!hunt) {
    throw new Meteor.Error(404, "Unknown hunt id");
  }
  if (
    !userMayWritePuzzlesForHunt(await MeteorUsers.findOneAsync(userId), hunt)
  ) {
    throw new Meteor.Error(
      401,
      `User ${userId} may not create a whiteboard for hunt ${huntId}`,
    );
  }

  return withLock(`whiteboard:create:${huntId}`, async () => {
    const existing = await Whiteboards.findOneAsync({ hunt: huntId });
    if (existing) return existing._id;

    Logger.info("Creating a whiteboard", { hunt: huntId });

    // Inserted directly rather than via addPuzzle so that no document,
    // Discord post or "new puzzle" notification is created.
    const puzzleId = await Puzzles.insertAsync({
      hunt: huntId,
      title: "Whiteboard",
      tags: [],
      answers: [],
      expectedAnswerCount: 0,
      kind: "whiteboard",
      createdBy: userId,
    });

    let boardId: string;
    try {
      boardId = await Whiteboards.insertAsync({
        hunt: huntId,
        puzzle: puzzleId,
        title: "Whiteboard",
        createdBy: userId,
      });
    } catch (error) {
      await Puzzles.removeAsync(puzzleId);
      if (!isDuplicateKeyError(error)) throw error;
      return (await Whiteboards.findOneAsync({ hunt: huntId }))!._id;
    }

    const board = (await Whiteboards.findOneAsync(boardId))!;
    await withLock(`whiteboard:${boardId}`, (renew) => seedBoard(board, renew));
    return boardId;
  });
}
