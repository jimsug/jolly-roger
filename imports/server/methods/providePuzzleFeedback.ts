import { check, Match } from "meteor/check";
import { Meteor } from "meteor/meteor";
import MeteorUsers from "../../lib/models/MeteorUsers";
import PuzzleFeedbacks from "../../lib/models/PuzzleFeedbacks";
import Puzzles from "../../lib/models/Puzzles";
import providePuzzleFeedback from "../../methods/providePuzzleFeedback";
import defineMethod from "./defineMethod";

defineMethod(providePuzzleFeedback, {
  validate(arg) {
    check(arg, {
      puzzleId: String,
      score: Match.Integer,
      comment: Match.Optional(String),
    });
    return arg;
  },

  async run({ puzzleId, score, comment }) {
    check(this.userId, String);

    // The interest count shown to operators is the sum of scores, so one
    // member must not be able to weigh in more than once.
    if (score !== 1) {
      throw new Meteor.Error(400, "Interest votes all carry a score of 1");
    }

    const puzzle = await Puzzles.findOneAsync(puzzleId);
    if (!puzzle) {
      throw new Meteor.Error(404, "Unknown puzzle id");
    }

    const user = await MeteorUsers.findOneAsync(this.userId);
    if (!user?.hunts?.includes(puzzle.hunt)) {
      throw new Meteor.Error(
        403,
        `User ${this.userId} is not a member of hunt ${puzzle.hunt}`,
      );
    }

    if (!puzzle.locked) {
      throw new Meteor.Error(400, "Puzzle is not locked");
    }

    // One row per member per puzzle (enforced by the unique index), updated
    // in place so people can revise their comment.
    const trimmedComment = comment?.trim();
    await PuzzleFeedbacks.upsertAsync(
      {
        puzzle: puzzleId,
        createdBy: this.userId,
      },
      {
        $set: {
          hunt: puzzle.hunt,
          score,
          ...(trimmedComment ? { comment: trimmedComment } : {}),
        },
        ...(trimmedComment ? {} : { $unset: { comment: "" } }),
      },
    );
  },
});
