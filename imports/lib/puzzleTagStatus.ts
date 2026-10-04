import {
  canonicalTagName,
  isStuckTag,
  type TagKind,
  tagKind,
  tagPrefixValue,
} from "./tagNames";

// What a puzzle's tags say about it beyond grouping, as the puzzle list and
// the whiteboard's cards show it: a meta badge, a priority icon and a stuck
// flag in place of those tags' chips.
export interface PuzzleTagStatus {
  meta: "meta" | "metameta" | undefined;
  priority: "high" | "low" | undefined;
  stuck: boolean;
  // needs: and location tags, in the order given, which cards show as chips.
  chips: string[];
  // The tags the badge and icons stand for, so a list of chips can leave
  // them out.
  shownAsStatus: Set<string>;
}

export function puzzleStatusFromTags(
  tagNames: Iterable<string | undefined>,
): PuzzleTagStatus {
  const names = [
    ...new Set(
      [...tagNames].filter((name): name is string => name !== undefined),
    ),
  ];
  const ofKind = (...kinds: TagKind[]) =>
    names.filter((name) => kinds.includes(tagKind(name)));
  const canonicalNames = new Set(names.map((name) => canonicalTagName(name)));

  let meta: PuzzleTagStatus["meta"];
  if (ofKind("metameta").length > 0) {
    meta = "metameta";
  } else if (ofKind("meta", "metaFor").length > 0) {
    meta = "meta";
  }

  let priority: PuzzleTagStatus["priority"];
  if (canonicalNames.has("priority:high")) {
    priority = "high";
  } else if (canonicalNames.has("priority:low")) {
    priority = "low";
  }

  const stuckNames = names.filter(isStuckTag);
  const stuck = stuckNames.length > 0;

  const shownAsStatus = new Set<string>();
  if (meta === "metameta") {
    ofKind("metameta").forEach((name) => shownAsStatus.add(name));
  } else if (meta === "meta") {
    // meta-for: stays a chip, since it says which round.
    ofKind("meta").forEach((name) => shownAsStatus.add(name));
  }
  if (priority) {
    names
      .filter((name) => canonicalTagName(name) === `priority:${priority}`)
      .forEach((name) => shownAsStatus.add(name));
  }
  stuckNames.forEach((name) => shownAsStatus.add(name));

  // A bare prefix ("needs:") says nothing worth a chip.
  const chips = ofKind("needs", "location").filter(
    (name) => tagPrefixValue(name) !== "",
  );

  return { meta, priority, stuck, chips, shownAsStatus };
}
