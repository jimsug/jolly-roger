import { check, Match } from "meteor/check";
import { Meteor } from "meteor/meteor";
import Hunts from "../../lib/models/Hunts";
import MeteorUsers from "../../lib/models/MeteorUsers";
import Puzzles from "../../lib/models/Puzzles";
import { userMayWritePuzzlesForHunt } from "../../lib/permission_stubs";
import ensureBoardMethod from "../../methods/ensureBoard";
import { ensureBoard } from "../board";
import defineMethod from "./defineMethod";

defineMethod(ensureBoardMethod, {
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
      throw new Meteor.Error(401, "Must be an operator to create a board");
    }
    if (hunt.isArchived) {
      throw new Meteor.Error(400, "This hunt is archived");
    }
    if (puzzleId) {
      const puzzle = await Puzzles.findOneAsync({
        _id: puzzleId,
        hunt: huntId,
      });
      if (!puzzle) {
        throw new Meteor.Error(404, "Unknown puzzle");
      }
    }

    this.unblock();
    return ensureBoard(hunt, puzzleId);
  },
});
