import { Meteor } from "meteor/meteor";
import { syncPuzzleOnBoard } from "../whiteboard";
import type Hookset from "./Hookset";

// Deferred so a slow board update never holds up the method that triggered it.
const deferSync = (puzzleId: string) => {
  Meteor.defer(() => {
    void syncPuzzleOnBoard(puzzleId);
  });
};

// Keeps a hunt's whiteboard in step with its puzzles: new puzzles get a card,
// untouched cards follow their group tags, and feeder arrows follow meta tags.
const WhiteboardHooks: Hookset = {
  name: "WhiteboardHooks",

  onPuzzleCreated(puzzleId: string) {
    deferSync(puzzleId);
  },

  onPuzzleUpdated(puzzleId: string) {
    deferSync(puzzleId);
  },

  onAddPuzzleTag(puzzleId: string) {
    deferSync(puzzleId);
  },

  onRemovePuzzleTag(puzzleId: string) {
    deferSync(puzzleId);
  },
};

export default WhiteboardHooks;
