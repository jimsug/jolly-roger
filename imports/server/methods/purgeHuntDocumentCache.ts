import { check } from "meteor/check";
import { Meteor } from "meteor/meteor";
import Logger from "../../Logger";
import Hunts from "../../lib/models/Hunts";
import MeteorUsers from "../../lib/models/MeteorUsers";
import { checkAdmin } from "../../lib/permission_stubs";
import purgeHuntDocumentCache from "../../methods/purgeHuntDocumentCache";
import { isGoogleAvailable, purgeDocumentCache } from "../documentCache";
import defineMethod from "./defineMethod";

defineMethod(purgeHuntDocumentCache, {
  validate(arg) {
    check(arg, { huntId: String });
    return arg;
  },

  async run({ huntId }) {
    check(this.userId, String);
    checkAdmin(await MeteorUsers.findOneAsync(this.userId));

    const hunt = await Hunts.findOneAllowingDeletedAsync(huntId);
    if (!hunt) {
      throw new Meteor.Error(404, "Unknown hunt id");
    }

    // Without Drive the files couldn't be deleted, and dropping the rows
    // alone would just lose track of them.
    if (!(await isGoogleAvailable())) {
      throw new Meteor.Error(500, "Google integration is disabled");
    }

    this.unblock();

    Logger.info("Purging document cache", { huntId, user: this.userId });
    await purgeDocumentCache(huntId);
  },
});
