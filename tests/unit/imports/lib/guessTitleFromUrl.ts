import { assert } from "chai";
import guessTitleFromUrl from "../../../../imports/lib/guessTitleFromUrl";

describe("guessTitleFromUrl", function () {
  it("title-cases the last path segment, dropping the extension", function () {
    assert.equal(
      guessTitleFromUrl(
        "https://puzzles.mit.edu/2018/full/puzzle/yeah_but_it_didnt_work.html",
      ),
      "Yeah But It Didnt Work",
    );
    assert.equal(
      guessTitleFromUrl("https://example.com/puzzles/the-big-one/"),
      "The Big One",
    );
    assert.equal(
      guessTitleFromUrl("https://example.com/p/ALL_CAPS"),
      "All Caps",
    );
  });

  it("prefers underscores as the word separator when both appear", function () {
    assert.equal(
      guessTitleFromUrl("https://example.com/puzzles/snake_case-mixed"),
      "Snake Case-mixed",
    );
  });

  it("decodes percent-encoded segments", function () {
    assert.equal(
      guessTitleFromUrl("https://example.com/puzzles/%C3%A9t%C3%A9_chaud"),
      "Été Chaud",
    );
  });

  it("gives up on URLs with nothing to go on", function () {
    assert.isUndefined(guessTitleFromUrl("https://example.com/"));
    assert.isUndefined(guessTitleFromUrl("https://example.com"));
    assert.isUndefined(guessTitleFromUrl("not a url"));
    assert.isUndefined(guessTitleFromUrl(""));
    assert.isUndefined(guessTitleFromUrl("https://example.com/%E0%A4%A"));
  });
});
