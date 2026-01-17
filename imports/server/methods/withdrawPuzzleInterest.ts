import { check } from "meteor/check";
import { Meteor } from "meteor/meteor";
import PuzzleFeedbacks from "../../lib/models/PuzzleFeedbacks";
import Puzzles from "../../lib/models/Puzzles";
import withdrawPuzzleInterest from "../../methods/withdrawPuzzleInterest";
import defineMethod from "./defineMethod";

defineMethod(withdrawPuzzleInterest, {
  validate(arg) {
    check(arg, {
      puzzleId: String,
    });
    return arg;
  },

  async run({ puzzleId }) {
    check(this.userId, String);

    const puzzle = await Puzzles.findOneAsync(puzzleId);
    if (!puzzle) {
      throw new Meteor.Error(404, "Unknown puzzle id");
    }

    // We allow withdrawing even if the puzzle happened to unlock,
    // though usually this is for locked puzzles.

    await PuzzleFeedbacks.removeAsync({
      puzzle: puzzleId,
      createdBy: this.userId,
    });
  },
});
