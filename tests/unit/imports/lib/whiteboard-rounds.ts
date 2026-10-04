import { assert } from "chai";
import type { PuzzleType } from "../../../../imports/lib/models/Puzzles";
import type { TagType } from "../../../../imports/lib/models/Tags";
import type { WhiteboardNodeType } from "../../../../imports/lib/models/WhiteboardNodes";
import { MAX_FRAME_DEPTH } from "../../../../imports/lib/whiteboard/limits";
import {
  finishedFrames,
  roundState,
} from "../../../../imports/lib/whiteboard/rounds";

type Node = Pick<
  WhiteboardNodeType,
  "_id" | "type" | "parent" | "puzzle" | "tag" | "hidden" | "frameKind"
>;
type Puzzle = Pick<
  PuzzleType,
  | "_id"
  | "tags"
  | "answers"
  | "expectedAnswerCount"
  | "completedWithNoAnswer"
  | "locked"
>;

// A board under construction: tags by name, puzzles with their tags and
// state, and frames and cards placed by hand.
function board() {
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

  const frame = (
    id: string,
    {
      tag: tagName,
      parent,
      kind,
    }: {
      tag?: string;
      parent?: string;
      kind?: WhiteboardNodeType["frameKind"];
    } = {},
  ) => {
    nodes.push({
      _id: id,
      type: "frame",
      parent,
      tag: tagName ? tag(tagName) : undefined,
      frameKind: kind ?? (tagName ? "group" : "user"),
    });
    return id;
  };

  // A card for a puzzle with these tags, in `parent`. Solved unless told
  // otherwise.
  const card = (
    id: string,
    parent: string | undefined,
    tagNames: string[],
    state: Partial<Puzzle> = {},
  ) => {
    puzzles.push({
      _id: id,
      tags: tagNames.map(tag),
      answers: ["ANSWER"],
      expectedAnswerCount: 1,
      ...state,
    });
    nodes.push({ _id: `card_${id}`, type: "puzzle", parent, puzzle: id });
  };

  const unsolved = { answers: [] };

  return { tags, puzzles, nodes, tag, frame, card, unsolved };
}

describe("whiteboard roundState", function () {
  it("treats a round as finished once every meta is solved, feeders or not", function () {
    const b = board();
    const r = b.frame("r", { tag: "group:A" });
    b.card("meta", r, ["meta-for:A"]);
    b.card("f1", r, ["group:A"]);
    b.card("f2", r, ["group:A"], b.unsolved);
    const state = roundState(
      { _id: r, tag: b.tag("group:A") },
      b.nodes,
      b.puzzles,
      b.tags,
    );
    assert.isTrue(state.finished);
    assert.deepEqual(state.metas, { solved: 1, unsolved: 0 });
    assert.deepEqual(state.allCards, { solved: 2, unsolved: 1 });
    assert.isFalse(state.readyToMeta);
  });

  it("isn't finished while a meta is unsolved", function () {
    const b = board();
    const r = b.frame("r", { tag: "group:A" });
    b.card("meta1", r, ["meta-for:A"]);
    b.card("meta2", r, ["meta-for:A"], b.unsolved);
    b.card("f1", r, ["group:A"]);
    const state = roundState(
      { _id: r, tag: b.tag("group:A") },
      b.nodes,
      b.puzzles,
      b.tags,
    );
    assert.isFalse(state.finished);
    assert.deepEqual(state.metas, { solved: 1, unsolved: 1 });
  });

  it("counts a meta whose card is in another frame", function () {
    const b = board();
    const r = b.frame("r", { tag: "group:A" });
    const elsewhere = b.frame("elsewhere");
    b.card("meta", elsewhere, ["meta-for:A"], b.unsolved);
    b.card("f1", r, ["group:A"]);
    const groupA = b.tag("group:A");
    let state = roundState({ _id: r, tag: groupA }, b.nodes, b.puzzles, b.tags);
    assert.isFalse(state.finished);
    assert.deepEqual(state.cards, { solved: 1, unsolved: 0 });
    assert.deepEqual(state.metas, { solved: 0, unsolved: 1 });
    b.puzzles.find((p) => p._id === "meta")!.answers = ["META"];
    state = roundState({ _id: r, tag: groupA }, b.nodes, b.puzzles, b.tags);
    assert.isTrue(state.finished);
    assert.deepEqual(state.metas, { solved: 1, unsolved: 0 });
  });

  it("falls back to nothing unsolved when a round has no meta", function () {
    const b = board();
    const r = b.frame("r", { tag: "group:A" });
    b.card("f1", r, ["group:A"]);
    b.card("f2", r, ["group:A"], b.unsolved);
    const groupA = b.tag("group:A");
    assert.isFalse(
      roundState({ _id: r, tag: groupA }, b.nodes, b.puzzles, b.tags).finished,
    );
    b.puzzles[1]!.answers = ["DONE"];
    assert.isTrue(
      roundState({ _id: r, tag: groupA }, b.nodes, b.puzzles, b.tags).finished,
    );
  });

  it("needs one solved card", function () {
    const b = board();
    const r = b.frame("r", { tag: "group:A" });
    const groupA = b.tag("group:A");
    assert.isFalse(
      roundState({ _id: r, tag: groupA }, b.nodes, b.puzzles, b.tags).finished,
    );
    b.card("admin", r, ["group:A"], { expectedAnswerCount: 0, answers: [] });
    assert.isFalse(
      roundState({ _id: r, tag: groupA }, b.nodes, b.puzzles, b.tags).finished,
    );
  });

  it("ignores puzzles with nothing to solve", function () {
    const b = board();
    const r = b.frame("r", { tag: "group:A" });
    b.card("f1", r, ["group:A"]);
    b.card("admin", r, ["group:A"], { expectedAnswerCount: 0, answers: [] });
    b.card("done", r, ["group:A"], {
      expectedAnswerCount: 0,
      answers: [],
      completedWithNoAnswer: true,
    });
    const state = roundState(
      { _id: r, tag: b.tag("group:A") },
      b.nodes,
      b.puzzles,
      b.tags,
    );
    assert.deepEqual(state.cards, { solved: 2, unsolved: 0 });
    assert.isTrue(state.finished);
  });

  it("counts locked and unknown-count puzzles as unsolved", function () {
    const b = board();
    const r = b.frame("r", { tag: "group:A" });
    b.card("f1", r, ["group:A"]);
    b.card("locked", r, ["group:A"], { locked: true, answers: [] });
    b.card("unknown", r, ["group:A"], {
      expectedAnswerCount: -1,
      answers: ["ONE"],
    });
    const state = roundState(
      { _id: r, tag: b.tag("group:A") },
      b.nodes,
      b.puzzles,
      b.tags,
    );
    assert.deepEqual(state.cards, { solved: 1, unsolved: 2 });
    assert.isFalse(state.finished);
  });

  it("counts cards in nested frames", function () {
    const b = board();
    const r = b.frame("r", { tag: "group:A" });
    const sub = b.frame("sub", { tag: "group:A-sub", parent: r });
    const inner = b.frame("inner", { parent: sub });
    b.card("f1", r, ["group:A"]);
    b.card("s1", sub, ["group:A-sub"]);
    b.card("s2", inner, ["group:A-sub"], b.unsolved);
    const state = roundState(
      { _id: r, tag: b.tag("group:A") },
      b.nodes,
      b.puzzles,
      b.tags,
    );
    // The header counts only the frame's own cards, as the puzzle list does.
    assert.deepEqual(state.cards, { solved: 1, unsolved: 0 });
    assert.deepEqual(state.allCards, { solved: 2, unsolved: 1 });
    assert.isFalse(state.finished);
  });

  it("leaves out hidden cards and cards whose puzzle has gone", function () {
    const b = board();
    const r = b.frame("r", { tag: "group:A" });
    b.card("f1", r, ["group:A"]);
    b.card("hidden", r, ["group:A"], b.unsolved);
    b.nodes.find((n) => n._id === "card_hidden")!.hidden = true;
    b.nodes.push({
      _id: "card_gone",
      type: "puzzle",
      parent: r,
      puzzle: "gone",
    });
    const state = roundState(
      { _id: r, tag: b.tag("group:A") },
      b.nodes,
      b.puzzles,
      b.tags,
    );
    assert.deepEqual(state.cards, { solved: 1, unsolved: 0 });
    assert.isTrue(state.finished);
  });

  it("stops on a parent loop", function () {
    const b = board();
    b.frame("a", { tag: "group:A", parent: "b" });
    b.frame("b", { parent: "a" });
    b.card("f1", "b", ["group:A"]);
    const state = roundState(
      { _id: "a", tag: b.tag("group:A") },
      b.nodes,
      b.puzzles,
      b.tags,
    );
    assert.deepEqual(state.allCards, { solved: 1, unsolved: 0 });
  });

  it("looks no deeper than MAX_FRAME_DEPTH frames", function () {
    const b = board();
    const r = b.frame("r", { tag: "group:A" });
    let parent = r;
    for (let depth = 1; depth <= MAX_FRAME_DEPTH; depth++) {
      parent = b.frame(`f${depth}`, { parent });
    }
    // The frame at MAX_FRAME_DEPTH - 1 is as deep as a counted card's frame
    // goes; the one below it is past the limit.
    b.card("near", `f${MAX_FRAME_DEPTH - 1}`, ["group:A"]);
    b.card("deep", `f${MAX_FRAME_DEPTH}`, ["group:A"], b.unsolved);
    const state = roundState(
      { _id: r, tag: b.tag("group:A") },
      b.nodes,
      b.puzzles,
      b.tags,
    );
    assert.deepEqual(state.allCards, { solved: 1, unsolved: 0 });
  });

  it("is ready to meta once every feeder is solved and a meta isn't", function () {
    const b = board();
    const r = b.frame("r", { tag: "group:A" });
    b.card("meta", r, ["meta-for:A", "group:A"], b.unsolved);
    b.card("f1", r, ["group:A"]);
    b.card("f2", r, ["group:A"], b.unsolved);
    const groupA = b.tag("group:A");
    let state = roundState({ _id: r, tag: groupA }, b.nodes, b.puzzles, b.tags);
    assert.isFalse(state.readyToMeta);
    assert.deepEqual(state.feeders, { solved: 1, unsolved: 1 });
    b.puzzles.find((p) => p._id === "f2")!.answers = ["DONE"];
    state = roundState({ _id: r, tag: groupA }, b.nodes, b.puzzles, b.tags);
    assert.isTrue(state.readyToMeta);
    assert.isFalse(state.finished);
    b.puzzles.find((p) => p._id === "meta")!.answers = ["META"];
    state = roundState({ _id: r, tag: groupA }, b.nodes, b.puzzles, b.tags);
    assert.isFalse(state.readyToMeta);
    assert.isTrue(state.finished);
  });

  it("isn't ready to meta with no solved feeder", function () {
    const b = board();
    const r = b.frame("r", { tag: "group:A" });
    b.card("meta", r, ["meta-for:A"], b.unsolved);
    const state = roundState(
      { _id: r, tag: b.tag("group:A") },
      b.nodes,
      b.puzzles,
      b.tags,
    );
    assert.isFalse(state.readyToMeta);
  });

  it("never finishes a frame with no tag", function () {
    const b = board();
    const r = b.frame("mine");
    b.card("f1", r, []);
    const state = roundState({ _id: r }, b.nodes, b.puzzles, b.tags);
    assert.deepEqual(state.cards, { solved: 1, unsolved: 0 });
    assert.isFalse(state.finished);
  });

  it("handles an empty board", function () {
    const state = roundState({ _id: "nothing" }, [], [], []);
    assert.deepEqual(state.cards, { solved: 0, unsolved: 0 });
    assert.isFalse(state.finished);
    assert.isFalse(state.readyToMeta);
  });
});

describe("whiteboard finishedFrames", function () {
  it("skips hidden, hand-made and ungrouped frames", function () {
    const b = board();
    const done = b.frame("done", { tag: "group:A" });
    b.card("a1", done, ["group:A"]);
    const hidden = b.frame("hidden", { tag: "group:B" });
    b.nodes.find((n) => n._id === hidden)!.hidden = true;
    b.card("b1", hidden, ["group:B"]);
    const mine = b.frame("mine");
    b.card("m1", mine, []);
    const ungrouped = b.frame("ungrouped", { kind: "ungrouped" });
    b.card("u1", ungrouped, []);
    const open = b.frame("open", { tag: "group:C" });
    b.card("c1", open, ["group:C"], b.unsolved);
    assert.deepEqual(finishedFrames(b.nodes, b.puzzles, b.tags), [done]);
  });

  it("handles an empty board", function () {
    assert.deepEqual(finishedFrames([], [], []), []);
  });
});
