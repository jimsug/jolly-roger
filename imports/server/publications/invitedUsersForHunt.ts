import { check } from "meteor/check";
import isAdmin from "../../lib/isAdmin";
import MeteorUsers from "../../lib/models/MeteorUsers";
import invitedUsersForHunt from "../../lib/publications/invitedUsersForHunt";
import findPendingInvitees from "../findPendingInvitees";
import definePublication from "./definePublication";

// One hunt's pending invitees, for its invite page. Admin-only, like
// invitedUsersAll.
definePublication(invitedUsersForHunt, {
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

    if (!isAdmin(await MeteorUsers.findOneAsync(this.userId))) {
      return [];
    }

    return findPendingInvitees(huntId);
  },
});
