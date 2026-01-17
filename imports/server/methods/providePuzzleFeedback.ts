import { check, Match } from "meteor/check";
import { Meteor } from "meteor/meteor";
import PuzzleFeedbacks from "../../lib/models/PuzzleFeedbacks";
import Puzzles from "../../lib/models/Puzzles";
import providePuzzleFeedback from "../../methods/providePuzzleFeedback";
import defineMethod from "./defineMethod";

defineMethod(providePuzzleFeedback, {
  validate(arg) {
    check(arg, {
      puzzleId: String,
      score: Number,
      comment: Match.Optional(String),
    });
    return arg;
  },

  async run({ puzzleId, score, comment }) {
    check(this.userId, String);

    const puzzle = await Puzzles.findOneAsync(puzzleId);
    if (!puzzle) {
      throw new Meteor.Error(404, "Unknown puzzle id");
    }

    if (!puzzle.locked) {
      throw new Meteor.Error(400, "Puzzle is not locked");
    }

    // Use upsert so people can update their interest
    await PuzzleFeedbacks.upsertAsync(
      {
        puzzle: puzzleId,
        createdBy: this.userId,
      },
      {
        $set: {
          hunt: puzzle.hunt,
          score,
          comment: comment || undefined,
        },
      },
    );
  },
});
