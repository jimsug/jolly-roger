import { check } from "meteor/check";
import { Meteor } from "meteor/meteor";
import Logger from "../../Logger";
import applyTagSynonymsJob from "../../lib/jobs/applyTagSynonyms";
import Jobs from "../../lib/models/Jobs";
import MeteorUsers from "../../lib/models/MeteorUsers";
import { userMayConfigureTagSynonyms } from "../../lib/permission_stubs";
import applyTagSynonyms from "../../methods/applyTagSynonyms";
import enqueueJob from "../jobs/framework/enqueueJob";
import withLock from "../withLock";
import defineMethod from "./defineMethod";

defineMethod(applyTagSynonyms, {
  async run() {
    check(this.userId, String);
    if (
      !userMayConfigureTagSynonyms(await MeteorUsers.findOneAsync(this.userId))
    ) {
      throw new Meteor.Error(401, "Must be admin to apply tag synonyms");
    }

    // Under a lock so two calls at once can't both find no job and queue
    // one each.
    await withLock(`jobs:${applyTagSynonymsJob.name}:enqueue`, async () => {
      const inFlight = await Jobs.findOneAsync({
        type: applyTagSynonymsJob.name,
        status: { $in: ["pending", "running"] },
      });
      if (inFlight) {
        throw new Meteor.Error(
          409,
          "Synonyms are already being applied to existing tags",
        );
      }

      Logger.info("Queueing tag synonym apply", { user: this.userId });
      await enqueueJob(applyTagSynonymsJob, {});
    });
  },
});
