import type { TagSynonymRule } from "./tagNames";
import {
  canonicalTagName,
  normalizeTagName,
  tagSynonymMatcher,
} from "./tagNames";

type NamedTag = { name: string; aliases?: string[] };

// The hunt tag a name resolves to, found the way getOrCreateTagByName finds
// it: by exact name, then by canonical name, then by any name or alias that
// means the same, ignoring case.
function findTag<T extends NamedTag>(
  name: string,
  tags: readonly T[],
  synonyms: readonly TagSynonymRule[],
): T | undefined {
  const exact = tags.find((tag) => tag.name === name);
  if (exact) {
    return exact;
  }
  const canonical = canonicalTagName(name, synonyms);
  const canonicalTag = tags.find((tag) => tag.name === canonical);
  if (canonicalTag) {
    return canonicalTag;
  }
  const matcher = tagSynonymMatcher(name, synonyms);
  return tags.find(
    (tag) =>
      matcher.test(tag.name) ||
      (tag.aliases ?? []).some((alias) => matcher.test(alias)),
  );
}

// The name a tag picked in the puzzle form is remembered under: the canonical
// name of the hunt tag it resolves to, so an alias or synonym is remembered
// as the tag it stands for. A name no tag has yet becomes a tag under its
// canonical name, so that is the name kept.
export function recentTagName(
  name: string,
  tags: readonly NamedTag[],
  synonyms: readonly TagSynonymRule[],
): string {
  const cleanName = normalizeTagName(name);
  const tag = findTag(cleanName, tags, synonyms);
  return canonicalTagName(tag?.name ?? cleanName, synonyms);
}

// A remembered tag to offer: shown under its canonical name, and added under
// the name the hunt's tag has now, which is what the tag pickers list.
export type OfferedRecentTag = { label: string; value: string };

// The remembered tags to offer, in the order remembered: those the hunt still
// has, leaving out any already applied.
export function recentTagsToOffer(
  recent: readonly string[],
  tags: readonly NamedTag[],
  applied: readonly string[],
  synonyms: readonly TagSynonymRule[],
): OfferedRecentTag[] {
  const skip = new Set(
    applied.map((name) => recentTagName(name, tags, synonyms).toLowerCase()),
  );
  const offered: OfferedRecentTag[] = [];
  for (const name of recent) {
    const tag = findTag(normalizeTagName(name), tags, synonyms);
    if (!tag) {
      continue;
    }
    const canonical = canonicalTagName(tag.name, synonyms);
    if (!skip.has(canonical.toLowerCase())) {
      skip.add(canonical.toLowerCase());
      offered.push({ label: canonical, value: tag.name });
    }
  }
  return offered;
}
