import type { GuessType } from "../lib/models/Guesses";
import type { PuzzleType } from "../lib/models/Puzzles";
import type { TagType } from "../lib/models/Tags";
import { computeSolvedness } from "../lib/solvedness";

// Given a set of tags and a set of search keys, produces a function that will
// evaluate whether a puzzle should be included for the given search filter.
// extraTerms can add more text to match against per puzzle, such as the
// names of the people on it.
function compilePuzzleMatcher(
  allTags: TagType[],
  searchKeys: string[],
  extraTerms?: (p: PuzzleType) => string[],
): (p: PuzzleType) => boolean {
  const tagNames: Record<string, string> = {};
  allTags.forEach((t) => {
    tagNames[t._id] = t.name.toLowerCase();
  });
  const lowerSearchKeys = searchKeys.map((key) => key.toLowerCase());
  return function (puzzle) {
    const titleWords = puzzle.title.toLowerCase().split(" ");
    const extra = extraTerms?.(puzzle).map((term) => term.toLowerCase()) ?? [];
    return lowerSearchKeys.every((key) => {
      // Every key should match at least one of the following:
      // * prefix of word in title
      // * substring of any answer
      // * substring of any tag
      // * substring of any extra term
      if (titleWords.some((word) => word.startsWith(key))) {
        return true;
      }

      if (
        puzzle.answers.some((answer) => {
          return answer.toLowerCase().includes(key);
        })
      ) {
        return true;
      }

      const tagMatch = puzzle.tags.some((tagId) => {
        const tagName = tagNames[tagId];
        return tagName?.includes(key);
      });

      if (tagMatch) {
        return true;
      }

      return extra.some((term) => term.includes(key));
    });
  };
}

// The puzzles matching every space-separated key in searchString (all of
// them when there are no keys), as compilePuzzleMatcher matches them.
function puzzlesMatchingSearchString(
  puzzles: PuzzleType[],
  allTags: TagType[],
  searchString: string,
  extraTerms?: (p: PuzzleType) => string[],
): PuzzleType[] {
  const searchKeys = searchString.split(" ").filter((key) => key.length > 0);
  if (searchKeys.length === 0) {
    // No search query, so no need to do fancy search computation
    return puzzles;
  }
  return puzzles.filter(compilePuzzleMatcher(allTags, searchKeys, extraTerms));
}

// Drops solved puzzles unless they're to be shown. Items with no expected
// answer always stay, since they're generally pinned administrivia.
function puzzlesMatchingSolvedFilter(
  puzzles: PuzzleType[],
  showSolved: boolean,
): PuzzleType[] {
  if (showSolved) {
    return puzzles;
  }
  return puzzles.filter((puzzle) => computeSolvedness(puzzle) !== "solved");
}

function compileGuessMatcher(
  puzzles: Map<string, PuzzleType>,
  displayNames: Map<string, string>,
  searchKeys: string[],
): (g: GuessType) => boolean {
  // Given a list a search keys, compileGuessMatcher returns a function that,
  // given a guess, returns true if all search keys match that guess in
  // some way, and false if any of the search keys cannot be found in
  // the guess, the puzzle title or the submitter's name.
  const lowerSearchKeys = searchKeys.map((key) => key.toLowerCase());
  return (guess) => {
    const title = puzzles.get(guess.puzzle)?.title.toLowerCase() ?? "";
    const guessText = guess.guess.toLowerCase();
    const submitterDisplayName = (
      displayNames.get(guess.createdBy) ?? ""
    ).toLowerCase();

    // Every key must appear somewhere; the title matches on any substring,
    // so "ross" finds "Crossword".
    return lowerSearchKeys.every((key) => {
      return (
        guessText.includes(key) ||
        title.includes(key) ||
        submitterDisplayName.includes(key)
      );
    });
  };
}

export {
  compileGuessMatcher,
  compilePuzzleMatcher,
  puzzlesMatchingSearchString,
  puzzlesMatchingSolvedFilter,
};
