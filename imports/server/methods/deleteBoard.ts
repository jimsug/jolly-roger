import { check, Match } from "meteor/check";
import { Meteor } from "meteor/meteor";
import Hunts from "../../lib/models/Hunts";
import MeteorUsers from "../../lib/models/MeteorUsers";
import { userMayWritePuzzlesForHunt } from "../../lib/permission_stubs";
import deleteBoard from "../../methods/deleteBoard";
import { removeBoard } from "../board";
import defineMethod from "./defineMethod";

defineMethod(deleteBoard, {
  validate(arg) {
    check(arg, { huntId: String, puzzleId: Match.Optional(String) });
    return arg;
  },

  async run({ huntId, puzzleId }) {
    check(this.userId, String);

    const hunt = await Hunts.findOneAsync(huntId);
    if (!hunt) {
      throw new Meteor.Error(404, "Unknown hunt");
    }
    const user = await MeteorUsers.findOneAsync(this.userId);
    if (!userMayWritePuzzlesForHunt(user, hunt)) {
      throw new Meteor.Error(401, "Must be an operator to delete a board");
    }
    if (hunt.isArchived) {
      throw new Meteor.Error(400, "This hunt is archived");
    }

    this.unblock();
    await removeBoard(hunt, puzzleId);
  },
});
