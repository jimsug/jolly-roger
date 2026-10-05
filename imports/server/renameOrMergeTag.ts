import Logger from "../Logger";
import Puzzles from "../lib/models/Puzzles";
import type { TagType } from "../lib/models/Tags";
import Tags from "../lib/models/Tags";
import { tagNameMatcher, tagSynonymMatcher } from "../lib/tagNames";
import currentTagSynonyms from "./tagSynonyms";
import { deferSyncPuzzlesOnBoard } from "./whiteboard";
import withLock from "./withLock";

// Gives a tag a new name, already normalised and canonical. When another tag
// in the hunt answers to that name, or to a synonym of it, the tag is folded
// into that one instead: its puzzles move across, its aliases carry over and
// it is destroyed. Either way the old name can be kept as an alias. Runs
// under the hunt's hunt:<id>:tags lock, reading the tag again there, so two
// at once can't move puzzles onto a tag the other is destroying. With
// onlyIfNamed, a tag that has been renamed since is left alone.
export default function renameOrMergeTag(
  tag: TagType,
  newName: string,
  keepOldNameAsAlias: boolean,
  { onlyIfNamed }: { onlyIfNamed?: string } = {},
): Promise<"renamed" | "merged" | "unchanged"> {
  return withLock(`hunt:${tag.hunt}:tags`, async () => {
    const current = await Tags.findOneAsync(tag._id);
    if (!current) return "unchanged";
    if (onlyIfNamed !== undefined && current.name !== onlyIfNamed) {
      return "unchanged";
    }
    return renameOrMergeLocked(current, newName, keepOldNameAsAlias);
  });
}

async function renameOrMergeLocked(
  tag: TagType,
  newName: string,
  keepOldNameAsAlias: boolean,
): Promise<"renamed" | "merged" | "unchanged"> {
  // A rename or merge can change which round a puzzle is in, or which meta
  // it feeds, so the whiteboard catches up with these afterwards.
  const affectedPuzzles = await Puzzles.find(
    { hunt: tag.hunt, tags: tag._id },
    { projection: { _id: 1 } },
  ).mapAsync((p) => p._id);

  // Another tag answering to the new name, or to one of its synonyms,
  // takes this one in. One named exactly that comes first.
  const matcher = tagNameMatcher(newName);
  const synonymMatcher = tagSynonymMatcher(newName, currentTagSynonyms());
  const target =
    (await Tags.findOneAsync({
      hunt: tag.hunt,
      _id: { $ne: tag._id },
      $or: [{ name: matcher }, { aliases: matcher }],
    })) ??
    (await Tags.findOneAsync({
      hunt: tag.hunt,
      _id: { $ne: tag._id },
      $or: [{ name: synonymMatcher }, { aliases: synonymMatcher }],
    }));

  if (target) {
    Logger.info("Merging tag", {
      tag: tag._id,
      into: target._id,
      name: newName,
    });
    await Puzzles.updateAsync(
      { hunt: tag.hunt, tags: tag._id },
      { $addToSet: { tags: target._id } },
      { multi: true },
    );
    await Puzzles.updateAsync(
      { hunt: tag.hunt, tags: tag._id },
      { $pull: { tags: tag._id } },
      { multi: true },
    );

    // The merged tag's own aliases carry over, and its name does too when
    // requested, so names people already use keep resolving. They're read
    // again here so an alias removed since the start isn't brought back.
    const targetMatcher = tagNameMatcher(target.name);
    const current = await Tags.findOneAsync(tag._id, {
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

    await Tags.destroyAsync(tag._id);
    deferSyncPuzzlesOnBoard(tag.hunt, affectedPuzzles);
    return "merged";
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
    return "unchanged";
  }
  // Aliases change in place rather than being written back whole, so an
  // alias removed while this ran stays removed
  Logger.info("Renaming tag", { tag: tag._id, name: newName });
  await Tags.updateAsync(tag._id, {
    $set: { name: newName },
    $pull: { aliases: matcher },
  });
  if (keepOldNameAsAlias && !matcher.test(tag.name)) {
    await Tags.updateAsync(tag._id, { $addToSet: { aliases: tag.name } });
  }
  deferSyncPuzzlesOnBoard(tag.hunt, affectedPuzzles);
  return "renamed";
}
