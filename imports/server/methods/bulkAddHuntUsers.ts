import { check } from "meteor/check";
import { Meteor } from "meteor/meteor";
import Logger from "../../Logger";
import Hunts from "../../lib/models/Hunts";
import MeteorUsers from "../../lib/models/MeteorUsers";
import { userMayAddUsersToHunt } from "../../lib/permission_stubs";
import bulkAddHuntUsers from "../../methods/bulkAddHuntUsers";
import addUserToHunt from "../addUserToHunt";
import defineMethod from "./defineMethod";

defineMethod(bulkAddHuntUsers, {
  validate(arg) {
    check(arg, {
      huntId: String,
      emails: [String],
    });
    return arg;
  },

  async run({ huntId, emails }) {
    const { userId } = this;
    check(userId, String);

    const hunt = await Hunts.findOneAsync(huntId);
    if (!hunt) {
      throw new Meteor.Error(404, "Unknown hunt");
    }

    if (!userMayAddUsersToHunt(await MeteorUsers.findOneAsync(userId), hunt)) {
      throw new Meteor.Error(
        401,
        `User ${userId} may not bulk-invite to hunt ${huntId}`,
      );
    }

    const errors: { email: string; error: any }[] = [];
    for (const email of emails) {
      try {
        await addUserToHunt({ hunt, email, invitedBy: userId });
      } catch (error) {
        errors.push({ email, error });
      }
    }

    if (errors.length > 0) {
      const message = errors
        .map(({ email, error }) => {
          const err = error.sanitizedError ?? error;
          // A Meteor.Error is written for whoever made the call. Anything
          // else (a mail server's reply, say) stays in the server's logs.
          if (err instanceof Meteor.Error) {
            return `${email}: ${err}`;
          }
          Logger.warn("Failed to invite a user to a hunt", {
            hunt: huntId,
            email,
            error,
          });
          return `${email}: couldn't send the invite`;
        })
        .join("\n");
      throw new Meteor.Error(
        500,
        `Failed to send invites for some emails:\n${message}`,
      );
    }
  },
});
