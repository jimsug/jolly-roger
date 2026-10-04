import { check } from "meteor/check";
import { Meteor } from "meteor/meteor";
import Logger from "../../Logger";
import MeteorUsers from "../../lib/models/MeteorUsers";
import Puzzles from "../../lib/models/Puzzles";
import Tags from "../../lib/models/Tags";
import {
  canonicalTagName,
  MAX_TAG_NAME_LENGTH,
  normalizeTagName,
  tagNameMatcher,
  tagSynonymMatcher,
} from "../../lib/tagNames";
import renameTag from "../../methods/renameTag";
import { deferSyncPuzzlesOnBoard } from "../whiteboard";
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
    const newName = canonicalTagName(normalizeTagName(name));
    if (!newName) {
      throw new Meteor.Error(400, "Tag name must not be empty");
    }
    if (newName.length > MAX_TAG_NAME_LENGTH) {
      throw new Meteor.Error(
        400,
        `Tag name must be at most ${MAX_TAG_NAME_LENGTH} characters`,
      );
    }

    // A rename or merge can change which round a puzzle is in, or which meta
    // it feeds, so the whiteboard catches up with these afterwards.
    const affectedPuzzles = await Puzzles.find(
      { hunt: tag.hunt, tags: tagId },
      { projection: { _id: 1 } },
    ).mapAsync((p) => p._id);

    // Another tag answering to the new name, or to one of its synonyms,
    // takes this one in. One named exactly that comes first.
    const matcher = tagNameMatcher(newName);
    const synonymMatcher = tagSynonymMatcher(newName);
    const target =
      (await Tags.findOneAsync({
        hunt: tag.hunt,
        _id: { $ne: tagId },
        $or: [{ name: matcher }, { aliases: matcher }],
      })) ??
      (await Tags.findOneAsync({
        hunt: tag.hunt,
        _id: { $ne: tagId },
        $or: [{ name: synonymMatcher }, { aliases: synonymMatcher }],
      }));

    if (target) {
      // Another tag already answers to the new name: fold this one into it.
      Logger.info("Merging tag", { tag: tagId, into: target._id, name });
      await Puzzles.updateAsync(
        { hunt: tag.hunt, tags: tagId },
        { $addToSet: { tags: target._id } },
        { multi: true },
      );
      await Puzzles.updateAsync(
        { hunt: tag.hunt, tags: tagId },
        { $pull: { tags: tagId } },
        { multi: true },
      );

      // The merged tag's own aliases carry over, and its name does too when
      // requested, so names people already use keep resolving. They're read
      // again here so an alias removed since the start isn't brought back.
      const targetMatcher = tagNameMatcher(target.name);
      const current = await Tags.findOneAsync(tagId, {
        projection: { aliases: 1 },
      });
      const aliases = [
        ...(current?.aliases ?? []),
        ...(keepOldNameAsAlias ? [tag.name] : []),
      ].filter((a) => !targetMatcher.test(a));
      if (aliases.length > 0) {
        await Tags.updateAsync(target._id, {
          $addToSet: { aliases: { $each: aliases } },
        });
      }

      await Tags.destroyAsync(tagId);
      deferSyncPuzzlesOnBoard(tag.hunt, affectedPuzzles);
      return;
    }

    // The new name can't also be one of the tag's own aliases, and a rename
    // that only changes case doesn't need the old spelling kept.
    const aliases = (tag.aliases ?? []).filter((a) => !matcher.test(a));
    if (keepOldNameAsAlias && !matcher.test(tag.name)) {
      aliases.push(tag.name);
    }
    // Renaming a tag to the name it has changes nothing, so there's nothing
    // to write and no board to resync
    if (newName === tag.name && aliases.length === (tag.aliases?.length ?? 0)) {
      return;
    }
    // Aliases change in place rather than being written back whole, so an
    // alias removed while this ran stays removed
    Logger.info("Renaming tag", { tag: tagId, name: newName });
    await Tags.updateAsync(tagId, {
      $set: { name: newName },
      $pull: { aliases: matcher },
    });
    if (keepOldNameAsAlias && !matcher.test(tag.name)) {
      await Tags.updateAsync(tagId, { $addToSet: { aliases: tag.name } });
    }
    deferSyncPuzzlesOnBoard(tag.hunt, affectedPuzzles);
  },
});
