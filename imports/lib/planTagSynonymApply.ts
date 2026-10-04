import {
  canonicalTagName,
  MAX_TAG_NAME_LENGTH,
  type TagSynonymRule,
  tagSynonymNames,
} from "./tagNames";

type PlannedTag = { _id: string; name: string; aliases?: string[] };

type TagSynonymApplyStep = {
  tagId: string;
  from: string;
  to: string;
  // The tag the step folds this one into, when another already answers to
  // the canonical name or a synonym of it; otherwise the tag is renamed.
  mergeInto?: string;
};

// What applying a synonym table to one hunt's tags would do, tag by tag in
// the order given, as renameOrMergeTag would do it: a tag whose name a rule
// covers takes its canonical name, merging into another tag that answers to
// that name (or, failing one, to a synonym of it), and keeping its old name as
// an alias. A canonical name too long for a tag leaves the tag alone, as a
// rename would refuse it.
export default function planTagSynonymApply(
  tags: readonly PlannedTag[],
  synonyms: readonly TagSynonymRule[],
): TagSynonymApplyStep[] {
  const live = new Map(
    tags.map((tag) => [
      tag._id,
      { name: tag.name, aliases: [...(tag.aliases ?? [])] },
    ]),
  );
  const answersTo = (id: string, names: Set<string>) => {
    const tag = live.get(id);
    return (
      tag !== undefined &&
      [tag.name, ...tag.aliases].some((n) => names.has(n.toLowerCase()))
    );
  };

  const steps: TagSynonymApplyStep[] = [];
  for (const { _id: tagId } of tags) {
    const tag = live.get(tagId);
    if (!tag) continue;
    const to = canonicalTagName(tag.name, synonyms);
    if (to === tag.name || to.length > MAX_TAG_NAME_LENGTH) continue;

    const exact = new Set([to.toLowerCase()]);
    const similar = new Set(
      tagSynonymNames(to, synonyms).map((n) => n.toLowerCase()),
    );
    const others = [...live.keys()].filter((id) => id !== tagId);
    const mergeInto =
      others.find((id) => answersTo(id, exact)) ??
      others.find((id) => answersTo(id, similar));

    const target = mergeInto ? live.get(mergeInto) : undefined;
    if (mergeInto && target) {
      const targetName = target.name.toLowerCase();
      for (const alias of [...tag.aliases, tag.name]) {
        if (
          alias.toLowerCase() !== targetName &&
          !target.aliases.includes(alias)
        ) {
          target.aliases.push(alias);
        }
      }
      live.delete(tagId);
      steps.push({ tagId, from: tag.name, to, mergeInto });
    } else {
      const lowerTo = to.toLowerCase();
      tag.aliases = tag.aliases.filter((a) => a.toLowerCase() !== lowerTo);
      if (tag.name.toLowerCase() !== lowerTo) {
        tag.aliases.push(tag.name);
      }
      steps.push({ tagId, from: tag.name, to });
      tag.name = to;
    }
  }
  return steps;
}
