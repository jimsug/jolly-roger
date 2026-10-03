import isAdmin from "../../lib/isAdmin";
import MeteorUsers from "../../lib/models/MeteorUsers";
import invitedUsersAll from "../../lib/publications/invitedUsersAll";
import findPendingInvitees from "../findPendingInvitees";
import definePublication from "./definePublication";

// Every pending invitee, for the pending invitations page and the Invited
// badge on the list of hunters. Admin-only, so it doesn't restrict the result
// to hunts the viewer has access to.
definePublication(invitedUsersAll, {
  async run() {
    if (!this.userId) {
      return [];
    }

    if (!isAdmin(await MeteorUsers.findOneAsync(this.userId))) {
      return [];
    }

    return findPendingInvitees();
  },
});
