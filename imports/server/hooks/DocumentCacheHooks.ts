import Logger from "../../Logger";
import Puzzles from "../../lib/models/Puzzles";
import { replenishDocumentCache } from "../documentCache";
import type Hookset from "./Hookset";

// Puzzle activity is the signal that a hunt's document cache is being drawn
// down, so top it back up. The refill runs in the background: it can take a
// while and the other hooks (announcements, notifications) shouldn't wait on
// it.
async function replenishForPuzzle(puzzleId: string) {
  const puzzle = await Puzzles.findOneAllowingDeletedAsync(puzzleId);
  if (!puzzle) {
    return;
  }
  replenishDocumentCache(puzzle.hunt).catch((error) => {
    Logger.error("Document cache replenishment failed", {
      hunt: puzzle.hunt,
      error,
    });
  });
}

const DocumentCacheHooks: Hookset = {
  name: "DocumentCacheHooks",

  onPuzzleCreated(puzzleId: string) {
    return replenishForPuzzle(puzzleId);
  },

  onPuzzleSolved(puzzleId: string) {
    return replenishForPuzzle(puzzleId);
  },
};

export default DocumentCacheHooks;
