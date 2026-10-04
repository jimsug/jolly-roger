import { check } from "meteor/check";
import { Meteor } from "meteor/meteor";
import Hunts from "../../lib/models/Hunts";
import MeteorUsers from "../../lib/models/MeteorUsers";
import { userMayConfigureTagSynonyms } from "../../lib/permission_stubs";
import previewTagSynonyms, {
  type TagSynonymPreview,
} from "../../methods/previewTagSynonyms";
import planHuntTagSynonyms from "../planHuntTagSynonyms";
import defineMethod from "./defineMethod";

defineMethod(previewTagSynonyms, {
  async run() {
    check(this.userId, String);
    if (
      !userMayConfigureTagSynonyms(await MeteorUsers.findOneAsync(this.userId))
    ) {
      throw new Meteor.Error(401, "Must be admin to apply tag synonyms");
    }

    const hunts = await Hunts.find(
      {},
      { projection: { name: 1 }, sort: { createdAt: 1 } },
    ).fetchAsync();
    const preview: TagSynonymPreview[] = [];
    for (const hunt of hunts) {
      const steps = await planHuntTagSynonyms(hunt._id);
      const merged = steps.filter((step) => step.mergeInto).length;
      const renamed = steps.length - merged;
      if (steps.length > 0) {
        preview.push({
          huntId: hunt._id,
          huntName: hunt.name,
          renamed,
          merged,
        });
      }
    }
    return preview;
  },
});
