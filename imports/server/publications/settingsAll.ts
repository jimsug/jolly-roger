import isAdmin from "../../lib/isAdmin";
import MeteorUsers from "../../lib/models/MeteorUsers";
import Settings from "../../lib/models/Settings";
import settingsAll from "../../lib/publications/settingsAll";
import definePublication from "./definePublication";

definePublication(settingsAll, {
  async run() {
    // Only allow admins to pull down Settings.
    if (!this.userId || !isAdmin(await MeteorUsers.findOneAsync(this.userId))) {
      return [];
    }

    // The board service's shared secret stays on the server. An exclusion
    // goes in fields: a projection would get deleted: 1 added to it and
    // Mongo won't mix the two.
    return Settings.find({}, { fields: { "value.secret": 0 } });
  },
});
