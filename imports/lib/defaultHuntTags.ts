// Tags created for a new hunt when the creator doesn't specify their own.
export const DEFAULT_HUNT_TAGS = [
  "is:meta",
  "is:metameta",
  "is:runaround",
  "priority:high",
  "priority:low",
  "type:crossword",
  "type:duck-konundrum",
  "group:events",
  "needs:extraction",
  "needs:onsite",
];

// Parses the comma-separated "initial tags" field from the hunt creation
// form into a de-duplicated list of tag names, dropping blanks.
export function parseInitialTags(initialTags: string): string[] {
  const names = initialTags
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
  return [...new Set(names)];
}
