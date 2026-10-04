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

// A synonym names the same thing as a canonical tag. A prefix rule rewrites
// the start of a name ("loc:atrium" is "where:atrium"), a tag rule a whole
// name. New tags are created under the canonical name; tags made before a
// rule existed keep their names, and everything below reads them through it.
export type TagSynonymRule = {
  kind: "prefix" | "tag";
  from: string;
  to: string;
};

export const TAG_SYNONYMS: readonly TagSynonymRule[] = [
  { kind: "prefix", from: "location:", to: "where:" },
  { kind: "prefix", from: "loc:", to: "where:" },
  { kind: "tag", from: "stuck", to: "is:stuck" },
];

// The first rule that applies wins; a name no rule covers is already
// canonical.
export function canonicalTagName(
  name: string,
  synonyms: readonly TagSynonymRule[] = TAG_SYNONYMS,
): string {
  for (const rule of synonyms) {
    if (rule.kind === "tag" && name === rule.from) {
      return rule.to;
    }
    if (rule.kind === "prefix" && name.startsWith(rule.from)) {
      return `${rule.to}${name.slice(rule.from.length)}`;
    }
  }
  return name;
}

// Every name that means the same as this one, itself and its canonical name
// included, so a lookup can find a tag stored under any of them.
export function tagSynonymNames(
  name: string,
  synonyms: readonly TagSynonymRule[] = TAG_SYNONYMS,
): string[] {
  const canonical = canonicalTagName(name, synonyms);
  const names = new Set([name, canonical]);
  for (const rule of synonyms) {
    if (rule.kind === "tag" && rule.to === canonical) {
      names.add(rule.from);
    }
    if (rule.kind === "prefix" && canonical.startsWith(rule.to)) {
      names.add(`${rule.from}${canonical.slice(rule.to.length)}`);
    }
  }
  return [...names].filter(
    (candidate) => canonicalTagName(candidate, synonyms) === canonical,
  );
}

// Matches a tag name (or alias) that means the same as this one, ignoring
// case: the name itself, its canonical name or another synonym of it.
export function tagSynonymMatcher(
  name: string,
  synonyms: readonly TagSynonymRule[] = TAG_SYNONYMS,
): RegExp {
  return new RegExp(
    `^(?:${tagSynonymNames(name, synonyms).map(escapeRegExp).join("|")})$`,
    "i",
  );
}

export type TagKind =
  | "group"
  | "metaFor"
  | "location"
  | "meta"
  | "metameta"
  | "stuck"
  | "needs"
  | "priority"
  | "administrivia"
  | "plain";

export const GROUP_TAG_PREFIX = "group:";
export const META_FOR_TAG_PREFIX = "meta-for:";

const PREFIX_KINDS: readonly (readonly [string, TagKind])[] = [
  [GROUP_TAG_PREFIX, "group"],
  [META_FOR_TAG_PREFIX, "metaFor"],
  ["where:", "location"],
  ["needs:", "needs"],
  ["priority:", "priority"],
];

const WHOLE_TAG_KINDS: ReadonlyMap<string, TagKind> = new Map<string, TagKind>([
  ["administrivia", "administrivia"],
  ["is:meta", "meta"],
  ["is:metameta", "metameta"],
  ["is:stuck", "stuck"],
]);

// What a tag means to Jolly Roger, read from its canonical name. Prefixes
// are matched as typed (case and all), so "Group:x" is a plain tag.
export function tagKind(name: string): TagKind {
  const canonical = canonicalTagName(name);
  const whole = WHOLE_TAG_KINDS.get(canonical);
  if (whole) {
    return whole;
  }
  const prefixed = PREFIX_KINDS.find(([prefix]) =>
    canonical.startsWith(prefix),
  );
  return prefixed ? prefixed[1] : "plain";
}

// The canonical name without its kind's prefix ("loc:atrium" gives
// "atrium"), or undefined for a kind that isn't a prefix.
export function tagPrefixValue(name: string): string | undefined {
  const canonical = canonicalTagName(name);
  const prefixed = PREFIX_KINDS.find(([prefix]) =>
    canonical.startsWith(prefix),
  );
  return prefixed ? canonical.slice(prefixed[0].length) : undefined;
}

export function isGroupTag(name: string): boolean {
  return tagKind(name) === "group";
}

export function isMetaForTag(name: string): boolean {
  return tagKind(name) === "metaFor";
}

export function isLocationTag(name: string): boolean {
  return tagKind(name) === "location";
}

// is:meta, or meta-for: naming the round it is the meta of.
export function isMetaTag(name: string): boolean {
  const kind = tagKind(name);
  return kind === "meta" || kind === "metaFor";
}

export function isMetametaTag(name: string): boolean {
  return tagKind(name) === "metameta";
}

export function isStuckTag(name: string): boolean {
  return tagKind(name) === "stuck";
}

// Functional tags say how a puzzle is organised or worked on rather than
// what it is about: any tag with a prefix (group:, meta-for:, priority:,
// where:, or anything else before a colon). The puzzle form takes them apart
// from the rest. It reads the canonical name, so a synonym without a prefix,
// such as bare "stuck" (canonically "is:stuck"), counts as functional too.
export function isFunctionalTag(name: string): boolean {
  return canonicalTagName(name).includes(":");
}

// Tag names A to Z ignoring case, as the tag pickers list them.
export function compareTagNames(a: string, b: string): number {
  return a.toLowerCase().localeCompare(b.toLowerCase());
}
