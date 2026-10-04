import { assert } from "chai";
import type { WhiteboardNodeType } from "../../../../imports/lib/models/WhiteboardNodes";
import type { BoardSearchInput } from "../../../../imports/lib/whiteboard/search";
import {
  searchBoard,
  searchKeys,
} from "../../../../imports/lib/whiteboard/search";

interface TestPuzzle {
  _id: string;
  title: string;
}

type Node = Pick<
  WhiteboardNodeType,
  "_id" | "type" | "puzzle" | "hidden" | "label" | "tag" | "text"
>;

const crossword = { _id: "crossword", title: "Crossword Clash" };
const maze = { _id: "maze", title: "Maze Runner" };
const lost = { _id: "lost", title: "Lost Crossing" };
const nodes: Node[] = [
  { _id: "c1", type: "puzzle", puzzle: "crossword" },
  { _id: "c2", type: "puzzle", puzzle: "maze" },
  { _id: "f1", type: "frame", tag: "round1", label: "old name" },
  { _id: "f2", type: "frame", label: "Scratch area" },
  { _id: "f3", type: "frame", label: "Hidden frame", hidden: true },
  { _id: "s1", type: "sticky", text: "Try the **whale** answer" },
  { _id: "t1", type: "text", text: "Meta ideas" },
  { _id: "i1", type: "ink" },
];
const edges = [
  { _id: "e1", label: "feeds the whale meta" },
  { _id: "e2" },
  // Hidden, or to a card that's gone
  { _id: "e3", label: "whale arrow" },
];

// The puzzle list's own matcher is tested with the client's search; this
// stands in for it with a title substring.
const titleMatcher = (keys: string[]) => (puzzle: TestPuzzle) =>
  keys.every((key) => puzzle.title.toLowerCase().includes(key));

const search = (
  query: string,
  extra: Partial<BoardSearchInput<TestPuzzle>> = {},
) =>
  searchBoard<TestPuzzle>({
    query,
    nodes,
    edges,
    drawnEdges: new Set(["e1", "e2"]),
    puzzles: [crossword, maze, lost],
    puzzleMatcher: titleMatcher,
    tagNames: new Map([["round1", "group:Round One"]]),
    ...extra,
  });

describe("whiteboard searchKeys", function () {
  it("splits on any whitespace, lower-cases and drops empties", function () {
    assert.deepEqual(searchKeys("  Blue\tWHALE  "), ["blue", "whale"]);
    assert.deepEqual(searchKeys(""), []);
    assert.deepEqual(searchKeys("   "), []);
  });
});

describe("whiteboard searchBoard", function () {
  it("finds nothing for an empty query", function () {
    assert.deepEqual(search(""), []);
    assert.deepEqual(search("   "), []);
  });

  it("finds puzzles with the matcher it's given, at their cards", function () {
    const matched: string[][] = [];
    const hits = search("Clash", {
      puzzleMatcher: (keys) => {
        matched.push(keys);
        return titleMatcher(keys);
      },
    });
    assert.deepEqual(matched, [["clash"]]);
    assert.deepEqual(
      hits.map((h) => [h.kind, h.puzzle, h.node, h.notOnBoard]),
      [["puzzle", "crossword", "c1", false]],
    );
  });

  it("finds frames by the label they show", function () {
    // A seeded frame shows its round's tag, not the label saved with it
    assert.deepEqual(
      search("round one").map((h) => [h.kind, h.node, h.label]),
      [["frame", "f1", "Round One"]],
    );
    assert.deepEqual(search("old name"), []);
    assert.deepEqual(
      search("scratch").map((h) => h.node),
      ["f2"],
    );
  });

  it("finds sticky notes and text by their contents", function () {
    assert.deepEqual(
      search("whale")
        .filter((h) => h.kind === "sticky")
        .map((h) => h.node),
      ["s1"],
    );
    assert.deepEqual(
      search("meta ideas").map((h) => [h.kind, h.node]),
      [["text", "t1"]],
    );
  });

  it("finds lines the board draws by their label, and no others", function () {
    assert.deepEqual(search("arrow"), [], "an undrawn line isn't found");
    assert.deepEqual(
      search("feeds").map((h) => [h.kind, h.edge]),
      [["line", "e1"]],
    );
    assert.deepEqual(
      search("arrow", { drawnEdges: new Set(["e3"]) }).map((h) => h.edge),
      ["e3"],
    );
  });

  it("leaves out hidden frames, ink, and puzzles that aren't live", function () {
    assert.deepEqual(search("hidden"), []);
    assert.deepEqual(search("lost", { puzzles: [crossword, maze] }), []);
  });

  it("flags puzzles whose card is hidden or missing, after everything else", function () {
    const hits = search("cr", {
      // The crossword's card, hidden
      nodes: [{ ...nodes[0]!, hidden: true }, ...nodes.slice(1)],
    });
    assert.deepEqual(
      hits.map((h) => [h.kind, h.puzzle, h.node, !!h.notOnBoard]),
      [
        // "Scratch area"
        ["frame", undefined, "f2", false],
        ["puzzle", "crossword", "c1", true],
        ["puzzle", "lost", undefined, true],
      ],
    );
  });

  it("puts puzzles first, then frames, notes, text and lines", function () {
    const hits = search("a");
    const kinds = hits.filter((h) => !h.notOnBoard).map((h) => h.kind);
    assert.deepEqual(kinds, [
      "puzzle",
      "puzzle",
      "frame",
      "sticky",
      "text",
      "line",
    ]);
    // and each key is unique
    assert.equal(new Set(hits.map((h) => h.key)).size, hits.length);
  });
});
