// The bookmarklet sends the hunt page's exact location, which may differ from
// the URL a puzzle was added with by a fragment or a trailing slash.
export function normalizePuzzleUrl(url: string): string {
  const withoutFragment = url.split("#", 1)[0] ?? "";
  return withoutFragment.replace(/\/+$/, "");
}

// Whether a puzzle is the one a bookmarklet page refers to: the same URL once
// normalised, or (for sites whose puzzle URLs carry extra path under the page
// the bookmarklet was used on) a puzzle URL that extends the page URL.
export function puzzleMatchesUrl(
  puzzleUrl: string | undefined,
  pageUrl: string,
): boolean {
  if (!puzzleUrl) {
    return false;
  }
  const normalizedPage = normalizePuzzleUrl(pageUrl);
  if (normalizedPage.length === 0) {
    return false;
  }
  const normalizedPuzzle = normalizePuzzleUrl(puzzleUrl);
  return (
    normalizedPuzzle === normalizedPage ||
    normalizedPuzzle.startsWith(`${normalizedPage}/`)
  );
}

// Prefers an exact match over one that merely extends the page URL.
export function findPuzzleForUrl<T extends { url?: string }>(
  puzzles: T[],
  pageUrl: string,
): T | undefined {
  const normalizedPage = normalizePuzzleUrl(pageUrl);
  return (
    puzzles.find(
      (puzzle) =>
        puzzle.url !== undefined &&
        normalizePuzzleUrl(puzzle.url) === normalizedPage,
    ) ?? puzzles.find((puzzle) => puzzleMatchesUrl(puzzle.url, pageUrl))
  );
}
