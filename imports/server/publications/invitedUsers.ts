import isAdmin from "../../lib/isAdmin";
import MeteorUsers from "../../lib/models/MeteorUsers";
import invitedUsers from "../../lib/publications/invitedUsers";
import definePublication from "./definePublication";

// Users who have been sent an enrollment email but haven't completed signup
// yet. Meteor clears services.password.enroll once the account is set up.
//
// This is admin-only, so it doesn't restrict the result to hunts the viewer
// has access to. If it's ever opened up to non-admins, it will need to filter
// by hunt (and the client pages that consume it already filter client-side).
definePublication(invitedUsers, {
  async run() {
    if (!this.userId) {
      return [];
    }

    if (!isAdmin(await MeteorUsers.findOneAsync(this.userId))) {
      return [];
    }

    return MeteorUsers.find(
      {
        "services.password.enroll.reason": "enroll",
        mergedInto: { $exists: false },
      },
      {
        // Never publish the enrollment token itself
        projection: {
          "services.password.enroll.email": 1,
          "services.password.enroll.when": 1,
          hunts: 1,
          displayName: 1,
        },
      },
    );
  },
});
