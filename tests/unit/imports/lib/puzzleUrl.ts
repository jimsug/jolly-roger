import { assert } from "chai";
import {
  findPuzzleForUrl,
  normalizePuzzleUrl,
  puzzleMatchesUrl,
} from "../../../../imports/lib/puzzleUrl";

describe("normalizePuzzleUrl", function () {
  it("drops fragments and trailing slashes", function () {
    assert.equal(
      normalizePuzzleUrl("https://example.com/puzzle/a/#top"),
      "https://example.com/puzzle/a",
    );
    assert.equal(
      normalizePuzzleUrl("https://example.com/puzzle/a?x=1"),
      "https://example.com/puzzle/a?x=1",
    );
    assert.equal(normalizePuzzleUrl(""), "");
  });
});

describe("puzzleMatchesUrl", function () {
  it("matches the same page however it was written", function () {
    assert.isTrue(
      puzzleMatchesUrl(
        "https://example.com/puzzle/a",
        "https://example.com/puzzle/a",
      ),
    );
    assert.isTrue(
      puzzleMatchesUrl(
        "https://example.com/puzzle/a/",
        "https://example.com/puzzle/a#hint",
      ),
    );
  });

  it("matches a puzzle whose URL extends the page's", function () {
    assert.isTrue(
      puzzleMatchesUrl(
        "https://example.com/puzzle/a/index.html",
        "https://example.com/puzzle/a",
      ),
    );
    assert.isFalse(
      puzzleMatchesUrl(
        "https://example.com/puzzle/abc",
        "https://example.com/puzzle/a",
      ),
    );
  });

  it("never matches without a URL to compare", function () {
    assert.isFalse(puzzleMatchesUrl(undefined, "https://example.com/puzzle/a"));
    assert.isFalse(puzzleMatchesUrl("https://example.com/puzzle/a", ""));
    assert.isFalse(puzzleMatchesUrl("https://example.com/puzzle/a", "#"));
  });
});

describe("findPuzzleForUrl", function () {
  const puzzles = [
    { _id: "deeper", url: "https://example.com/puzzle/a/part2" },
    { _id: "exact", url: "https://example.com/puzzle/a" },
    { _id: "other", url: "https://example.com/puzzle/b" },
    { _id: "none" },
  ];

  it("prefers an exact match over a puzzle that extends the page URL", function () {
    assert.equal(
      findPuzzleForUrl(puzzles, "https://example.com/puzzle/a/")?._id,
      "exact",
    );
    assert.equal(
      findPuzzleForUrl(puzzles, "https://example.com/puzzle/a/part2#x")?._id,
      "deeper",
    );
  });

  it("falls back to the extending puzzle, and otherwise finds nothing", function () {
    assert.equal(
      findPuzzleForUrl(
        puzzles.filter((p) => p._id !== "exact"),
        "https://example.com/puzzle/a",
      )?._id,
      "deeper",
    );
    assert.isUndefined(
      findPuzzleForUrl(puzzles, "https://example.com/puzzle/c"),
    );
  });
});
