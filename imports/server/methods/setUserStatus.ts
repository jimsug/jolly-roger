import { check, Match } from "meteor/check";
import { Meteor } from "meteor/meteor";
import MeteorUsers from "../../lib/models/MeteorUsers";
import Puzzles from "../../lib/models/Puzzles";
import UserStatuses, {
  statusAllowedForType,
  USER_STATUS_TYPES,
  USER_STATUS_VALUES,
} from "../../lib/models/UserStatuses";
import setUserStatus from "../../methods/setUserStatus";
import serverId from "../serverId";
import defineMethod from "./defineMethod";

// Records the caller's own presence in a hunt. The row is keyed by the
// connection making the call, so it is the same row the userStatus.inc
// publication maintains for that connection.
defineMethod(setUserStatus, {
  validate(arg) {
    check(arg, {
      hunt: String,
      type: Match.OneOf(...USER_STATUS_TYPES),
      status: Match.OneOf(...USER_STATUS_VALUES),
      puzzle: Match.Optional(String),
    });

    return arg;
  },

  async run({ hunt, type, status, puzzle }) {
    check(this.userId, String);

    if (!statusAllowedForType(type, status)) {
      throw new Meteor.Error(400, `Status ${status} is not a ${type}`);
    }
    if (type === "puzzleStatus" && !puzzle) {
      throw new Meteor.Error(400, "A puzzle status needs a puzzle");
    }

    const user = await MeteorUsers.findOneAsync(this.userId);
    if (!user?.hunts?.includes(hunt)) {
      throw new Meteor.Error(403, "Not a member of this hunt");
    }
    if (puzzle && !(await Puzzles.findOneAsync({ _id: puzzle, hunt }))) {
      throw new Meteor.Error(400, "No such puzzle in this hunt");
    }

    await UserStatuses.upsertAsync(
      {
        hunt,
        user: this.userId,
        type,
        server: serverId,
        ...(this.connection ? { connection: this.connection.id } : {}),
      },
      {
        $set: {
          status,
          ...(puzzle ? { puzzle } : {}),
        },
      },
    );
  },
});
