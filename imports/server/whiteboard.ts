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
  isMetaForTag,
  MIN_FRAME_HEIGHT,
  MIN_FRAME_WIDTH,
  placeIntoFrame,
  roundMetas,
  roundTags,
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
export const ungroupedLabel = () =>
  i18n.t("whiteboard.frame.ungrouped", "Ungrouped", { lng: serverLanguage });

// Placement never reads ink, text or attribution, which are most of a busy
// board.
export const PLACEMENT_PROJECTION = {
  points: 0,
  contributors: 0,
  text: 0,
  label: 0,
} as const;

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
  // Read back for the fields the model fills in. Should it already be gone,
  // the puzzle is placed as though there were no frame.
  return WhiteboardNodes.findOneAsync(_id);
}

// Places one puzzle of a batch. nodesById is the board as the batch read it,
// and is kept up to date with what this writes, for the puzzles after it.
// metaPuzzles are the hunt's puzzles with a meta-for: tag, which tell which
// cards in a frame are its round's metas.
async function placePuzzle(
  board: WhiteboardType,
  puzzle: PuzzleType,
  tags: TagType[],
  nodesById: Map<string, WhiteboardNodeType>,
  metaPuzzles: Pick<PuzzleType, "_id" | "tags">[],
) {
  const nodes = [...nodesById.values()];
  const card = nodes.find((n) => n.puzzle === puzzle._id);
  if (card?.hidden || card?.manual) return;

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
  if (frame) nodesById.set(frame._id, frame);

  if (card && frame && card.parent === frame._id) return;
  if (card && !frame && !card.parent) return;

  let position;
  if (frame) {
    // A meta goes wherever there's room; anything else keeps out of a row
    // that only the round's metas are in.
    const placingMeta = roundMetas(frame.tag, tags, [puzzle]).has(puzzle._id);
    const metas = placingMeta
      ? new Set<string>()
      : roundMetas(frame.tag, tags, metaPuzzles);
    const occupied = nodes
      .filter((n) => n.parent === frame._id && !n.hidden && n !== card)
      .map((n) =>
        Object.assign(nodeRect(n), {
          meta: !!n.puzzle && metas.has(n.puzzle),
        }),
      );
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
      nodesById.set(frame._id, { ...frame, ...placed.frame });
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

  // The card as it is now, whether this moved it or someone else just did
  const placedCard = await WhiteboardNodes.findOneAsync(
    { board: board._id, puzzle: puzzle._id },
    { projection: PLACEMENT_PROJECTION },
  );
  if (placedCard) nodesById.set(placedCard._id, placedCard);
}

// Redraws the feeder arrows to and from a batch of puzzles. Only for callers
// holding the board's lock.
export async function syncAutoEdges(
  board: WhiteboardType,
  batch: PuzzleType[],
  tags: TagType[],
) {
  if (batch.length === 0) return;
  const batchById = new Map(batch.map((p) => [p._id, p]));
  const cards = await WhiteboardNodes.find(
    { board: board._id, type: "puzzle" },
    { projection: { puzzle: 1 } },
  ).fetchAsync();
  const cardsByPuzzle = new Map(
    cards.flatMap((c) => (c.puzzle ? [[c.puzzle, c] as const] : [])),
  );
  // Only their tags, which is all feeder pairs need
  const puzzles = await Puzzles.find(
    { hunt: board.hunt, _id: { $in: [...cardsByPuzzle.keys()] } },
    { projection: { tags: 1 } },
  ).fetchAsync();

  const wanted = computeFeederPairs(puzzles, tags).filter(
    (p) => batchById.has(p.feeder) || batchById.has(p.meta),
  );
  const wantedKeys = new Set(wanted.map((p) => `${p.feeder}:${p.meta}`));
  const batchIds = [...batchById.keys()];
  const existing = await WhiteboardEdges.find({
    board: board._id,
    auto: true,
    $or: [{ feeder: { $in: batchIds } }, { meta: { $in: batchIds } }],
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
    const drawnFor = batchById.get(pair.feeder) ?? batchById.get(pair.meta);
    if (!source || !target || !drawnFor) continue;
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
        createdBy: drawnFor.createdBy,
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
    // The switch may have been flipped while this waited for the lock
    if (await Flags.activeAsync("disable.whiteboard")) return;

    // Everything is read once for the batch, so a batch costs one read of
    // the board rather than one per puzzle
    const tags = await Tags.find({ hunt: huntId }).fetchAsync();
    const puzzlesById = new Map(
      (
        await Puzzles.find({
          hunt: huntId,
          _id: { $in: puzzleIds },
        }).fetchAsync()
      ).map((p) => [p._id, p]),
    );
    const nodesById = new Map(
      (
        await WhiteboardNodes.find(
          { board: board._id },
          { projection: PLACEMENT_PROJECTION },
        ).fetchAsync()
      ).map((n) => [n._id, n]),
    );
    const metaTags = tags.filter(isMetaForTag);
    const metaPuzzles =
      metaTags.length > 0
        ? await Puzzles.find(
            { hunt: huntId, tags: { $in: metaTags.map((t) => t._id) } },
            { projection: { tags: 1 } },
          ).fetchAsync()
        : [];
    const batch: PuzzleType[] = [];
    for (const puzzleId of puzzleIds) {
      const puzzle = puzzlesById.get(puzzleId);
      if (!puzzle) continue;
      batch.push(puzzle);
      await placePuzzle(board, puzzle, tags, nodesById, metaPuzzles);
      // A long batch (a renamed round) would otherwise outlast the lock and
      // let another sync place cards in the same slots.
      await renew();
    }
    await syncAutoEdges(board, batch, tags);
  });
}

// Puzzles waiting for each hunt's deferred sync. A hunt is in here from the
// first request until its sync finds nothing more to do; each pass takes
// everything asked for by then, so a burst of requests (a run of tag edits,
// say) costs a pass or two rather than a queue of syncs on the board's lock,
// as with documentCache's refills.
const pendingSyncs = new Map<string, Set<string>>();

// For callers that shouldn't wait on the board (hooks and the methods that
// fire them).
export function deferSyncPuzzlesOnBoard(huntId: string, puzzleIds: string[]) {
  if (puzzleIds.length === 0) return;
  const queued = pendingSyncs.get(huntId);
  if (queued) {
    puzzleIds.forEach((id) => queued.add(id));
    return;
  }

  const pending = new Set(puzzleIds);
  pendingSyncs.set(huntId, pending);
  Meteor.defer(async () => {
    while (pending.size > 0) {
      const batch = [...pending];
      pending.clear();
      try {
        await syncPuzzlesOnBoard(huntId, batch);
      } catch (error) {
        Logger.error("Failed to sync puzzles onto whiteboard", {
          hunt: huntId,
          puzzles: batch.join(","),
          error,
        });
      }
    }
    pendingSyncs.delete(huntId);
  });
}

// Puts the puzzles of rounds whose frames have just come back through a
// deferred sync, so cards that left with a frame (and haven't been moved by
// hand since) go back into it together. Looking the puzzles up is deferred
// too, so the caller's write stands whatever happens here.
export function deferSyncRoundsOnBoard(huntId: string, tagIds: string[]) {
  if (tagIds.length === 0) return;
  Meteor.defer(async () => {
    try {
      const tags = await Tags.find(
        { hunt: huntId },
        { projection: { name: 1 } },
      ).fetchAsync();
      const wanted = [
        ...new Set(tagIds.flatMap((tag) => roundTags(tag, tags))),
      ];
      const puzzles = await Puzzles.find(
        { hunt: huntId, tags: { $in: wanted } },
        { projection: { _id: 1 } },
      ).fetchAsync();
      deferSyncPuzzlesOnBoard(
        huntId,
        puzzles.map((p) => p._id),
      );
    } catch (error) {
      Logger.error("Failed to sync restored rounds onto whiteboard", {
        hunt: huntId,
        tags: tagIds.join(","),
        error,
      });
    }
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

  // seedLayout gives every puzzle a card, so both ends are always there.
  await WhiteboardEdges.insertManyAsync(
    edges.flatMap(({ feeder, meta }) => {
      const source = cardsByPuzzle.get(feeder);
      const target = cardsByPuzzle.get(meta);
      if (!source || !target) return [];
      return [
        {
          hunt: board.hunt,
          board: board._id,
          source,
          target,
          auto: true,
          feeder,
          meta,
          createdBy: board.createdBy,
        },
      ];
    }),
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
  if (hunt.isArchived) {
    throw new Meteor.Error(403, "This hunt is archived");
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
        const existing = await Whiteboards.findOneAsync({ hunt: huntId });
        if (!existing) throw error;
        return existing._id;
      }

      await seedBoard({ _id: boardId, hunt: huntId, createdBy: userId });
      return boardId;
    });
  });
}
