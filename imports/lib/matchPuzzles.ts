import { sortedBy } from "./listUtils";

// Hunts have hundreds of puzzles, so the list is kept short: a title that
// starts with the search comes before one that merely contains it.
const MAX_PUZZLE_MATCHES = 10;

// The puzzles the chat's !-completion offers for a search, matched on title
// whatever the case.
export default function matchPuzzles<T extends { title: string }>(
  puzzles: T[],
  searchString: string,
): T[] {
  if (!searchString) return [];

  const needle = searchString.toLowerCase();
  const matches = puzzles.filter((p) => p.title.toLowerCase().includes(needle));
  return sortedBy(matches, (p) =>
    p.title.toLowerCase().startsWith(needle) ? 0 : 1,
  ).slice(0, MAX_PUZZLE_MATCHES);
}
