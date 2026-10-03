import Puzzles from "../../lib/models/Puzzles";
import { deferSyncPuzzlesOnBoard } from "../whiteboard";
import type Hookset from "./Hookset";

// The board is brought up to date in the background, so a slow board never
// holds up the method that triggered the hook.
async function syncPuzzle(puzzleId: string) {
  const puzzle = await Puzzles.findOneAsync(puzzleId, {
    projection: { hunt: 1 },
  });
  if (!puzzle) return;
  deferSyncPuzzlesOnBoard(puzzle.hunt, [puzzleId]);
}

// Keeps a hunt's whiteboard in step with its puzzles: new puzzles get a card,
// untouched cards follow their group tags, and feeder arrows follow meta tags.
const WhiteboardHooks: Hookset = {
  name: "WhiteboardHooks",

  onPuzzleCreated(puzzleId: string) {
    return syncPuzzle(puzzleId);
  },

  onPuzzleUpdated(puzzleId: string) {
    return syncPuzzle(puzzleId);
  },

  onAddPuzzleTag(puzzleId: string) {
    return syncPuzzle(puzzleId);
  },
};

export default WhiteboardHooks;
