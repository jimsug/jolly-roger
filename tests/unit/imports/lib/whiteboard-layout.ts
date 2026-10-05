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
  frameLabel,
  GAP,
  isMetaForTag,
  limitFeedersPerMeta,
  placeIntoFrame,
  roundMetas,
  roundTags,
  type SeedNode,
  seedLayout,
  topLevelSlot,
} from "../../../../imports/lib/whiteboard/layout";
import {
  MAX_EDGES_PER_BOARD,
  MAX_FEEDERS_PER_META,
} from "../../../../imports/lib/whiteboard/limits";

const hunt = "hunt_id";
const user = "user";
const UNGROUPED = "Ungrouped";

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
    const result = seedLayout([], [], UNGROUPED);
    assert.deepEqual(result, { nodes: [], edges: [] });
  });

  it("puts ungrouped puzzles in an Ungrouped frame after group frames", function () {
    const { tags, puzzles, puzzle } = fixtures();
    puzzle("loose", []);
    puzzle("admin", ["administrivia"]);
    puzzle("a1", ["group:A"]);
    const { nodes } = seedLayout(puzzles, tags, UNGROUPED);
    const frames = nodes.filter((n) => n.type === "frame" && !n.parentKey);
    assert.deepEqual(
      frames.map((f) => f.label),
      ["A", "administrivia", UNGROUPED],
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
    const { nodes } = seedLayout(puzzles, tags, UNGROUPED);
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
    const { nodes } = seedLayout(puzzles, tags, UNGROUPED);
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
    const { nodes } = seedLayout(puzzles, tags, UNGROUPED);
    const nodesByKey = byKey(nodes);
    const meta = nodesByKey.get("puzzle:puz_metaA")!;
    assert.equal(meta.parentKey, "frame:tag_group:A");
    assert.deepEqual(meta.position, cardSlot(0));
    // Feeders start on the row below the metas.
    assert.deepEqual(nodesByKey.get("puzzle:puz_a1")!.position, cardSlot(4));
    // The metameta has its own Final frame to head.
    assert.equal(
      nodesByKey.get("puzzle:puz_metameta")!.parentKey,
      "frame:tag_group:Final",
    );
  });

  it("puts a round's metas on their own row above its feeders", function () {
    const { tags, puzzles, puzzle } = fixtures();
    for (let i = 0; i < 5; i++) puzzle(`f${i}`, ["group:A"]);
    for (let i = 0; i < 5; i++) puzzle(`m${i}`, ["group:A", "meta-for:A"]);
    puzzle("b1", ["group:A", "group:A-sub"]);
    const { nodes } = seedLayout(puzzles, tags, UNGROUPED);
    const nodesByKey = byKey(nodes);
    const at = (title: string) =>
      nodesByKey.get(`puzzle:puz_${title}`)!.position;
    // Five metas take two rows; the feeders start on the third.
    [0, 1, 2, 3, 4].forEach((i) => {
      assert.deepEqual(at(`m${i}`), cardSlot(i));
      assert.deepEqual(at(`f${i}`), cardSlot(8 + i));
    });
    // The subframe sits below the feeders, inside the round's frame.
    const sub = nodesByKey.get("frame:tag_group:A-sub")!;
    const round = nodesByKey.get("frame:tag_group:A")!;
    assert.isAtLeast(sub.position.y, at("f4").y + CARD_HEIGHT);
    assert.isAtMost(sub.position.y + sub.height, round.height);
  });

  it("keeps a round with no meta in plain rows", function () {
    const { tags, puzzles, puzzle } = fixtures();
    for (let i = 0; i < 5; i++) puzzle(`f${i}`, ["group:A"]);
    const { nodes } = seedLayout(puzzles, tags, UNGROUPED);
    const nodesByKey = byKey(nodes);
    [0, 1, 2, 3, 4].forEach((i) => {
      assert.deepEqual(
        nodesByKey.get(`puzzle:puz_f${i}`)!.position,
        cardSlot(i),
      );
    });
    assert.equal(
      nodesByKey.get("frame:tag_group:A")!.height,
      FRAME_HEADER + 2 * CARD_HEIGHT + GAP + FRAME_PADDING,
    );
  });

  it("doesn't reorder anything when a puzzle is solved", function () {
    const { tags, puzzles, puzzle } = fixtures();
    puzzle("a1", ["group:A"]);
    puzzle("metaA", ["meta-for:A"]);
    puzzle("b1", ["group:B"]);
    puzzle("metaB", ["meta-for:B"]);
    const before = seedLayout(puzzles, tags, UNGROUPED);
    const metaA = puzzles.find((p) => p._id === "puz_metaA")!;
    const solvedMeta = { ...metaA, answers: ["DONE"] };
    const solved = puzzles.map((p) => (p === metaA ? solvedMeta : p));
    const after = seedLayout(solved, tags, UNGROUPED);
    assert.deepEqual(after, before);
  });

  it("skips deleted and whiteboard puzzles", function () {
    const { tags, puzzles, puzzle } = fixtures();
    puzzle("gone", ["group:A"], { deleted: true });
    puzzle("board", [], { kind: "whiteboard" });
    puzzle("a1", ["group:A"]);
    const { nodes } = seedLayout(puzzles, tags, UNGROUPED);
    assert.sameMembers(
      nodes.filter((n) => n.type === "puzzle").map((n) => n.puzzle!),
      ["puz_a1"],
    );
  });

  it("labels a round with no name after its whole tag", function () {
    const { tags, puzzles, puzzle } = fixtures();
    puzzle("nameless", ["group:"]);
    const { nodes } = seedLayout(puzzles, tags, UNGROUPED);
    assert.equal(byKey(nodes).get("frame:tag_group:")?.label, "group:");
  });

  it("draws an arrow from every feeder to its meta, including metameta", function () {
    const { tags, puzzles, puzzle } = fixtures();
    puzzle("a1", ["group:A"]);
    puzzle("a2", ["group:A"]);
    puzzle("metaA", ["meta-for:A", "group:Final"]);
    puzzle("metameta", ["meta-for:Final"]);
    const { edges } = seedLayout(puzzles, tags, UNGROUPED);
    assert.sameDeepMembers(edges, [
      { feeder: "puz_a1", meta: "puz_metaA" },
      { feeder: "puz_a2", meta: "puz_metaA" },
      { feeder: "puz_metaA", meta: "puz_metameta" },
    ]);
  });
});

describe("whiteboard frameLabel", function () {
  it("shows the round's tag, without its group: prefix", function () {
    assert.equal(frameLabel({ label: "Old" }, "group:Kitchen"), "Kitchen");
  });

  it("falls back to the name saved with the frame", function () {
    assert.equal(frameLabel({ label: "Kitchen" }, undefined), "Kitchen");
  });

  it("leaves an unnamed hand-made frame blank", function () {
    assert.isUndefined(frameLabel({}, undefined));
  });
});

describe("whiteboard computeFeederPairs", function () {
  it("never links a puzzle to itself", function () {
    const { tags, puzzles, puzzle } = fixtures();
    puzzle("selfish", ["group:A", "meta-for:A"]);
    assert.deepEqual(computeFeederPairs(puzzles, tags), []);
  });
});

describe("whiteboard limitFeedersPerMeta", function () {
  it("keeps every pair for a meta at the limit, and nothing for none", function () {
    const { tags, puzzles, puzzle } = fixtures();
    puzzle("meta", ["meta-for:A"]);
    for (let i = 0; i < MAX_FEEDERS_PER_META; i++) puzzle(`f${i}`, ["group:A"]);
    const pairs = computeFeederPairs(puzzles, tags);
    assert.deepEqual(limitFeedersPerMeta(pairs, puzzles), {
      pairs,
      overLimit: [],
    });
    assert.deepEqual(limitFeedersPerMeta([], []), {
      pairs: [],
      overLimit: [],
    });
  });

  it("keeps the feeders created first for a meta past the limit, and every other meta's", function () {
    const { tags, puzzles, puzzle } = fixtures();
    puzzle("big", ["meta-for:A"]);
    puzzle("small", ["meta-for:B"]);
    puzzle("b1", ["group:B"]);
    const feeders = Array.from({ length: MAX_FEEDERS_PER_META + 2 }, (_, i) =>
      puzzle(`f${i}`, ["group:A"]),
    );
    // The first two were created last
    feeders[0]!.createdAt = new Date(9_000_000);
    feeders[1]!.createdAt = new Date(9_000_001);
    const { pairs, overLimit } = limitFeedersPerMeta(
      computeFeederPairs(puzzles, tags),
      puzzles,
    );
    assert.deepEqual(overLimit, ["puz_big"]);
    assert.sameMembers(
      pairs.filter((p) => p.meta === "puz_big").map((p) => p.feeder),
      feeders.slice(2).map((p) => p._id),
    );
    assert.deepEqual(
      pairs.filter((p) => p.meta === "puz_small"),
      [{ feeder: "puz_b1", meta: "puz_small" }],
    );
  });

  it("caps a new board's arrows", function () {
    const { tags, puzzles, puzzle } = fixtures();
    // Every puzzle feeds every other: 60 x 59 pairs
    for (let i = 0; i < 60; i++) puzzle(`p${i}`, ["group:A", "meta-for:A"]);
    assert.isAbove(
      computeFeederPairs(puzzles, tags).length,
      MAX_EDGES_PER_BOARD,
    );
    assert.lengthOf(
      seedLayout(puzzles, tags, UNGROUPED).edges,
      MAX_EDGES_PER_BOARD,
    );
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

  it("keeps a row that only metas are in for metas", function () {
    const s0 = cardSlot(0);
    const s4 = cardSlot(4);
    const result = placeIntoFrame({ width: 2000, height: 400 }, [
      { ...card(s0.x, s0.y), meta: true },
      card(s4.x, s4.y),
    ]);
    assert.deepEqual(result.position, cardSlot(5));
  });

  it("fills a row a meta shares with a feeder, as on older boards", function () {
    const s0 = cardSlot(0);
    const s1 = cardSlot(1);
    const result = placeIntoFrame({ width: 2000, height: 400 }, [
      { ...card(s0.x, s0.y), meta: true },
      card(s1.x, s1.y),
    ]);
    assert.deepEqual(result.position, cardSlot(2));
  });

  it("starts a new row below a frame of only metas", function () {
    const s0 = cardSlot(0);
    const result = placeIntoFrame({ width: 2000, height: 100 }, [
      { ...card(s0.x, s0.y), meta: true },
    ]);
    assert.deepEqual(result.position, cardSlot(4));
    assert.equal(
      result.frame.height,
      cardSlot(4).y + CARD_HEIGHT + FRAME_PADDING,
    );
  });

  it("puts new top-level nodes below everything", function () {
    assert.deepEqual(topLevelSlot([]), { x: 0, y: 0 });
    const slot = topLevelSlot([{ x: 10, y: 20, width: 100, height: 300 }]);
    assert.equal(slot.x, 0);
    assert.isAbove(slot.y, 320);
  });
});

describe("whiteboard roundMetas", function () {
  it("finds the puzzles tagged meta-for:X for a frame tagged group:X", function () {
    const { tags, puzzles, puzzle, tag } = fixtures();
    const meta = puzzle("Meta", ["meta-for:one", "group:one"]);
    puzzle("Feeder", ["group:one"]);
    puzzle("Other meta", ["meta-for:two"]);
    assert.sameMembers(
      [...roundMetas(tag("group:one")._id, tags, puzzles)],
      [meta._id],
    );
    assert.equal(roundMetas(tag("group:one")._id, tags, []).size, 0);
  });

  it("finds none for a frame with no tag or a tag that isn't a round", function () {
    const { tags, puzzles, puzzle, tag } = fixtures();
    puzzle("Meta", ["meta-for:administrivia"]);
    assert.equal(roundMetas(undefined, tags, puzzles).size, 0);
    assert.equal(roundMetas(tag("administrivia")._id, tags, puzzles).size, 0);
    assert.equal(roundMetas("gone", tags, puzzles).size, 0);
  });
});

describe("whiteboard roundTags", function () {
  it("adds meta-for:X to a group:X frame's own tag", function () {
    const { tags, tag } = fixtures();
    const group = tag("group:one")._id;
    const metaFor = tag("meta-for:one")._id;
    tag("meta-for:two");
    assert.sameMembers(roundTags(group, tags), [group, metaFor]);
  });

  it("gives just the frame's tag for a tag that isn't a round, or an unknown one", function () {
    const { tags, tag } = fixtures();
    const administrivia = tag("administrivia")._id;
    tag("meta-for:administrivia");
    tag("group:one");
    assert.deepEqual(roundTags(administrivia, tags), [administrivia]);
    assert.deepEqual(roundTags("gone", tags), ["gone"]);
  });

  it("gives just the frame's tag for a round with no meta-for: tag yet", function () {
    const { tags, tag } = fixtures();
    const group = tag("group:one")._id;
    assert.deepEqual(roundTags(group, tags), [group]);
  });
});

describe("whiteboard isMetaForTag", function () {
  it("takes meta-for: tags only", function () {
    assert.isTrue(isMetaForTag({ name: "meta-for:one" }));
    assert.isTrue(isMetaForTag({ name: "meta-for:" }));
    assert.isFalse(isMetaForTag({ name: "group:one" }));
    assert.isFalse(isMetaForTag({ name: "is:meta" }));
    assert.isFalse(isMetaForTag({ name: "" }));
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
