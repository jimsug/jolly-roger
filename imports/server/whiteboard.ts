import { Meteor } from "meteor/meteor";
import { Random } from "meteor/random";
import i18n from "i18next";
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
import { ancestorsOf } from "../lib/whiteboard/arrange";
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
} from "../lib/whiteboard/layout";
import ignoringDuplicateKeyErrors, {
  isDuplicateKeyError,
} from "./ignoringDuplicateKeyErrors";
import { serverLanguage } from "./lang";
import withLock from "./withLock";

export async function assertWhiteboardEnabled() {
  if (await Flags.activeAsync("disable.whiteboard")) {
    throw new Meteor.Error(403, "The whiteboard is disabled");
  }
}

// Stored as the backing puzzle's title and the Ungrouped frame's label, so in
// the server's language.
const whiteboardTitle = () =>
  i18n.t("whiteboard.title", "Whiteboard", { lng: serverLanguage });
const ungroupedLabel = () =>
  i18n.t("whiteboard.frame.ungrouped", "Ungrouped", { lng: serverLanguage });

function nodeRect(node: WhiteboardNodeType): Rect {
  return {
    ...node.position,
    width: node.width ?? CARD_WIDTH,
    height: node.height ?? CARD_HEIGHT,
  };
}

// Grows each ancestor of a node so it still contains the node. Each frame is
// grown at most once, so frames that racing moves have left inside each other
// can't keep growing each other forever.
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
  const seen = new Set([node._id]);
  let parent = child.parent && nodesById.get(child.parent);
  while (parent && !seen.has(parent._id)) {
    seen.add(parent._id);
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
    const updated = { ...parent, ...grown };
    nodesById.set(updated._id, updated);
    child = updated;
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
  return (await WhiteboardNodes.findOneAsync(_id))!;
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
      depth: ancestorsOf(nodesById, f._id).length,
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
        { frameKind: "ungrouped", label: ungroupedLabel() },
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
    // Someone may have moved or removed the card since it was read, and
    // placement never moves a card a person has touched.
    await WhiteboardNodes.updateAsync(
      { _id: card._id, manual: { $ne: true }, hidden: { $ne: true } },
      {
        $set: { position, ...(frame ? { parent: frame._id } : {}) },
        ...(frame ? {} : { $unset: { parent: "" } }),
      },
    );
  } else {
    // Someone may have put the card on the board by hand since it was read.
    await ignoringDuplicateKeyErrors(() =>
      WhiteboardNodes.insertAsync({
        hunt: board.hunt,
        board: board._id,
        type: "puzzle",
        puzzle: puzzle._id,
        parent: frame?._id,
        position,
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        createdBy: puzzle.createdBy,
      }),
    );
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
    // Only a sync that outlasted the board's lock can have drawn it since.
    await ignoringDuplicateKeyErrors(() =>
      WhiteboardEdges.insertAsync({
        hunt: board.hunt,
        board: board._id,
        source: source._id,
        target: target._id,
        auto: true,
        feeder: pair.feeder,
        meta: pair.meta,
        createdBy: puzzle.createdBy,
      }),
    );
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

  await withLock(`whiteboard:${board._id}`, async (renew) => {
    const tags = await Tags.find({ hunt: huntId }).fetchAsync();
    for (const puzzleId of puzzleIds) {
      const puzzle = await Puzzles.findOneAsync(puzzleId);
      if (!puzzle) continue;
      // Placement never reads ink, text or attribution, which are most of a
      // busy board.
      const nodes = await WhiteboardNodes.find(
        { board: board._id },
        { projection: { points: 0, contributors: 0, text: 0, label: 0 } },
      ).fetchAsync();
      await placePuzzle(board, puzzle, tags, nodes);
      await syncAutoEdges(board, puzzle);
      // A long batch (a renamed round) would otherwise outlast the lock and
      // let another sync place cards in the same slots.
      await renew();
    }
  });
}

// For callers that shouldn't wait on the board (hooks and the methods that
// fire them).
export function deferSyncPuzzlesOnBoard(huntId: string, puzzleIds: string[]) {
  Meteor.defer(() => {
    syncPuzzlesOnBoard(huntId, puzzleIds).catch((error: unknown) => {
      Logger.error("Failed to sync puzzles onto whiteboard", {
        hunt: huntId,
        puzzles: puzzleIds.join(","),
        error,
      });
    });
  });
}

async function seedBoard(
  board: Pick<WhiteboardType, "_id" | "hunt" | "createdBy">,
) {
  const puzzles = await Puzzles.find({ hunt: board.hunt }).fetchAsync();
  const tags = await Tags.find({ hunt: board.hunt }).fetchAsync();
  const { nodes, edges } = seedLayout(puzzles, tags, ungroupedLabel());

  // Parents come before their children, so every parent key is already
  // mapped to an id by the time a child needs it.
  const ids = new Map<string, string>();
  const cardsByPuzzle = new Map<string, string>();
  const nodeDocs = nodes.map((seed) => {
    const _id = Random.id();
    ids.set(seed.key, _id);
    if (seed.puzzle) cardsByPuzzle.set(seed.puzzle, _id);
    return {
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
    };
  });
  await WhiteboardNodes.insertManyAsync(nodeDocs);

  await WhiteboardEdges.insertManyAsync(
    edges.map(({ feeder, meta }) => ({
      hunt: board.hunt,
      board: board._id,
      source: cardsByPuzzle.get(feeder)!,
      target: cardsByPuzzle.get(meta)!,
      auto: true,
      feeder,
      meta,
      createdBy: board.createdBy,
    })),
  );
}

// Makes the hunt's board, seeded with its puzzles, or finds the one it has.
export async function ensureWhiteboard(
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

  return withLock(`hunt:${huntId}:whiteboard`, async () => {
    const existing = await Whiteboards.findOneAsync({ hunt: huntId });
    if (existing) return existing._id;

    Logger.info("Creating a whiteboard", { hunt: huntId });

    // Inserted directly rather than via addPuzzle so that no document,
    // Discord post or "new puzzle" notification is created.
    const puzzleId = await Puzzles.insertAsync({
      hunt: huntId,
      title: whiteboardTitle(),
      tags: [],
      answers: [],
      expectedAnswerCount: 0,
      kind: "whiteboard",
      createdBy: userId,
    });

    // The board's lock is taken before the board exists, so placement hooks
    // that find it wait for the seeding rather than racing it for frames.
    const boardId = Random.id();
    return withLock(`whiteboard:${boardId}`, async () => {
      try {
        await Whiteboards.insertAsync({
          _id: boardId,
          hunt: huntId,
          puzzle: puzzleId,
          createdBy: userId,
        });
      } catch (error) {
        await Puzzles.removeAsync(puzzleId);
        if (!isDuplicateKeyError(error)) throw error;
        return (await Whiteboards.findOneAsync({ hunt: huntId }))!._id;
      }

      await seedBoard({ _id: boardId, hunt: huntId, createdBy: userId });
      return boardId;
    });
  });
}
