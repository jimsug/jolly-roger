import { Meteor } from "meteor/meteor";
import Logger from "../Logger";
import Tags from "../lib/models/Tags";
import {
  canonicalTagName,
  isGroupTag,
  MAX_TAG_NAME_LENGTH,
  META_FOR_TAG_PREFIX,
  normalizeTagName,
  tagPrefixValue,
  tagSynonymMatcher,
} from "../lib/tagNames";
import currentTagSynonyms from "./tagSynonyms";

// Resolves a tag name to a tag id, creating the tag if needed. The name is
// normalised (see normalizeTagName) and matched against existing tags and
// their aliases ignoring case, so "  Group:Events " resolves to "group:events".
// Synonyms (the server-wide table, see currentTagSynonyms) match too:
// "loc:atrium" finds an existing "where:atrium" and "where:atrium" an existing
// "loc:atrium". A new tag is created under the canonical name.
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

  const synonyms = currentTagSynonyms();
  const canonicalName = canonicalTagName(cleanName, synonyms);
  if (canonicalName !== cleanName) {
    const canonicalTag = await Tags.findOneAsync({
      hunt: huntId,
      name: canonicalName,
    });
    if (canonicalTag) {
      return canonicalTag._id;
    }
  }

  const matcher = tagSynonymMatcher(cleanName, synonyms);
  const existingTag = await Tags.findOneAsync({
    hunt: huntId,
    $or: [{ name: matcher }, { aliases: matcher }],
  });
  if (existingTag) {
    return existingTag._id;
  }

  // A group: tag brings a meta-for: tag, a few characters longer, with it,
  // so that has to fit too before either is made.
  const metaForName = isGroupTag(canonicalName, synonyms)
    ? `${META_FOR_TAG_PREFIX}${tagPrefixValue(canonicalName, synonyms) ?? ""}`
    : undefined;
  if (
    canonicalName.length > MAX_TAG_NAME_LENGTH ||
    (metaForName?.length ?? 0) > MAX_TAG_NAME_LENGTH
  ) {
    throw new Meteor.Error(
      400,
      `Tag name must be at most ${MAX_TAG_NAME_LENGTH} characters`,
    );
  }

  Logger.info("Creating a new tag", { hunt: huntId, name: canonicalName });
  const newTagId = await Tags.insertAsync({
    hunt: huntId,
    name: canonicalName,
  });

  // When creating a `group:*` tag, also ensure a matching `meta-for:` tag exists.
  if (metaForName) {
    await getOrCreateTagByName(huntId, metaForName);
  }

  return newTagId;
}

// Resolves several tag names to their tags' ids, without repeats. The names
// go one at a time: resolved side by side, two names for a tag that doesn't
// exist yet (synonyms such as "loc:x" and "where:x", or a group: tag and its
// meta-for: tag) would each create it.
export async function getOrCreateTagsByName(
  huntId: string,
  names: readonly string[],
): Promise<string[]> {
  const tagIds = new Set<string>();
  for (const name of names) {
    tagIds.add(await getOrCreateTagByName(huntId, name));
  }
  return [...tagIds];
}
