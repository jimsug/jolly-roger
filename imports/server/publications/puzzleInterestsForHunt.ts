import { check, Match } from "meteor/check";
import Hunts from "../../lib/models/Hunts";
import MeteorUsers from "../../lib/models/MeteorUsers";
import PuzzleInterests from "../../lib/models/PuzzleInterests";
import { userMayWritePuzzlesForHunt } from "../../lib/permission_stubs";
import puzzleInterestsForHunt from "../../lib/publications/puzzleInterestsForHunt";
import definePublication from "./definePublication";

definePublication(puzzleInterestsForHunt, {
  validate(arg) {
    check(arg, {
      huntId: String,
      puzzleId: Match.Optional(String),
    });
    return arg;
  },

  async run({ huntId, puzzleId }) {
    if (!this.userId) {
      return [];
    }

    const user = await MeteorUsers.findOneAsync(this.userId);
    const hunt = await Hunts.findOneAsync(huntId);
    if (!hunt || !user?.hunts?.includes(huntId)) {
      return [];
    }

    const selector = puzzleId
      ? { hunt: huntId, puzzle: puzzleId }
      : { hunt: huntId };
    // Operators decide what to unlock, so they see everyone's interest. Other
    // members only see their own.
    if (userMayWritePuzzlesForHunt(user, hunt)) {
      return PuzzleInterests.find(selector);
    }
    return PuzzleInterests.find({ ...selector, createdBy: this.userId });
  },
});
