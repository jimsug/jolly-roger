import { assert } from "chai";
import {
  compileGuessMatcher,
  compilePuzzleMatcher,
  puzzlesMatchingSearchString,
  puzzlesMatchingSolvedFilter,
} from "../../../../imports/client/search";
import type { GuessType } from "../../../../imports/lib/models/Guesses";
import type { PuzzleType } from "../../../../imports/lib/models/Puzzles";
import type { TagType } from "../../../../imports/lib/models/Tags";

const tag = (_id: string, name: string): TagType => ({
  _id,
  name,
  hunt: "hunt",
  deleted: false,
  createdAt: new Date(),
  createdBy: "user",
  updatedAt: new Date(),
});

const puzzle = (fields: Partial<PuzzleType>): PuzzleType => ({
  _id: "puzzle",
  hunt: "hunt",
  title: "A puzzle",
  tags: [],
  answers: [],
  expectedAnswerCount: 1,
  deleted: false,
  createdAt: new Date(),
  createdBy: "user",
  updatedAt: new Date(),
  ...fields,
});

const guess = (fields: Partial<GuessType>): GuessType => ({
  _id: "guess",
  hunt: "hunt",
  puzzle: "crossword",
  guess: "ANSWER",
  state: "pending",
  deleted: false,
  createdAt: new Date(),
  createdBy: "alice",
  updatedAt: new Date(),
  ...fields,
});

const allTags = [tag("t1", "group:events"), tag("t2", "cryptic")];

describe("compilePuzzleMatcher", function () {
  const crossword = puzzle({
    _id: "crossword",
    title: "Crossword Clash",
    answers: ["BLUE WHALE"],
    tags: ["t1"],
  });

  it("matches the start of any title word, ignoring case", function () {
    assert.isTrue(compilePuzzleMatcher(allTags, ["cla"])(crossword));
    assert.isTrue(compilePuzzleMatcher(allTags, ["CROSS"])(crossword));
    assert.isFalse(compilePuzzleMatcher(allTags, ["word"])(crossword));
  });

  it("matches anywhere in an answer or a tag name", function () {
    assert.isTrue(compilePuzzleMatcher(allTags, ["whal"])(crossword));
    assert.isTrue(compilePuzzleMatcher(allTags, ["events"])(crossword));
    assert.isFalse(
      compilePuzzleMatcher(allTags, ["cryptic"])(crossword),
      "Only the puzzle's own tags count",
    );
  });

  it("matches anywhere in the extra terms", function () {
    const names = () => ["Alice Smith", "Bob"];
    assert.isTrue(compilePuzzleMatcher(allTags, ["smi"], names)(crossword));
    assert.isTrue(compilePuzzleMatcher(allTags, ["BOB"], names)(crossword));
    assert.isFalse(compilePuzzleMatcher(allTags, ["carol"], names)(crossword));
    assert.isFalse(
      compilePuzzleMatcher(allTags, ["smi"])(crossword),
      "Without extra terms the names aren't searched",
    );
  });

  it("needs every key to match something", function () {
    assert.isTrue(
      compilePuzzleMatcher(allTags, ["cross", "whale", "events"])(crossword),
    );
    assert.isFalse(compilePuzzleMatcher(allTags, ["cross", "red"])(crossword));
  });

  it("matches tags through the synonym table", function () {
    const tags = [tag("w", "where:atrium"), tag("l", "loc:foyer")];
    const inAtrium = puzzle({ _id: "atrium", tags: ["w"] });
    const inFoyer = puzzle({ _id: "foyer", tags: ["l"] });
    assert.isTrue(compilePuzzleMatcher(tags, ["loc:atrium"])(inAtrium));
    assert.isTrue(compilePuzzleMatcher(tags, ["location:atr"])(inAtrium));
    assert.isTrue(compilePuzzleMatcher(tags, ["where:foyer"])(inFoyer));
    assert.isFalse(compilePuzzleMatcher(tags, ["loc:foyer"])(inAtrium));

    const custom = [{ kind: "prefix" as const, match: "room:", to: "where:" }];
    assert.isTrue(
      compilePuzzleMatcher(tags, ["room:atrium"], undefined, custom)(inAtrium),
    );
    assert.isFalse(
      compilePuzzleMatcher(tags, ["loc:atrium"], undefined, custom)(inAtrium),
      "Only the given table's synonyms count",
    );
    assert.isFalse(
      compilePuzzleMatcher(tags, ["loc:atrium"], undefined, [])(inAtrium),
    );
  });
});

describe("puzzlesMatchingSearchString", function () {
  const crossword = puzzle({ _id: "crossword", title: "Crossword" });
  const maze = puzzle({ _id: "maze", title: "Maze", tags: ["t2"] });
  const puzzles = [crossword, maze];

  it("keeps every puzzle when there's nothing to search for", function () {
    assert.strictEqual(
      puzzlesMatchingSearchString(puzzles, allTags, ""),
      puzzles,
    );
    assert.strictEqual(
      puzzlesMatchingSearchString(puzzles, allTags, "   "),
      puzzles,
    );
  });

  it("keeps the puzzles matching every space-separated key", function () {
    assert.deepEqual(
      puzzlesMatchingSearchString(puzzles, allTags, "maze  cryptic"),
      [maze],
    );
    assert.deepEqual(
      puzzlesMatchingSearchString(puzzles, allTags, "maze cross"),
      [],
    );
  });

  it("passes the extra terms on", function () {
    const names = (p: PuzzleType) => (p._id === "crossword" ? ["Alice"] : []);
    assert.deepEqual(
      puzzlesMatchingSearchString(puzzles, allTags, "alice", names),
      [crossword],
    );
  });
});

describe("puzzlesMatchingSolvedFilter", function () {
  const unsolved = puzzle({ _id: "unsolved" });
  const solved = puzzle({ _id: "solved", answers: ["ANSWER"] });
  const administrivia = puzzle({ _id: "admin", expectedAnswerCount: 0 });
  const puzzles = [unsolved, solved, administrivia];

  it("keeps everything while solved puzzles are shown", function () {
    assert.strictEqual(puzzlesMatchingSolvedFilter(puzzles, true), puzzles);
  });

  it("drops solved puzzles but keeps items with no answer", function () {
    assert.deepEqual(puzzlesMatchingSolvedFilter(puzzles, false), [
      unsolved,
      administrivia,
    ]);
  });

  it("handles an empty list", function () {
    assert.deepEqual(puzzlesMatchingSolvedFilter([], false), []);
  });
});

describe("compileGuessMatcher", function () {
  const puzzles = new Map([
    ["crossword", puzzle({ _id: "crossword", title: "Crossword" })],
  ]);
  const displayNames = new Map([["alice", "Alice Smith"]]);
  const matches = (keys: string[], g: GuessType) =>
    compileGuessMatcher(puzzles, displayNames, keys)(g);

  it("matches anywhere in the puzzle title", function () {
    assert.isTrue(matches(["ross"], guess({})));
    assert.isFalse(matches(["maze"], guess({})));
  });

  it("matches the guess text and the submitter's name, ignoring case", function () {
    assert.isTrue(matches(["swe"], guess({})));
    assert.isTrue(matches(["SMITH"], guess({})));
    assert.isFalse(matches(["bob"], guess({})));
  });

  it("needs every key to match something", function () {
    assert.isTrue(matches(["cross", "answer", "alice"], guess({})));
    assert.isFalse(matches(["cross", "bob"], guess({})));
  });

  it("still matches a guess on a puzzle it doesn't know", function () {
    const unknown = guess({ puzzle: "unknown" });
    assert.isTrue(matches(["answer"], unknown));
    assert.isFalse(matches(["cross"], unknown));
  });
});
