import { Meteor } from "meteor/meteor";
import Logger from "../Logger";
import Tags from "../lib/models/Tags";
import {
  MAX_TAG_NAME_LENGTH,
  normalizeTagName,
  tagNameMatcher,
} from "../lib/tagNames";

// Resolves a tag name to a tag id, creating the tag if needed. The name is
// normalised (see normalizeTagName) and matched against existing tags and
// their aliases ignoring case, so "  Group:Events " resolves to "group:events".
export default async function getOrCreateTagByName(
  huntId: string,
  name: string,
): Promise<string> {
  const cleanName = normalizeTagName(name);
  if (!cleanName) {
    throw new Meteor.Error(400, "Tag name must not be empty");
  }

  // Prefer an exact match so that tags differing only by case (which older
  // data may contain) resolve to the one actually named.
  const exactTag = await Tags.findOneAsync({ hunt: huntId, name: cleanName });
  if (exactTag) {
    return exactTag._id;
  }

  const matcher = tagNameMatcher(cleanName);
  const existingTag = await Tags.findOneAsync({
    hunt: huntId,
    $or: [{ name: matcher }, { aliases: matcher }],
  });
  if (existingTag) {
    return existingTag._id;
  }

  if (cleanName.length > MAX_TAG_NAME_LENGTH) {
    throw new Meteor.Error(
      400,
      `Tag name must be at most ${MAX_TAG_NAME_LENGTH} characters`,
    );
  }

  Logger.info("Creating a new tag", { hunt: huntId, name: cleanName });
  const newTagId = await Tags.insertAsync({ hunt: huntId, name: cleanName });

  // When creating a `group:*` tag, also ensure a matching `meta-for:` tag exists.
  if (cleanName.startsWith("group:")) {
    const groupName = cleanName.slice("group:".length);
    const metaTagName = `meta-for:${groupName}`;
    await getOrCreateTagByName(huntId, metaTagName);
  }

  return newTagId;
}
