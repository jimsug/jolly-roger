import { check } from "meteor/check";
import { Meteor } from "meteor/meteor";
import MeteorUsers from "../../lib/models/MeteorUsers";
import Tags from "../../lib/models/Tags";
import {
  canonicalTagName,
  MAX_TAG_NAME_LENGTH,
  normalizeTagName,
} from "../../lib/tagNames";
import renameTag from "../../methods/renameTag";
import renameOrMergeTag from "../renameOrMergeTag";
import currentTagSynonyms from "../tagSynonyms";
import defineMethod from "./defineMethod";

defineMethod(renameTag, {
  validate(arg) {
    check(arg, {
      tagId: String,
      name: String,
      keepOldNameAsAlias: Boolean,
    });

    return arg;
  },

  async run({ tagId, name, keepOldNameAsAlias }) {
    check(this.userId, String);

    const tag = await Tags.findOneAsync(tagId);
    if (!tag) {
      throw new Meteor.Error(404, `No tag known with id ${tagId}`);
    }

    // The tag manager is open to every member of the hunt, so that's the bar
    // here too (as it is for adding and removing tags).
    const user = await MeteorUsers.findOneAsync(this.userId);
    if (!user?.hunts?.includes(tag.hunt)) {
      throw new Meteor.Error(
        403,
        `User ${this.userId} is not a member of hunt ${tag.hunt}`,
      );
    }

    // A synonym is stored under its canonical name, as for a new tag (see
    // getOrCreateTagByName)
    const newName = canonicalTagName(
      normalizeTagName(name),
      currentTagSynonyms(),
    );
    if (!newName) {
      throw new Meteor.Error(400, "Tag name must not be empty");
    }
    if (newName.length > MAX_TAG_NAME_LENGTH) {
      throw new Meteor.Error(
        400,
        `Tag name must be at most ${MAX_TAG_NAME_LENGTH} characters`,
      );
    }

    await renameOrMergeTag(tag, newName, keepOldNameAsAlias);
  },
});
