import { z } from "zod";
import { nonEmptyString } from "./typedModel/customTypes";

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
// name. Rules match case-sensitively, as the kind prefixes below do. New tags
// are created under the canonical name; tags made before a rule existed keep
// their names until an admin applies the table to them, and everything below
// reads them through it.
export const TagSynonymRuleSchema = z.object({
  kind: z.enum(["prefix", "tag"]),
  match: nonEmptyString,
  to: nonEmptyString,
});
export type TagSynonymRule = z.output<typeof TagSynonymRuleSchema>;

// The table in force when no server-wide one has been saved on the Setup page,
// and the one the helpers below apply unless given another. The server keeps
// the saved table in imports/server/tagSynonyms.ts and components read it with
// useTagSynonyms.
export const TAG_SYNONYMS: readonly TagSynonymRule[] = [
  { kind: "prefix", match: "location:", to: "where:" },
  { kind: "prefix", match: "loc:", to: "where:" },
  { kind: "tag", match: "stuck", to: "is:stuck" },
];

export type TagSynonymProblem =
  | "empty"
  | "prefixColon"
  | "self"
  | "chain"
  | "duplicate";

// Rules as an admin types them, with each name normalised as tag names are.
export function cleanTagSynonymRules(
  rules: readonly TagSynonymRule[],
): TagSynonymRule[] {
  return rules.map((rule) => ({
    kind: rule.kind,
    match: normalizeTagName(rule.match),
    to: normalizeTagName(rule.to),
  }));
}

function ruleApplies(rule: TagSynonymRule, name: string): boolean {
  return rule.kind === "tag"
    ? name === rule.match
    : name.startsWith(rule.match);
}

// What's wrong with each rule of a table, by index; a valid table has no
// entries. No name a rule produces may be rewritten by a rule, so a name is
// never more than one step from its canonical form. For a prefix rule that
// covers every name under its canonical prefix, so another rule's match may
// not start with it either.
export function tagSynonymRuleProblems(
  rules: readonly TagSynonymRule[],
): Map<number, TagSynonymProblem> {
  const problems = new Map<number, TagSynonymProblem>();
  const seen = new Set<string>();
  rules.forEach((rule, index) => {
    const key = `${rule.kind}\n${rule.match}`;
    if (rule.match === "" || rule.to === "") {
      problems.set(index, "empty");
    } else if (
      rule.kind === "prefix" &&
      (!rule.match.endsWith(":") || !rule.to.endsWith(":"))
    ) {
      problems.set(index, "prefixColon");
    } else if (rule.match === rule.to) {
      problems.set(index, "self");
    } else if (seen.has(key)) {
      problems.set(index, "duplicate");
    } else if (
      rules.some(
        (other) =>
          other.match !== "" &&
          (ruleApplies(other, rule.to) ||
            (rule.kind === "prefix" && other.match.startsWith(rule.to))),
      )
    ) {
      problems.set(index, "chain");
    }
    seen.add(key);
  });
  return problems;
}

// The first rule that applies wins; a name no rule covers is already
// canonical.
export function canonicalTagName(
  name: string,
  synonyms: readonly TagSynonymRule[] = TAG_SYNONYMS,
): string {
  for (const rule of synonyms) {
    if (rule.kind === "tag" && name === rule.match) {
      return rule.to;
    }
    if (rule.kind === "prefix" && name.startsWith(rule.match)) {
      return `${rule.to}${name.slice(rule.match.length)}`;
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
      names.add(rule.match);
    }
    if (rule.kind === "prefix" && canonical.startsWith(rule.to)) {
      names.add(`${rule.match}${canonical.slice(rule.to.length)}`);
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
export function tagKind(
  name: string,
  synonyms: readonly TagSynonymRule[] = TAG_SYNONYMS,
): TagKind {
  const canonical = canonicalTagName(name, synonyms);
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
export function tagPrefixValue(
  name: string,
  synonyms: readonly TagSynonymRule[] = TAG_SYNONYMS,
): string | undefined {
  const canonical = canonicalTagName(name, synonyms);
  const prefixed = PREFIX_KINDS.find(([prefix]) =>
    canonical.startsWith(prefix),
  );
  return prefixed ? canonical.slice(prefixed[0].length) : undefined;
}

export function isGroupTag(
  name: string,
  synonyms: readonly TagSynonymRule[] = TAG_SYNONYMS,
): boolean {
  return tagKind(name, synonyms) === "group";
}

export function isMetaForTag(
  name: string,
  synonyms: readonly TagSynonymRule[] = TAG_SYNONYMS,
): boolean {
  return tagKind(name, synonyms) === "metaFor";
}

export function isLocationTag(
  name: string,
  synonyms: readonly TagSynonymRule[] = TAG_SYNONYMS,
): boolean {
  return tagKind(name, synonyms) === "location";
}

// is:meta, or meta-for: naming the round it is the meta of.
export function isMetaTag(
  name: string,
  synonyms: readonly TagSynonymRule[] = TAG_SYNONYMS,
): boolean {
  const kind = tagKind(name, synonyms);
  return kind === "meta" || kind === "metaFor";
}

export function isMetametaTag(
  name: string,
  synonyms: readonly TagSynonymRule[] = TAG_SYNONYMS,
): boolean {
  return tagKind(name, synonyms) === "metameta";
}

export function isStuckTag(
  name: string,
  synonyms: readonly TagSynonymRule[] = TAG_SYNONYMS,
): boolean {
  return tagKind(name, synonyms) === "stuck";
}

// Functional tags say how a puzzle is organised or worked on rather than
// what it is about: any tag with a prefix (group:, meta-for:, priority:,
// where:, or anything else before a colon). The puzzle form takes them apart
// from the rest. It reads the canonical name, so a synonym without a prefix,
// such as bare "stuck" (canonically "is:stuck"), counts as functional too.
export function isFunctionalTag(
  name: string,
  synonyms: readonly TagSynonymRule[] = TAG_SYNONYMS,
): boolean {
  return canonicalTagName(name, synonyms).includes(":");
}

// Tag names A to Z ignoring case, as the tag pickers list them.
export function compareTagNames(a: string, b: string): number {
  return a.toLowerCase().localeCompare(b.toLowerCase());
}
