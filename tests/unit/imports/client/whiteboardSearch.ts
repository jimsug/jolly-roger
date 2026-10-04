import { assert } from "chai";
import { compilePuzzleMatcher } from "../../../../imports/client/search";
import type { PuzzleType } from "../../../../imports/lib/models/Puzzles";
import type { TagType } from "../../../../imports/lib/models/Tags";
import { searchBoard } from "../../../../imports/lib/whiteboard/search";

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

const tags = [tag("crypt", "cryptic")];
const crossword = puzzle({
  _id: "crossword",
  title: "Crossword Clash",
  answers: ["BLUE WHALE"],
  tags: ["crypt"],
});
const maze = puzzle({ _id: "maze", title: "Maze Runner" });

// The board's search with the puzzle list's matcher, as the board uses it.
const puzzlesFound = (query: string) =>
  searchBoard({
    query,
    nodes: [
      { _id: "c1", type: "puzzle", puzzle: "crossword" },
      { _id: "c2", type: "puzzle", puzzle: "maze" },
    ],
    edges: [],
    shownLines: new Set(),
    puzzles: [crossword, maze],
    puzzleMatcher: (keys) => compilePuzzleMatcher(tags, keys),
    tagNames: new Map(tags.map((t) => [t._id, t.name])),
  }).map((h) => h.puzzle);

describe("whiteboard searchBoard with the puzzle list's matcher", function () {
  it("finds puzzles by the start of a title word", function () {
    assert.deepEqual(puzzlesFound("clash"), ["crossword"]);
    assert.deepEqual(puzzlesFound("lash"), []);
  });

  it("finds puzzles by answer and by tag", function () {
    assert.deepEqual(puzzlesFound("blue whale"), ["crossword"]);
    assert.deepEqual(puzzlesFound("cryptic"), ["crossword"]);
  });
});
