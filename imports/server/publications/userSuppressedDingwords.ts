import { Meteor } from "meteor/meteor";
import MeteorUsers from "../../lib/models/MeteorUsers";

// Per-puzzle dingword mutes are private, so they ride along on the user's
// own document rather than the profile fields other members can see.
Meteor.publish(null, function () {
  if (!this.userId) {
    return [];
  }

  return MeteorUsers.find(this.userId, {
    projection: { suppressedDingwords: 1 },
  });
});
