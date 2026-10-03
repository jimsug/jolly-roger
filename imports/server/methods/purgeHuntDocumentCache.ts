import { check } from "meteor/check";
import { Meteor } from "meteor/meteor";
import Logger from "../../Logger";
import purgeHuntDocumentCache from "../../lib/jobs/purgeHuntDocumentCache";
import Hunts from "../../lib/models/Hunts";
import MeteorUsers from "../../lib/models/MeteorUsers";
import { checkAdmin } from "../../lib/permission_stubs";
import purgeHuntDocumentCacheMethod from "../../methods/purgeHuntDocumentCache";
import { checkClientOk } from "../gdrive";
import enqueueJob from "../jobs/framework/enqueueJob";
import defineMethod from "./defineMethod";

defineMethod(purgeHuntDocumentCacheMethod, {
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
    await checkClientOk();

    Logger.info("Queueing document cache purge", { huntId, user: this.userId });
    await enqueueJob(purgeHuntDocumentCache, { huntId });
  },
});
