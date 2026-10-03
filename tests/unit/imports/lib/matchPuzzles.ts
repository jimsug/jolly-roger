import { assert } from "chai";
import matchPuzzles from "../../../../imports/lib/matchPuzzles";

const titlesMatching = (titles: string[], searchString: string) =>
  matchPuzzles(
    titles.map((title) => ({ title })),
    searchString,
  ).map((puzzle) => puzzle.title);

describe("matchPuzzles", function () {
  it("offers nothing for an empty search", function () {
    assert.deepEqual(titlesMatching(["Crossword", "Logic"], ""), []);
  });

  it("matches titles whatever the case", function () {
    assert.deepEqual(
      titlesMatching(["The Hidden Room", "Crossword"], "hIDDen"),
      ["The Hidden Room"],
    );
  });

  it("puts titles starting with the search before ones that contain it", function () {
    assert.deepEqual(
      titlesMatching(
        ["Sea Shanty", "Unrelated", "Shanty Town", "Shanty Song"],
        "shanty",
      ),
      ["Shanty Town", "Shanty Song", "Sea Shanty"],
    );
  });

  it("offers at most ten puzzles", function () {
    const titles = Array.from({ length: 12 }, (_, i) => `Puzzle ${i}`);
    assert.deepEqual(titlesMatching(titles, "puzzle"), titles.slice(0, 10));
  });
});
