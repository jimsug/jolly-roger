import { check, Match } from "meteor/check";
import { Meteor } from "meteor/meteor";
import Logger from "../../Logger";
import { DEFAULT_HUNT_TAGS, parseInitialTags } from "../../lib/defaultHuntTags";
import Hunts, { HuntPattern } from "../../lib/models/Hunts";
import MeteorUsers from "../../lib/models/MeteorUsers";
import Settings from "../../lib/models/Settings";
import { addUserToRole, checkAdmin } from "../../lib/permission_stubs";
import createHunt from "../../methods/createHunt";
import addUsersToDiscordRole from "../addUsersToDiscordRole";
import { ensureHuntFolder } from "../gdrive";
import getOrCreateTagByName from "../getOrCreateTagByName";
import defineMethod from "./defineMethod";

// The tags a hunt starts with when the creator leaves the choice to the
// server: the admin-configured list if there is one, else the built-in list.
async function defaultTagNames(): Promise<string[]> {
  const setting = await Settings.findOneAsync({ name: "server.settings" });
  const configured = setting?.value.defaultHuntTags;
  return configured === undefined
    ? DEFAULT_HUNT_TAGS
    : parseInitialTags(configured);
}

defineMethod(createHunt, {
  validate(arg) {
    check(arg, { ...HuntPattern, initialTags: Match.Optional(String) });
    return arg;
  },

  async run({ initialTags, ...hunt }) {
    check(this.userId, String);
    checkAdmin(await MeteorUsers.findOneAsync(this.userId));

    Logger.info("Creating a new hunt", { ...hunt, initialTags });

    const huntId = await Hunts.insertAsync(hunt);
    await addUserToRole(this.userId, huntId, "operator");

    const tags =
      initialTags === undefined
        ? await defaultTagNames()
        : parseInitialTags(initialTags);
    for (const tag of tags) {
      await getOrCreateTagByName(huntId, tag);
    }

    // A failure here (say, Google Drive not being configured) must not take
    // the server down: Meteor.defer drops the promise, so the rejection
    // would otherwise be unhandled.
    Meteor.defer(async () => {
      try {
        // Sync discord roles
        const userIds = (
          await MeteorUsers.find({ hunts: huntId }).fetchAsync()
        ).map((u) => u._id);
        await addUsersToDiscordRole(userIds, huntId);
        await ensureHuntFolder({ _id: huntId, name: hunt.name });
      } catch (error) {
        Logger.warn("Unable to finish setting up hunt", { huntId, error });
      }
    });

    return huntId;
  },
});
