import { check } from "meteor/check";
import Hunts from "../../lib/models/Hunts";
import MeteorUsers from "../../lib/models/MeteorUsers";
import PuzzleFeedbacks from "../../lib/models/PuzzleFeedbacks";
import { userMayWritePuzzlesForHunt } from "../../lib/permission_stubs";
import puzzleFeedbacks from "../../lib/publications/puzzleFeedbacks";
import definePublication from "./definePublication";

definePublication(puzzleFeedbacks, {
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
    if (!user || !hunt || !user.hunts?.includes(huntId)) {
      return [];
    }

    const isOperator = userMayWritePuzzlesForHunt(user, hunt);

    if (isOperator) {
      return PuzzleFeedbacks.find({ hunt: huntId });
    } else {
      return PuzzleFeedbacks.find({ hunt: huntId, createdBy: this.userId });
    }
  },
});
