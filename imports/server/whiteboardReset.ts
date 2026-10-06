import { Meteor } from "meteor/meteor";
import Puzzles from "../lib/models/Puzzles";
import Tags from "../lib/models/Tags";
import WhiteboardEdges from "../lib/models/WhiteboardEdges";
import WhiteboardNodes from "../lib/models/WhiteboardNodes";
import Whiteboards from "../lib/models/Whiteboards";
import { seedLayout } from "../lib/whiteboard/layout";
import { MAX_BATCH } from "../lib/whiteboard/limits";
import type { ResetPlacement } from "../lib/whiteboard/reset";
import { planReset, resetSeedInput } from "../lib/whiteboard/reset";
import ignoringDuplicateKeyErrors from "./ignoringDuplicateKeyErrors";
import currentTagSynonyms from "./tagSynonyms";
import {
  PLACEMENT_PROJECTION,
  seedNodeDoc,
  syncAutoEdges,
  syncPuzzlesOnBoard,
  ungroupedLabel,
} from "./whiteboard";
import { assertMayEditBoard } from "./whiteboardShared";
import {
  assertHistoryEnabled,
  recordVersionBeforeEdit,
  recordVersionUnderLock,
  WRITES_PER_RENEWAL,
  withBoardLock,
} from "./whiteboardVersions";
import { renewEvery } from "./withLock";

// Hands cards back to placement: each is no longer marked as moved by hand,
// and goes into the frame its tags choose, unless it's in it already.
export async function placeByTags(
  userId: string,
  boardId: string,
  nodeIds: string[],
) {
  const { board } = await assertMayEditBoard(userId, boardId);
  if (nodeIds.length > MAX_BATCH) {
    throw new Meteor.Error(400, "Too many nodes at once");
  }
  const ids = [...new Set(nodeIds)];
  if (ids.length === 0) return;
  const cards = await WhiteboardNodes.find(
    {
      _id: { $in: ids },
      board: boardId,
      type: "puzzle",
      hidden: { $ne: true },
    },
    { projection: { puzzle: 1, locked: 1 } },
  ).fetchAsync();
  const puzzleIds = cards.flatMap((c) => (c.puzzle ? [c.puzzle] : []));
  if (puzzleIds.length !== ids.length) {
    throw new Meteor.Error(
      400,
      "Only cards on this board can be placed by tags",
    );
  }
  // Placing a card by hand moves it, so a locked one stays put. Placement on
  // its own still moves it.
  if (cards.some((c) => c.locked)) {
    throw new Meteor.Error(403, "That's locked");
  }

  await recordVersionBeforeEdit(board, userId);
  await WhiteboardNodes.updateAsync(
    { _id: { $in: ids }, board: boardId },
    { $unset: { manual: "" } },
    { multi: true },
  );
  await syncPuzzlesOnBoard(board.hunt, puzzleIds);
}

const RESET_NEEDS_HISTORY =
  "Reset layout needs board history, which is turned off";

const placementModifier = (
  placement: ResetPlacement,
  parent: string | undefined,
) => ({
  $set: { ...placement.$set, ...(parent ? { parent } : {}) },
  $unset: { ...placement.$unset, ...(parent ? {} : { parent: "" as const }) },
});

// Lays the board's cards and round frames out again as a new board's would
// be, opening any round frame that was collapsed, and keeping everything else
// (notes, text, ink, user frames, lines, comments) where it is. The board as
// it was is recorded first, so History can undo it. With putBack, cards,
// round frames and feeder arrows someone took off the board come back too.
export async function resetLayout(
  userId: string,
  boardId: string,
  putBack: boolean,
) {
  await assertMayEditBoard(userId, boardId);
  await assertHistoryEnabled(RESET_NEEDS_HISTORY);

  await withBoardLock(boardId, async (renew) => {
    // The policy or the flags may have changed while this waited
    const { board } = await assertMayEditBoard(userId, boardId);
    await assertHistoryEnabled(RESET_NEEDS_HISTORY);

    // Nothing has been written yet, so a failure here leaves the board as
    // it was.
    await recordVersionUnderLock(board, userId, "reset", renew, {
      required: true,
    });

    const puzzles = await Puzzles.find({ hunt: board.hunt }).fetchAsync();
    const tags = await Tags.find({ hunt: board.hunt }).fetchAsync();
    const nodes = await WhiteboardNodes.find(
      { board: boardId },
      { projection: PLACEMENT_PROJECTION },
    ).fetchAsync();
    const input = resetSeedInput(puzzles, tags, nodes, putBack);
    const seed = seedLayout(
      input.puzzles,
      input.tags,
      ungroupedLabel(),
      currentTagSynonyms(),
    );
    const plan = planReset(seed.nodes, nodes, { putBack });
    await renew();

    const wrote = renewEvery(renew, WRITES_PER_RENEWAL);

    const ids = new Map<string, string>();
    for (const placement of plan.place) {
      const parent = placement.parentKey
        ? ids.get(placement.parentKey)
        : undefined;
      const modifier = placementModifier(placement, parent);
      let id = placement.node;
      if (!id) {
        const { seed: s } = placement;
        // One at a time, since someone may put a card on the board by hand
        // meanwhile (user edits don't take the lock). If they have, theirs
        // is the one placed.
        id = await ignoringDuplicateKeyErrors(() =>
          WhiteboardNodes.insertAsync({
            ...seedNodeDoc(board, s, parent, userId),
            position: modifier.$set.position,
          }),
        );
        if (!id && (s.puzzle || s.tag)) {
          const winner = await WhiteboardNodes.findOneAsync(
            s.puzzle
              ? { board: boardId, puzzle: s.puzzle }
              : { board: boardId, tag: s.tag },
            { projection: { _id: 1 } },
          );
          id = winner?._id;
          if (id) await WhiteboardNodes.updateAsync(id, modifier);
        }
      } else {
        await WhiteboardNodes.updateAsync(id, modifier);
      }
      if (id) ids.set(placement.key, id);
      await wrote();
    }

    for (const { node, position } of plan.stack) {
      await WhiteboardNodes.updateAsync(node, {
        $set: { position },
        $unset: { parent: "", manual: "" },
      });
      await wrote();
    }
    await renew();

    await syncAutoEdges(board, puzzles, tags, renew);
    // Arrows to or from a deleted puzzle stay hidden, whether the delete
    // or a person hid them, until it comes back.
    if (putBack) {
      const deleted = await Puzzles.findDeleted(
        { hunt: board.hunt },
        { projection: { _id: 1 } },
      ).mapAsync((p) => p._id);
      await WhiteboardEdges.updateAsync(
        {
          board: boardId,
          auto: true,
          hidden: true,
          feeder: { $nin: deleted },
          meta: { $nin: deleted },
        },
        { $unset: { hidden: "", hiddenWithPuzzle: "" } },
        { multi: true },
      );
    }

    await Whiteboards.updateAsync(boardId, {
      $set: { lastRewrittenAt: new Date() },
    });
  });
}
