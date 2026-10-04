import { assert } from "chai";
import type { FoldNode } from "../../../../imports/lib/whiteboard/collapse";
import {
  collapsedAncestors,
  foldEnds,
  foldedInto,
  foldLines,
} from "../../../../imports/lib/whiteboard/collapse";
import { MAX_FRAME_DEPTH } from "../../../../imports/lib/whiteboard/limits";

const frame = (
  _id: string,
  parent?: string,
  collapsed?: boolean,
): FoldNode => ({ _id, parent, collapsed });
const node = (_id: string, parent?: string): FoldNode => ({ _id, parent });

const NOTHING_OPEN = new Set<string>();

describe("whiteboard collapse", function () {
  it("finds the outermost collapsed frame", function () {
    const nodes = [
      frame("outer", undefined, true),
      frame("middle", "outer"),
      frame("inner", "middle", true),
      node("card", "inner"),
      node("loose"),
    ];
    const folded = foldedInto(nodes, NOTHING_OPEN);
    assert.deepEqual(
      [...folded].toSorted(([a], [b]) => a.localeCompare(b)),
      [
        ["card", "outer"],
        ["inner", "outer"],
        ["middle", "outer"],
      ],
    );
    assert.deepEqual(
      collapsedAncestors(new Map(nodes.map((n) => [n._id, n])), "card"),
      ["inner", "outer"],
    );
  });

  it("doesn't fold open frames", function () {
    const nodes = [
      frame("outer", undefined, true),
      frame("inner", "outer", true),
      node("card", "inner"),
      frame("other", undefined, false),
      node("note", "other"),
    ];
    // Peeking at the outer frame leaves the inner one folded
    assert.deepEqual(
      [...foldedInto(nodes, new Set(["outer"]))],
      [["card", "inner"]],
    );
    assert.deepEqual([...foldedInto(nodes, new Set(["outer", "inner"]))], []);
  });

  it("stops on a parent loop and at MAX_FRAME_DEPTH", function () {
    const looped = [
      frame("a", "b", true),
      frame("b", "a", true),
      node("card", "a"),
    ];
    // The loop is drawn at the top level, so neither frame hides the other,
    // and a card in one goes no further than its own frame.
    assert.deepEqual([...foldedInto(looped, NOTHING_OPEN)], [["card", "a"]]);
    assert.deepEqual(
      collapsedAncestors(new Map(looped.map((n) => [n._id, n])), "card"),
      ["a", "b"],
    );

    const chain = [frame("f0", undefined, true)];
    for (let i = 1; i <= MAX_FRAME_DEPTH + 1; i++) {
      chain.push(frame(`f${i}`, `f${i - 1}`));
    }
    chain.push(node("deep", `f${MAX_FRAME_DEPTH + 1}`));
    const folded = foldedInto(chain, NOTHING_OPEN);
    assert.equal(folded.get(`f${MAX_FRAME_DEPTH}`), "f0");
    assert.isFalse(folded.has("deep"));
  });

  it("drops a line with both ends in one collapsed frame", function () {
    const folded = foldedInto(
      [frame("round", undefined, true), node("a", "round"), node("b", "round")],
      NOTHING_OPEN,
    );
    assert.isUndefined(foldEnds("a", "b", folded));
    assert.isUndefined(foldEnds("a", "round", folded));
    assert.deepEqual(
      foldLines([{ source: "a", target: "b", auto: false }], folded),
      [],
    );
  });

  it("redirects a line with one end inside", function () {
    const folded = foldedInto(
      [frame("round", undefined, true), node("a", "round"), node("outside")],
      NOTHING_OPEN,
    );
    assert.deepEqual(foldEnds("a", "outside", folded), {
      source: "round",
      target: "outside",
      folded: true,
    });
    assert.deepEqual(foldEnds("outside", "round", folded), {
      source: "outside",
      target: "round",
      folded: false,
    });
  });

  it("keeps one feeder arrow per frame and meta", function () {
    const folded = foldedInto(
      [
        frame("round", undefined, true),
        node("f1", "round"),
        node("f2", "round"),
        node("f3", "round"),
        node("meta"),
        node("other"),
      ],
      NOTHING_OPEN,
    );
    const lines = [
      { _id: "e1", source: "f1", target: "meta", auto: true },
      { _id: "e2", source: "f2", target: "meta", auto: true },
      { _id: "e3", source: "f3", target: "other", auto: true },
      // Drawn lines each stay, even between the same two things
      { _id: "e4", source: "f1", target: "meta" },
      { _id: "e5", source: "f2", target: "meta" },
    ];
    assert.deepEqual(
      foldLines(lines, folded).map((l) => [
        l.line._id,
        l.source,
        l.target,
        l.folded,
      ]),
      [
        ["e1", "round", "meta", true],
        ["e3", "round", "other", true],
        ["e4", "round", "meta", true],
        ["e5", "round", "meta", true],
      ],
    );
  });

  it("handles an empty board", function () {
    assert.equal(foldedInto([], NOTHING_OPEN).size, 0);
    assert.deepEqual(foldLines([], new Map()), []);
    assert.deepEqual(collapsedAncestors(new Map(), "gone"), []);
    assert.deepEqual(foldEnds("a", "b", new Map()), {
      source: "a",
      target: "b",
      folded: false,
    });
  });
});
