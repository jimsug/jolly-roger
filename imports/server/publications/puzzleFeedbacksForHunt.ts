import { check } from "meteor/check";
import Hunts from "../../lib/models/Hunts";
import MeteorUsers from "../../lib/models/MeteorUsers";
import PuzzleFeedbacks from "../../lib/models/PuzzleFeedbacks";
import { userMayWritePuzzlesForHunt } from "../../lib/permission_stubs";
import puzzleFeedbacksForHunt from "../../lib/publications/puzzleFeedbacksForHunt";
import definePublication from "./definePublication";

definePublication(puzzleFeedbacksForHunt, {
  validate(arg) {
    check(arg, {
      huntId: String,
    });
    return arg;
  },

  async run({ huntId }) {
    if (!this.userId) {
      return [];
    }

    const user = await MeteorUsers.findOneAsync(this.userId);
    const hunt = await Hunts.findOneAsync(huntId);
    if (!hunt || !user?.hunts?.includes(huntId)) {
      return [];
    }

    // Operators decide what to unlock, so they see everyone's interest. Other
    // members only see their own.
    if (userMayWritePuzzlesForHunt(user, hunt)) {
      return PuzzleFeedbacks.find({ hunt: huntId });
    }
    return PuzzleFeedbacks.find({ hunt: huntId, createdBy: this.userId });
  },
});
