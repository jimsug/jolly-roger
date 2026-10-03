import { Meteor } from "meteor/meteor";
import Puzzles from "../lib/models/Puzzles";
import isWhiteboardPuzzle from "../lib/whiteboard/isWhiteboardPuzzle";

// Every method that changes a puzzle calls this so the hidden puzzle behind a
// hunt's whiteboard can't be given answers, guesses, tags or a document.
// Deleted puzzles are looked up too, so undestroy can't slip past.
export default async function assertNotWhiteboardPuzzle(puzzleId: string) {
  const puzzle = await Puzzles.findOneAllowingDeletedAsync(puzzleId, {
    projection: { kind: 1 },
  });
  if (isWhiteboardPuzzle(puzzle)) {
    throw new Meteor.Error(400, "The whiteboard isn't a puzzle");
  }
}
