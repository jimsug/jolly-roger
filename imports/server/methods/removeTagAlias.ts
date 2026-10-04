import { check } from "meteor/check";
import { Meteor } from "meteor/meteor";
import Logger from "../../Logger";
import MeteorUsers from "../../lib/models/MeteorUsers";
import Tags from "../../lib/models/Tags";
import removeTagAlias from "../../methods/removeTagAlias";
import defineMethod from "./defineMethod";

defineMethod(removeTagAlias, {
  validate(arg) {
    check(arg, { tagId: String, alias: String });
    return arg;
  },

  async run({ tagId, alias }) {
    check(this.userId, String);

    const tag = await Tags.findOneAsync(tagId);
    if (!tag) {
      throw new Meteor.Error(404, `No tag known with id ${tagId}`);
    }

    // The same bar as renaming: every member of the hunt
    const user = await MeteorUsers.findOneAsync(this.userId);
    if (!user?.hunts?.includes(tag.hunt)) {
      throw new Meteor.Error(
        403,
        `User ${this.userId} is not a member of hunt ${tag.hunt}`,
      );
    }

    // Aliases are matched exactly, as the tag manager sends back what it
    // was shown
    if (!tag.aliases?.includes(alias)) {
      throw new Meteor.Error(404, `Tag ${tagId} has no alias ${alias}`);
    }

    Logger.info("Removing tag alias", { tag: tagId, alias });
    await Tags.updateAsync(tagId, { $pull: { aliases: alias } });
  },
});
