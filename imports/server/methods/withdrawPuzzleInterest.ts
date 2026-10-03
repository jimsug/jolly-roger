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

    // Withdrawing is allowed even once the puzzle has been unlocked, so a
    // stale vote can always be cleaned up. The row goes entirely rather than
    // being soft-deleted, so a later vote doesn't trip the unique index.
    await PuzzleFeedbacks.removeAsync({
      puzzle: puzzleId,
      createdBy: this.userId,
    });
  },
});
