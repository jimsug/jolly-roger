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

const LOCATION_PREFIXES = ["location:", "loc:", "where:"];
const CHIP_PREFIXES = ["needs:", ...LOCATION_PREFIXES];

// location:, loc: and where: all say where a puzzle is, and look the same.
export function isLocationTag(name: string): boolean {
  return LOCATION_PREFIXES.some((prefix) => name.startsWith(prefix));
}

export function puzzleStatusFromTags(
  tagNames: Iterable<string | undefined>,
): PuzzleTagStatus {
  const names = new Set(
    [...tagNames].filter((name): name is string => name !== undefined),
  );

  let meta: PuzzleTagStatus["meta"];
  if (names.has("is:metameta")) {
    meta = "metameta";
  } else if (
    names.has("is:meta") ||
    [...names].some((name) => name.startsWith("meta-for:"))
  ) {
    meta = "meta";
  }

  let priority: PuzzleTagStatus["priority"];
  if (names.has("priority:high")) {
    priority = "high";
  } else if (names.has("priority:low")) {
    priority = "low";
  }

  const stuck = names.has("stuck") || names.has("is:stuck");

  const shownAsStatus = new Set<string>();
  if (meta === "metameta") {
    shownAsStatus.add("is:metameta");
  } else if (meta === "meta") {
    shownAsStatus.add("is:meta");
  }
  if (priority) shownAsStatus.add(`priority:${priority}`);
  if (stuck) {
    shownAsStatus.add("stuck");
    shownAsStatus.add("is:stuck");
  }

  const chips = [...names].filter((name) =>
    CHIP_PREFIXES.some(
      (prefix) => name.startsWith(prefix) && name.length > prefix.length,
    ),
  );

  return { meta, priority, stuck, chips, shownAsStatus };
}
