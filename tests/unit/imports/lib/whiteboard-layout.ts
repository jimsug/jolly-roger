import { assert } from "chai";
import type { PuzzleType } from "../../../../imports/lib/models/Puzzles";
import type { TagType } from "../../../../imports/lib/models/Tags";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  cardSlot,
  chooseFrameForPuzzle,
  computeFeederPairs,
  FRAME_HEADER,
  FRAME_PADDING,
  placeIntoFrame,
  type SeedNode,
  seedLayout,
  topLevelSlot,
  UNGROUPED_LABEL,
} from "../../../../imports/lib/whiteboard/layout";

const hunt = "hunt_id";
const user = "user";

function fixtures() {
  const tags: TagType[] = [];
  const tagsByName = new Map<string, TagType>();
  const puzzles: PuzzleType[] = [];

  const tag = (name: string): TagType => {
    const existing = tagsByName.get(name);
    if (existing) return existing;
    const t = {
      _id: `tag_${name}`,
      name,
      hunt,
      deleted: false,
      createdBy: user,
      createdAt: new Date(1000 + tags.length),
      updatedBy: undefined,
      updatedAt: new Date(1000 + tags.length),
    };
    tags.push(t);
    tagsByName.set(name, t);
    return t;
  };

  const puzzle = (
    title: string,
    tagNames: string[],
    extra: Partial<PuzzleType> = {},
  ): PuzzleType => {
    const p = {
      _id: `puz_${title}`,
      hunt,
      tags: tagNames.map((n) => tag(n)._id),
      title,
      answers: [],
      expectedAnswerCount: 1,
      deleted: false,
      createdBy: user,
      createdAt: new Date(2000 + puzzles.length),
      updatedBy: undefined,
      updatedAt: new Date(2000 + puzzles.length),
      ...extra,
    } as PuzzleType;
    puzzles.push(p);
    return p;
  };

  return { tags, puzzles, tag, puzzle };
}

function byKey(nodes: SeedNode[]) {
  return new Map(nodes.map((n) => [n.key, n]));
}

describe("whiteboard seedLayout", function () {
  it("returns nothing for an empty hunt", function () {
    const result = seedLayout([], []);
    assert.deepEqual(result, { nodes: [], edges: [] });
  });

  it("puts ungrouped puzzles in an Ungrouped frame after group frames", function () {
    const { tags, puzzles, puzzle } = fixtures();
    puzzle("loose", []);
    puzzle("admin", ["administrivia"]);
    puzzle("a1", ["group:A"]);
    const { nodes } = seedLayout(puzzles, tags);
    const frames = nodes.filter((n) => n.type === "frame" && !n.parentKey);
    assert.deepEqual(
      frames.map((f) => f.label),
      ["A", "administrivia", UNGROUPED_LABEL],
    );
    const nodesByKey = byKey(nodes);
    assert.equal(
      nodesByKey.get("puzzle:puz_loose")!.parentKey,
      "frame:ungrouped",
    );
    assert.equal(
      nodesByKey.get("puzzle:puz_admin")!.parentKey,
      "frame:tag_administrivia",
    );
  });

  it("nests subgroups and lists parents before children", function () {
    const { tags, puzzles, puzzle } = fixtures();
    puzzle("a1", ["group:A"]);
    puzzle("a2", ["group:A", "group:A-sub"]);
    puzzle("a3", ["group:A", "group:A-sub"]);
    const { nodes } = seedLayout(puzzles, tags);
    const nodesByKey = byKey(nodes);
    const sub = nodesByKey.get("frame:tag_group:A-sub")!;
    assert.equal(sub.parentKey, "frame:tag_group:A");
    // Subgroup members live only in the subgroup.
    assert.equal(nodesByKey.get("puzzle:puz_a2")!.parentKey, sub.key);
    assert.equal(
      nodesByKey.get("puzzle:puz_a1")!.parentKey,
      "frame:tag_group:A",
    );
    const index = new Map(nodes.map((n, i) => [n.key, i]));
    nodes.forEach((n) => {
      if (n.parentKey)
        assert.isBelow(index.get(n.parentKey)!, index.get(n.key)!);
    });
    // The subframe sits below the parent's cards and inside the parent.
    const parent = nodesByKey.get("frame:tag_group:A")!;
    assert.isAtLeast(sub.position.y, FRAME_HEADER + CARD_HEIGHT);
    assert.isAtMost(sub.position.x + sub.width, parent.width);
    assert.isAtMost(sub.position.y + sub.height, parent.height);
  });

  it("places a puzzle in several unrelated groups in the earliest tag's frame", function () {
    const { tags, puzzles, puzzle } = fixtures();
    puzzle("a1", ["group:A"]);
    puzzle("b1", ["group:B"]);
    puzzle("both", ["group:B", "group:A"]);
    const { nodes } = seedLayout(puzzles, tags);
    const cards = nodes.filter((n) => n.puzzle === "puz_both");
    assert.lengthOf(cards, 1);
    assert.equal(cards[0]!.parentKey, "frame:tag_group:A");
  });

  it("puts a meta-for:X puzzle at the head of frame X without group:X", function () {
    const { tags, puzzles, puzzle } = fixtures();
    puzzle("a1", ["group:A"]);
    puzzle("a2", ["group:A"]);
    puzzle("metaA", ["meta-for:A", "group:Final"]);
    puzzle("metameta", ["meta-for:Final"]);
    const { nodes } = seedLayout(puzzles, tags);
    const nodesByKey = byKey(nodes);
    const meta = nodesByKey.get("puzzle:puz_metaA")!;
    assert.equal(meta.parentKey, "frame:tag_group:A");
    assert.deepEqual(meta.position, cardSlot(0));
    assert.deepEqual(nodesByKey.get("puzzle:puz_a1")!.position, cardSlot(1));
    // The metameta has its own Final frame to head.
    assert.equal(
      nodesByKey.get("puzzle:puz_metameta")!.parentKey,
      "frame:tag_group:Final",
    );
  });

  it("doesn't reorder anything when a puzzle is solved", function () {
    const { tags, puzzles, puzzle } = fixtures();
    puzzle("a1", ["group:A"]);
    puzzle("metaA", ["meta-for:A"]);
    puzzle("b1", ["group:B"]);
    puzzle("metaB", ["meta-for:B"]);
    const before = seedLayout(puzzles, tags);
    const solved = puzzles.map((p) =>
      p._id === "puz_metaA" ? { ...p, answers: ["DONE"] } : p,
    );
    const after = seedLayout(solved, tags);
    assert.deepEqual(after, before);
  });

  it("skips deleted and whiteboard puzzles", function () {
    const { tags, puzzles, puzzle } = fixtures();
    puzzle("gone", ["group:A"], { deleted: true });
    puzzle("board", [], { kind: "whiteboard" });
    puzzle("a1", ["group:A"]);
    const { nodes } = seedLayout(puzzles, tags);
    assert.sameMembers(
      nodes.filter((n) => n.type === "puzzle").map((n) => n.puzzle!),
      ["puz_a1"],
    );
  });

  it("draws an arrow from every feeder to its meta, including metameta", function () {
    const { tags, puzzles, puzzle } = fixtures();
    puzzle("a1", ["group:A"]);
    puzzle("a2", ["group:A"]);
    puzzle("metaA", ["meta-for:A", "group:Final"]);
    puzzle("metameta", ["meta-for:Final"]);
    const { edges } = seedLayout(puzzles, tags);
    assert.sameDeepMembers(edges, [
      { feeder: "puz_a1", meta: "puz_metaA" },
      { feeder: "puz_a2", meta: "puz_metaA" },
      { feeder: "puz_metaA", meta: "puz_metameta" },
    ]);
  });
});

describe("whiteboard computeFeederPairs", function () {
  it("never links a puzzle to itself", function () {
    const { tags, puzzles, puzzle } = fixtures();
    puzzle("selfish", ["group:A", "meta-for:A"]);
    assert.deepEqual(computeFeederPairs(puzzles, tags), []);
  });
});

describe("whiteboard placeIntoFrame", function () {
  const card = (x: number, y: number) => ({
    x,
    y,
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
  });

  it("uses the first slot in an empty frame", function () {
    const result = placeIntoFrame({ width: 600, height: 400 }, []);
    assert.deepEqual(result.position, cardSlot(0));
  });

  it("skips occupied slots", function () {
    const s0 = cardSlot(0);
    const result = placeIntoFrame({ width: 2000, height: 400 }, [
      card(s0.x, s0.y),
    ]);
    assert.deepEqual(result.position, cardSlot(1));
  });

  it("grows a frame that has been shrunk", function () {
    const s0 = cardSlot(0);
    const result = placeIntoFrame({ width: 100, height: 100 }, [
      card(s0.x, s0.y),
    ]);
    const s1 = cardSlot(1);
    assert.equal(result.frame.width, s1.x + CARD_WIDTH + FRAME_PADDING);
    assert.equal(result.frame.height, s1.y + CARD_HEIGHT + FRAME_PADDING);
  });

  it("puts new top-level nodes below everything", function () {
    assert.deepEqual(topLevelSlot([]), { x: 0, y: 0 });
    const slot = topLevelSlot([{ x: 10, y: 20, width: 100, height: 300 }]);
    assert.equal(slot.x, 0);
    assert.isAbove(slot.y, 320);
  });
});

describe("whiteboard chooseFrameForPuzzle", function () {
  it("prefers the meta's round frame", function () {
    const { tags, puzzle, tag } = fixtures();
    tag("group:A");
    const meta = puzzle("metaA", ["group:Final", "meta-for:A"]);
    const choice = chooseFrameForPuzzle(meta, tags, [
      { id: "fA", tag: "tag_group:A", depth: 0 },
      { id: "fFinal", tag: "tag_group:Final", depth: 0 },
    ]);
    assert.deepEqual(choice, { frameId: "fA" });
  });

  it("prefers the deepest frame", function () {
    const { tags, puzzle } = fixtures();
    const p = puzzle("p", ["group:A", "group:A-sub"]);
    const choice = chooseFrameForPuzzle(p, tags, [
      { id: "fA", tag: "tag_group:A", depth: 0 },
      { id: "fSub", tag: "tag_group:A-sub", depth: 1 },
    ]);
    assert.deepEqual(choice, { frameId: "fSub" });
  });

  it("asks for a frame when the group has none yet", function () {
    const { tags, puzzle } = fixtures();
    const p = puzzle("p", ["group:New"]);
    const choice = chooseFrameForPuzzle(p, tags, []);
    assert.equal(
      "createForTag" in choice && choice.createForTag.name,
      "group:New",
    );
  });

  it("falls back to ungrouped", function () {
    const { tags, puzzle } = fixtures();
    const p = puzzle("p", ["needs:extraction"]);
    assert.deepEqual(chooseFrameForPuzzle(p, tags, []), { ungrouped: true });
  });
});
