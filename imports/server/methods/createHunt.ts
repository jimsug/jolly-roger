import { check } from "meteor/check";
import { Meteor } from "meteor/meteor";
import Logger from "../../Logger";
import Hunts from "../../lib/models/Hunts";
import MeteorUsers from "../../lib/models/MeteorUsers";
import { addUserToRole, checkAdmin } from "../../lib/permission_stubs";
import createHunt, { CreateHuntPayloadSchema } from "../../methods/createHunt";
import addUsersToDiscordRole from "../addUsersToDiscordRole";
import { ensureHuntFolder } from "../gdrive";
import getOrCreateTagByName from "../getOrCreateTagByName";
import defineMethod from "./defineMethod";

const DEFAULT_TAGS = [
  "is:meta",
  "is:metameta",
  "is:runaround",
  "priority:high",
  "priority:low",
  "type:crossword",
  "type:duck-konundrum",
  "group:events",
  "needs:extraction",
  "needs:onsite",
];

defineMethod(createHunt, {
  validate(arg) {
    check(arg, CreateHuntPayloadSchema);
    return arg;
  },

  async run(arg) {
    check(this.userId, String);
    checkAdmin(await MeteorUsers.findOneAsync(this.userId));

    Logger.info("Creating a new hunt", arg);

    const { initialTags, ...huntData } = arg;

    const huntId = await Hunts.insertAsync(huntData);
    await addUserToRole(this.userId, huntId, "operator");

    if (initialTags) {
      const initialTagList = initialTags.split(",");
      for (const tag of initialTagList) {
        await getOrCreateTagByName(this.userId, huntId, tag.trim());
      }
    }

    Meteor.defer(async () => {
      // Sync discord roles
      const userIds = (
        await MeteorUsers.find({ hunts: huntId }).fetchAsync()
      ).map((u) => u._id);
      await addUsersToDiscordRole(userIds, huntId);
      await ensureHuntFolder({ _id: huntId, name: arg.name });
    });

    return huntId;
  },
});

export default { DEFAULT_TAGS };
