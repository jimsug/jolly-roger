import { assert } from "chai";
import type { PuzzleType } from "../../../../imports/lib/models/Puzzles";
import type { TagType } from "../../../../imports/lib/models/Tags";
import type { WhiteboardNodeType } from "../../../../imports/lib/models/WhiteboardNodes";
import {
  TAG_SYNONYMS,
  type TagSynonymRule,
  tagSynonymRuleProblems,
} from "../../../../imports/lib/tagNames";
import {
  feederAnswersText,
  feederCounts,
  feedersOf,
} from "../../../../imports/lib/whiteboard/feeders";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  cardSlot,
  computeFeederPairs,
  FRAME_HEADER,
  FRAME_PADDING,
  GAP,
} from "../../../../imports/lib/whiteboard/layout";

const ROW = CARD_HEIGHT + GAP;

type Puzzle = Pick<
  PuzzleType,
  | "_id"
  | "tags"
  | "title"
  | "answers"
  | "expectedAnswerCount"
  | "completedWithNoAnswer"
  | "updatedAt"
  | "answersUpdatedAt"
>;
type Node = Pick<
  WhiteboardNodeType,
  "_id" | "type" | "puzzle" | "parent" | "position" | "hidden"
>;

// A hunt under construction: tags by name, puzzles with their tags, answers
// and last change, and frames and cards placed by hand.
function hunt() {
  const tags: Pick<TagType, "_id" | "name">[] = [];
  const puzzles: Puzzle[] = [];
  const nodes: Node[] = [];

  const tag = (name: string) => {
    const existing = tags.find((t) => t.name === name);
    if (existing) return existing._id;
    const _id = `tag_${name}`;
    tags.push({ _id, name });
    return _id;
  };

  const puzzle = (
    _id: string,
    tagNames: string[],
    { answers = [] as string[], updatedAt = 0, expected = 1 } = {},
  ) => {
    const p: Puzzle = {
      _id,
      title: _id,
      tags: tagNames.map(tag),
      answers,
      expectedAnswerCount: expected,
      updatedAt: new Date(updatedAt),
    };
    puzzles.push(p);
    return p;
  };

  const frame = (_id: string, x: number, y: number, parent?: string) => {
    nodes.push({ _id, type: "frame", position: { x, y }, parent });
  };

  const card = (
    puzzleId: string,
    position: { x: number; y: number },
    parent?: string,
    hidden?: boolean,
  ) => {
    nodes.push({
      _id: `card_${puzzleId}`,
      type: "puzzle",
      puzzle: puzzleId,
      position,
      parent,
      hidden,
    });
  };

  const of = (
    meta: Puzzle,
    options: {
      order?: "board" | "solveTime";
      synonyms?: readonly TagSynonymRule[];
    } = {},
  ) => feedersOf(meta, puzzles, tags, nodes, options).map((p) => p._id);

  return { tags, puzzles, nodes, puzzle, frame, card, of };
}

describe("whiteboard feeders", function () {
  describe("feedersOf", function () {
    it("lists the group:X puzzles for a meta-for:X meta, as the arrows pair them", function () {
      const h = hunt();
      const meta = h.puzzle("meta", ["meta-for:a", "group:a"]);
      h.puzzle("f1", ["group:a"]);
      h.puzzle("f2", ["group:a", "group:b"]);
      h.puzzle("elsewhere", ["group:b"]);
      h.puzzle("loose", []);
      assert.sameMembers(h.of(meta), ["f1", "f2"]);

      const arrows = computeFeederPairs(
        h.puzzles as PuzzleType[],
        [...h.tags] as TagType[],
      )
        .filter((pair) => pair.meta === "meta")
        .map((pair) => pair.feeder);
      assert.sameMembers(h.of(meta), arrows);
    });

    it("lists every round meta for a metameta, but not other metametas", function () {
      const h = hunt();
      const metameta = h.puzzle("metameta", ["is:metameta"]);
      h.puzzle("roundMeta", ["meta-for:a"]);
      h.puzzle("bareMeta", ["is:meta", "group:b"]);
      h.puzzle("otherMetameta", ["is:metameta"]);
      h.puzzle("feeder", ["group:a"]);
      assert.sameMembers(h.of(metameta), ["roundMeta", "bareMeta"]);
    });

    it("lists only the metas sharing a metameta's group: tags, when it has any", function () {
      const h = hunt();
      const metameta = h.puzzle("metameta", ["is:metameta", "group:act1"]);
      h.puzzle("inAct", ["meta-for:a", "group:act1"]);
      h.puzzle("bareInAct", ["is:meta", "group:act1", "group:b"]);
      h.puzzle("otherAct", ["meta-for:c", "group:act2"]);
      h.puzzle("noAct", ["meta-for:d"]);
      h.puzzle("feederInAct", ["group:act1"]);
      assert.sameMembers(h.of(metameta), ["inAct", "bareInAct"]);
    });

    it("goes by meta-for: on a metameta that has one", function () {
      const h = hunt();
      const metameta = h.puzzle("metameta", ["is:metameta", "meta-for:metas"]);
      h.puzzle("roundMeta", ["meta-for:a", "group:metas"]);
      h.puzzle("unrelatedMeta", ["meta-for:b"]);
      assert.deepEqual(h.of(metameta), ["roundMeta"]);
    });

    it("lists the rest of its round for a bare is:meta", function () {
      const h = hunt();
      const meta = h.puzzle("meta", ["is:meta", "group:a"]);
      h.puzzle("f1", ["group:a"]);
      h.puzzle("f2", ["group:a", "is:meta"]);
      h.puzzle("elsewhere", ["group:b"]);
      assert.sameMembers(h.of(meta), ["f1", "f2"]);
    });

    it("finds nothing for a meta with no feeders or an ordinary puzzle", function () {
      const h = hunt();
      const lonely = h.puzzle("lonely", ["meta-for:empty"]);
      const ungrouped = h.puzzle("ungrouped", ["is:meta"]);
      const plain = h.puzzle("plain", ["group:a"]);
      h.puzzle("f1", ["group:a"]);
      assert.deepEqual(h.of(lonely), []);
      assert.deepEqual(h.of(ungrouped), []);
      assert.deepEqual(h.of(plain), []);
    });

    it("pairs the same under any synonym table, which can't touch structural tags", function () {
      const h = hunt();
      const meta = h.puzzle("meta", ["meta-for:a", "location:lab"]);
      h.puzzle("f1", ["group:a", "loc:hall"]);
      h.puzzle("f2", ["group:a", "stuck"]);
      h.puzzle("elsewhere", ["group:b", "where:lab"]);
      const synonyms: TagSynonymRule[] = [
        ...TAG_SYNONYMS,
        { kind: "prefix", match: "room:", to: "where:" },
      ];
      assert.isEmpty(tagSynonymRuleProblems(synonyms));
      assert.sameMembers(h.of(meta, { synonyms }), ["f1", "f2"]);
      assert.sameMembers(h.of(meta, { synonyms: [] }), ["f1", "f2"]);
    });

    it("orders by board position: frame, then slot row, then column", function () {
      const h = hunt();
      const meta = h.puzzle("meta", ["meta-for:a"]);
      ["r0c1", "r1c0", "r0c0", "below", "topLevel", "hidden", "off"].forEach(
        (id) => h.puzzle(id, ["group:a"]),
      );
      h.frame("frame", 1000, 500);
      h.frame("lowerFrame", 0, 2000);
      h.card("r0c1", cardSlot(1), "frame");
      h.card("r0c0", cardSlot(0), "frame");
      // Nudged by hand a little, still on the second row
      const slot = cardSlot(4);
      h.card("r1c0", { x: slot.x + 30, y: slot.y - 20 }, "frame");
      h.card("below", cardSlot(0), "lowerFrame");
      // Above both frames, so first
      h.card("topLevel", { x: 4000, y: 0 });
      h.card("hidden", cardSlot(2), "frame", true);
      assert.deepEqual(h.of(meta), [
        "topLevel",
        "r0c0",
        "r0c1",
        "r1c0",
        "below",
        "hidden",
        "off",
      ]);
    });

    it("places a nested frame's cards by where the frame is on the board", function () {
      const h = hunt();
      const meta = h.puzzle("meta", ["meta-for:a"]);
      h.puzzle("inner", ["group:a"]);
      h.puzzle("outer", ["group:a"]);
      h.frame("outerFrame", 0, 0);
      h.frame("innerFrame", 0, 4 * (CARD_HEIGHT + GAP), "outerFrame");
      h.card("outer", { x: CARD_WIDTH * 3, y: 6 * (CARD_HEIGHT + GAP) });
      h.card("inner", cardSlot(0), "innerFrame");
      // The inner frame is above the top-level card
      assert.deepEqual(h.of(meta), ["inner", "outer"]);
    });

    it("reads a round's subframes in place among its own cards", function () {
      const h = hunt();
      const meta = h.puzzle("meta", ["meta-for:a"]);
      ["inSub", "direct", "later"].forEach((id) => h.puzzle(id, ["group:a"]));
      h.frame("round", 0, 0);
      // A subframe on the round's first row, its cards above the round's own
      h.frame("sub", FRAME_PADDING, FRAME_HEADER, "round");
      h.card("inSub", cardSlot(0), "sub");
      h.card(
        "direct",
        { x: FRAME_PADDING, y: FRAME_HEADER + 3 * ROW },
        "round",
      );
      // Level with the subframe's card, further right
      h.card("later", { x: 2 * CARD_WIDTH, y: 2 * FRAME_HEADER }, "round");
      assert.deepEqual(h.of(meta), ["inSub", "later", "direct"]);
    });

    it("reads frames side by side as one row, even nudged by hand", function () {
      const h = hunt();
      const meta = h.puzzle("meta", ["meta-for:a"]);
      ["left", "right", "beside", "below"].forEach((id) =>
        h.puzzle(id, ["group:a"]),
      );
      h.frame("leftFrame", 0, 1000);
      // A pixel higher than the frame on its left
      h.frame("rightFrame", 2000, 999);
      h.frame("lowerFrame", 0, 1000 + 2 * ROW);
      h.card("left", cardSlot(0), "leftFrame");
      h.card("right", cardSlot(0), "rightFrame");
      h.card("below", cardSlot(0), "lowerFrame");
      // A loose card a little above the frames, to their right
      h.card("beside", { x: 4000, y: 990 });
      assert.deepEqual(h.of(meta), ["left", "right", "beside", "below"]);
    });

    it("goes by when the answers last changed, or failing that the puzzle", function () {
      const h = hunt();
      const meta = h.puzzle("meta", ["meta-for:a"]);
      // Answered first, but retagged since
      const retagged = h.puzzle("retagged", ["group:a"], {
        answers: ["ONE"],
        updatedAt: 9000,
      });
      retagged.answersUpdatedAt = new Date(1000);
      const recent = h.puzzle("recent", ["group:a"], {
        answers: ["TWO"],
        updatedAt: 5000,
      });
      recent.answersUpdatedAt = new Date(5000);
      // Answered before answersUpdatedAt was recorded
      h.puzzle("legacy", ["group:a"], { answers: ["THREE"], updatedAt: 3000 });
      assert.deepEqual(h.of(meta, { order: "solveTime" }), [
        "recent",
        "legacy",
        "retagged",
      ]);
    });

    it("orders by solve time, newest answer first, then the rest by board", function () {
      const h = hunt();
      const meta = h.puzzle("meta", ["meta-for:a"]);
      h.puzzle("old", ["group:a"], { answers: ["OLD"], updatedAt: 1000 });
      h.puzzle("unsolvedA", ["group:a"], { updatedAt: 9000 });
      h.puzzle("new", ["group:a"], { answers: ["NEW"], updatedAt: 5000 });
      h.puzzle("partial", ["group:a"], {
        answers: ["ONE"],
        expected: 2,
        updatedAt: 3000,
      });
      h.puzzle("unsolvedB", ["group:a"], { updatedAt: 8000 });
      h.frame("frame", 0, 0);
      ["old", "unsolvedA", "new", "partial", "unsolvedB"].forEach((id, i) =>
        h.card(id, cardSlot(i), "frame"),
      );
      assert.deepEqual(h.of(meta), [
        "old",
        "unsolvedA",
        "new",
        "partial",
        "unsolvedB",
      ]);
      assert.deepEqual(h.of(meta, { order: "solveTime" }), [
        "new",
        "partial",
        "old",
        "unsolvedA",
        "unsolvedB",
      ]);
    });
  });

  describe("feederAnswersText", function () {
    it("puts each feeder on its own line, blank when it has no answer", function () {
      assert.equal(
        feederAnswersText([
          { answers: ["ONE"] },
          { answers: [] },
          { answers: ["TWO", "THREE"] },
        ]),
        "ONE\n\nTWO, THREE",
      );
      assert.equal(feederAnswersText([]), "");
    });
  });

  describe("feederCounts", function () {
    it("counts solved feeders of those with something to solve", function () {
      const h = hunt();
      const solved = h.puzzle("solved", [], { answers: ["A"] });
      const unsolved = h.puzzle("unsolved", []);
      const nothing = h.puzzle("nothing", [], { expected: 0 });
      const unknown = h.puzzle("unknown", [], { expected: -1 });
      assert.deepEqual(feederCounts([solved, unsolved, nothing, unknown]), {
        solved: 1,
        total: 3,
      });
      assert.deepEqual(feederCounts([]), { solved: 0, total: 0 });
    });
  });
});
