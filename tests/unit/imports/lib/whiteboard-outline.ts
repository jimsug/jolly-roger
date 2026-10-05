import { assert } from "chai";
import type { WhiteboardNodeType } from "../../../../imports/lib/models/WhiteboardNodes";
import type { OutlineRow } from "../../../../imports/lib/whiteboard/outline";
import {
  outlineLines,
  outlineTree,
} from "../../../../imports/lib/whiteboard/outline";
import type { RoundState } from "../../../../imports/lib/whiteboard/rounds";

type Node = Parameters<typeof outlineTree>[0][number];

const frame = (
  _id: string,
  at: { x: number; y: number },
  extra: Partial<Omit<WhiteboardNodeType, "_id" | "type">> = {},
): Node => ({ _id, type: "frame", position: at, ...extra });

const state = (
  solved: number,
  unsolved: number,
  extra: Partial<RoundState> = {},
): RoundState => ({
  cards: { solved, unsolved },
  // More than the frame's own, so a test can tell which is counted.
  allCards: { solved: solved + 10, unsolved: unsolved + 10 },
  metas: { solved: 0, unsolved: 0 },
  feeders: { solved: 0, unsolved: 0 },
  finished: false,
  readyToMeta: false,
  ...extra,
});

// The tree as ids, nested.
type Shape = [string, Shape[]];
const shape = (rows: OutlineRow[]): Shape[] =>
  rows.map((row) => [row.id, shape(row.children)]);

describe("whiteboard outline", function () {
  describe("outlineTree", function () {
    it("nests frames as the board does, top to bottom then left to right", function () {
      const tree = outlineTree(
        [
          frame("b", { x: 0, y: 500 }),
          frame("a", { x: 400, y: 0 }),
          frame("a0", { x: 0, y: 0 }),
          frame("a1", { x: 20, y: 300 }, { parent: "a" }),
          frame("a2", { x: 20, y: 40 }, { parent: "a" }),
          frame("a21", { x: 10, y: 10 }, { parent: "a2" }),
          { _id: "card", type: "puzzle", position: { x: 0, y: 0 } },
        ],
        new Map(),
      );
      assert.deepEqual(shape(tree), [
        ["a0", []],
        [
          "a",
          [
            ["a2", [["a21", []]]],
            ["a1", []],
          ],
        ],
        ["b", []],
      ]);
    });

    it("leaves out hidden frames, lifting anything left inside one to the top", function () {
      const tree = outlineTree(
        [
          frame("a", { x: 0, y: 0 }),
          frame("gone", { x: 0, y: 100 }, { hidden: true }),
          frame("inside", { x: 0, y: 200 }, { parent: "gone" }),
        ],
        new Map(),
      );
      assert.deepEqual(shape(tree), [
        ["a", []],
        ["inside", []],
      ]);
    });

    it("puts Ungrouped last whatever its position", function () {
      const tree = outlineTree(
        [
          frame("ungrouped", { x: 0, y: -100 }, { frameKind: "ungrouped" }),
          frame("late", { x: 0, y: 900 }, { frameKind: "user" }),
          frame("early", { x: 0, y: 0 }, { frameKind: "group" }),
        ],
        new Map(),
      );
      assert.deepEqual(
        tree.map((row) => row.id),
        ["early", "late", "ungrouped"],
      );
    });

    it("labels rounds by their tag and others by their own label", function () {
      const tree = outlineTree(
        [
          frame("round", { x: 0, y: 0 }, { tag: "t1", label: "old name" }),
          frame("orphan", { x: 0, y: 100 }, { tag: "gone", label: "Kept" }),
          frame("user", { x: 0, y: 200 }, { label: "Scratch" }),
          frame("bare", { x: 0, y: 300 }),
          frame(
            "ungrouped",
            { x: 0, y: 0 },
            {
              frameKind: "ungrouped",
              label: "Ungrouped",
            },
          ),
        ],
        new Map(),
        new Map([["t1", "group:Act One"]]),
      );
      assert.deepEqual(
        tree.map((row) => row.label),
        ["Act One", "Kept", "Scratch", undefined, "Ungrouped"],
      );
    });

    it("carries each frame's own counts (not those nested in it), state, collapse and lock", function () {
      const [round, other] = outlineTree(
        [
          frame(
            "round",
            { x: 0, y: 0 },
            {
              collapsed: true,
              locked: true,
              lockedBy: "u1",
            },
          ),
          frame("other", { x: 0, y: 100 }),
        ],
        new Map([
          ["round", state(3, 4, { finished: true })],
          ["other", state(0, 2, { readyToMeta: true })],
        ]),
      );
      assert.deepInclude(round, {
        solved: 3,
        total: 7,
        finished: true,
        readyToMeta: false,
        collapsed: true,
        locked: true,
        lockedBy: "u1",
      });
      assert.deepInclude(other, {
        solved: 0,
        total: 2,
        finished: false,
        readyToMeta: true,
        collapsed: false,
        locked: false,
        lockedBy: undefined,
      });
    });

    it("counts nothing for a frame with no round state", function () {
      const [row] = outlineTree([frame("a", { x: 0, y: 0 })], new Map());
      assert.include(row, { solved: 0, total: 0, finished: false });
    });

    it("lists the frames in a parent loop at the top level", function () {
      const tree = outlineTree(
        [
          frame("a", { x: 0, y: 0 }, { parent: "b" }),
          frame("b", { x: 0, y: 100 }, { parent: "a" }),
          frame("c", { x: 0, y: 50 }, { parent: "a" }),
          frame("self", { x: 0, y: 200 }, { parent: "self" }),
        ],
        new Map(),
      );
      assert.deepEqual(shape(tree), [
        ["a", [["c", []]]],
        ["b", []],
        ["self", []],
      ]);
    });

    it("is empty for a board with no frames", function () {
      assert.deepEqual(outlineTree([], new Map()), []);
    });
  });

  describe("outlineLines", function () {
    const tree = outlineTree(
      [
        frame("a", { x: 0, y: 0 }),
        frame("a1", { x: 0, y: 0 }, { parent: "a" }),
        frame("a11", { x: 0, y: 0 }, { parent: "a1" }),
        frame("b", { x: 0, y: 100 }),
      ],
      new Map(),
    );
    const brief = (folded: string[]) =>
      outlineLines(tree, new Set(folded)).map((line) => [
        line.row.id,
        line.level,
        line.parent,
        line.expanded,
      ]);

    it("lists every row in order with its level and parent", function () {
      assert.deepEqual(brief([]), [
        ["a", 1, undefined, true],
        ["a1", 2, "a", true],
        ["a11", 3, "a1", undefined],
        ["b", 1, undefined, undefined],
      ]);
    });

    it("leaves out what's under a folded row", function () {
      assert.deepEqual(brief(["a1"]), [
        ["a", 1, undefined, true],
        ["a1", 2, "a", false],
        ["b", 1, undefined, undefined],
      ]);
      assert.deepEqual(brief(["a", "b"]), [
        ["a", 1, undefined, false],
        ["b", 1, undefined, undefined],
      ]);
    });
  });
});
