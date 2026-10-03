// Tag names are compared loosely: surrounding whitespace is dropped and runs of
// whitespace collapse to a single space, so "group: events" and "group:  events "
// name the same tag.
export function normalizeTagName(name: string): string {
  return name.trim().replaceAll(/\s+/g, " ");
}

// Applied when a tag is created or renamed. Existing tags still resolve by
// name whatever their length, so nothing written before the cap breaks.
export const MAX_TAG_NAME_LENGTH = 100;

export function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Matches exactly one tag name (or alias), ignoring case. The name is escaped,
// so tags like "needs:extraction?" are matched literally.
export function tagNameMatcher(name: string): RegExp {
  return new RegExp(`^${escapeRegExp(name)}$`, "i");
}
