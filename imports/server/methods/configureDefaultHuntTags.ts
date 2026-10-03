import { check, Match } from "meteor/check";
import { Meteor } from "meteor/meteor";
import { parseInitialTags } from "../../lib/defaultHuntTags";
import MeteorUsers from "../../lib/models/MeteorUsers";
import Settings from "../../lib/models/Settings";
import { userMayConfigureDefaultHuntTags } from "../../lib/permission_stubs";
import configureDefaultHuntTags from "../../methods/configureDefaultHuntTags";
import defineMethod from "./defineMethod";

defineMethod(configureDefaultHuntTags, {
  validate(arg) {
    check(arg, {
      defaultHuntTags: Match.Optional(String),
    });
    return arg;
  },

  async run({ defaultHuntTags }) {
    check(this.userId, String);
    if (
      !userMayConfigureDefaultHuntTags(
        await MeteorUsers.findOneAsync(this.userId),
      )
    ) {
      throw new Meteor.Error(
        401,
        "Must be admin to configure default hunt tags",
      );
    }

    // Store the list in canonical form; a blank list means "use the built-in
    // defaults", so the override is dropped rather than stored empty.
    const tags = parseInitialTags(defaultHuntTags ?? "");
    if (tags.length > 0) {
      await Settings.upsertAsync(
        { name: "server.settings" },
        { $set: { value: { defaultHuntTags: tags.join(", ") } } },
      );
    } else {
      await Settings.removeAsync({ name: "server.settings" });
    }
  },
});
