import { check, Match } from "meteor/check";
import { Meteor } from "meteor/meteor";
import Hunts from "../../lib/models/Hunts";
import MeteorUsers from "../../lib/models/MeteorUsers";
import Puzzles from "../../lib/models/Puzzles";
import { primaryEmail } from "../../lib/models/User";
import {
  userMayMakeOperatorForHunt,
  userMayWritePuzzlesForHunt,
} from "../../lib/permission_stubs";
import boardToken from "../../methods/boardToken";
import {
  BOARD_TOKEN_LIFETIME_MS,
  boardScope,
  requireBoardService,
  signBoardToken,
} from "../board";
import defineMethod from "./defineMethod";

defineMethod(boardToken, {
  validate(arg) {
    check(arg, { huntId: String, puzzleId: Match.Optional(String) });
    return arg;
  },

  async run({ huntId, puzzleId }) {
    check(this.userId, String);

    // Members only, admins included: the board shows what the hunt's
    // members can see.
    const hunt = await Hunts.findOneAsync(huntId);
    const user = await MeteorUsers.findOneAsync(this.userId);
    if (!hunt || !user?.hunts?.includes(huntId)) {
      throw new Meteor.Error(401, "Must be a member of the hunt");
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
    const service = await requireBoardService();

    return signBoardToken(
      {
        v: 1,
        scope: boardScope(huntId, puzzleId),
        user: user._id,
        name: user.displayName ?? primaryEmail(user) ?? user._id,
        mayEdit: !hunt.isArchived,
        operator: userMayWritePuzzlesForHunt(user, hunt),
        assignedOperator: userMayMakeOperatorForHunt(user, hunt),
        exp: Date.now() + BOARD_TOKEN_LIFETIME_MS,
      },
      service.secret,
    );
  },
});
