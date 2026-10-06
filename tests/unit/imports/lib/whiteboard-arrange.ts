import { assert } from "chai";
import type { ArrangeItem } from "../../../../imports/lib/whiteboard/arrange";
import {
  absolutePosition,
  alignItems,
  arrangeUnits,
  companionsOf,
  distributeItems,
  inParentLoop,
  parentChainBroken,
  sortParentsFirst,
  withoutParentLoops,
} from "../../../../imports/lib/whiteboard/arrange";
import { MAX_FRAME_DEPTH } from "../../../../imports/lib/whiteboard/limits";

const item = (
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
): ArrangeItem => ({ id, x, y, width, height });

const node = (
  id: string,
  type: string,
  extra: Partial<{ parent: string; selected: boolean; stroke: string }> = {},
) => ({ id, type, ...extra });

const apply = (
  items: ArrangeItem[],
  shifts: Map<string, { dx: number; dy: number }>,
) =>
  items.map((i) => {
    const s = shifts.get(i.id) ?? { dx: 0, dy: 0 };
    return { ...i, x: i.x + s.dx, y: i.y + s.dy };
  });

describe("whiteboard alignItems", function () {
  const items = [item("a", 10, 0, 100, 50), item("b", 40, 100, 20, 80)];

  it("does nothing for fewer than two items", function () {
    assert.equal(alignItems([], "left").size, 0);
    assert.equal(alignItems([items[0]!], "left").size, 0);
  });

  it("lines up left, centre and right edges", function () {
    const left = apply(items, alignItems(items, "left"));
    assert.deepEqual(
      left.map((i) => i.x),
      [10, 10],
    );
    const center = apply(items, alignItems(items, "center"));
    assert.deepEqual(
      center.map((i) => i.x + i.width / 2),
      [60, 60],
    );
    const right = apply(items, alignItems(items, "right"));
    assert.deepEqual(
      right.map((i) => i.x + i.width),
      [110, 110],
    );
  });

  it("lines up top, middle and bottom edges", function () {
    const top = apply(items, alignItems(items, "top"));
    assert.deepEqual(
      top.map((i) => i.y),
      [0, 0],
    );
    const middle = apply(items, alignItems(items, "middle"));
    assert.deepEqual(
      middle.map((i) => i.y + i.height / 2),
      [90, 90],
    );
    const bottom = apply(items, alignItems(items, "bottom"));
    assert.deepEqual(
      bottom.map((i) => i.y + i.height),
      [180, 180],
    );
  });

  it("only moves along one axis", function () {
    alignItems(items, "left").forEach((s) => assert.equal(s.dy, 0));
    alignItems(items, "top").forEach((s) => assert.equal(s.dx, 0));
  });
});

describe("whiteboard distributeItems", function () {
  it("does nothing for fewer than three items", function () {
    assert.equal(
      distributeItems(
        [item("a", 0, 0, 10, 10), item("b", 50, 0, 10, 10)],
        "horizontal",
      ).size,
      0,
    );
  });

  it("evens out the gaps and keeps the ends still", function () {
    const items = [
      item("a", 0, 0, 10, 10),
      item("b", 15, 0, 30, 10),
      item("c", 90, 0, 10, 10),
    ];
    const result = apply(items, distributeItems(items, "horizontal"));
    const [a, b, c] = result as [ArrangeItem, ArrangeItem, ArrangeItem];
    assert.equal(a.x, 0);
    assert.equal(c.x, 90);
    assert.closeTo(b.x - (a.x + a.width), c.x - (b.x + b.width), 1e-9);
    result.forEach((i) => assert.equal(i.y, 0));
  });

  it("keeps the order when the first item is also the longest", function () {
    const items = [
      item("long", 0, 0, 500, 10),
      item("b", 100, 0, 10, 10),
      item("c", 300, 0, 10, 10),
    ];
    const result = apply(items, distributeItems(items, "horizontal"));
    const x = (id: string) => result.find((i) => i.id === id)!.x;
    assert.equal(x("long"), 0);
    assert.equal(x("c"), 300);
    assert.isBelow(x("long"), x("b"));
    assert.isBelow(x("b"), x("c"));
  });

  it("spaces starts evenly when the items overlap", function () {
    const items = [
      item("a", 0, 0, 100, 10),
      item("b", 10, 0, 100, 10),
      item("c", 20, 0, 100, 10),
    ];
    const result = apply(items, distributeItems(items, "horizontal"));
    const xs = result.map((i) => i.x).toSorted((p, q) => p - q);
    assert.closeTo(xs[1]! - xs[0]!, xs[2]! - xs[1]!, 1e-9);
  });
});

describe("whiteboard arrangeUnits", function () {
  it("groups ink segments and keeps children with their frame", function () {
    const units = arrangeUnits(
      [
        node("frame", "frame", { selected: true }),
        node("inside", "sticky", { parent: "frame", selected: true }),
        node("ink1", "ink", { stroke: "s", selected: true }),
        node("ink2", "ink", { stroke: "s", selected: true }),
      ],
      [],
    );
    assert.deepEqual([...units.keys()].toSorted(), ["frame", "stroke:s"]);
    assert.sameMembers(units.get("stroke:s")!, ["ink1", "ink2"]);
  });

  it("makes a line with two free ends its own unit", function () {
    const units = arrangeUnits(
      [
        node("a", "sticky", { selected: true }),
        node("p1", "point"),
        node("p2", "point"),
      ],
      [{ id: "line", source: "p1", target: "p2", selected: true }],
    );
    assert.sameMembers(units.get("line:line")!, ["p1", "p2"]);
    assert.isTrue(units.has("a"));
  });

  it("moves a line's free end with the object it's attached to", function () {
    const units = arrangeUnits(
      [
        node("a", "sticky", { selected: true }),
        node("b", "sticky", { selected: true }),
        node("p", "point"),
      ],
      [{ id: "line", source: "a", target: "p" }],
    );
    assert.sameMembers(units.get("a")!, ["a", "p"]);
    assert.isFalse(units.has("line:line"));
  });

  it("leaves a line alone when its object isn't being arranged", function () {
    const units = arrangeUnits(
      [
        node("a", "sticky"),
        node("b", "sticky", { selected: true }),
        node("c", "sticky", { selected: true }),
        node("p", "point"),
      ],
      [{ id: "line", source: "a", target: "p", selected: true }],
    );
    assert.deepEqual([...units.keys()].toSorted(), ["b", "c"]);
  });

  it("follows the outermost selected frame for an attached line", function () {
    const units = arrangeUnits(
      [
        node("frame", "frame", { selected: true }),
        node("inside", "sticky", { parent: "frame" }),
        node("other", "sticky", { selected: true }),
        node("p", "point"),
      ],
      [{ id: "line", source: "inside", target: "p" }],
    );
    assert.sameMembers(units.get("frame")!, ["frame", "p"]);
  });

  it("doesn't hang on frames whose parents loop", function () {
    const units = arrangeUnits(
      [
        node("f", "frame", { parent: "g", selected: true }),
        node("g", "frame", { parent: "f", selected: true }),
      ],
      [],
    );
    assert.equal(units.size, 0);
  });

  it("does nothing for lines attached at both ends", function () {
    const units = arrangeUnits(
      [
        node("a", "sticky", { selected: true }),
        node("b", "sticky", { selected: true }),
      ],
      [{ id: "line", source: "a", target: "b", selected: true }],
    );
    assert.deepEqual(
      [...units.values()].map((v) => v.length),
      [1, 1],
    );
  });
});

describe("whiteboard companionsOf", function () {
  it("brings the free end of an attached line", function () {
    const result = companionsOf(
      [node("a", "sticky"), node("p", "point")],
      [{ id: "l", source: "a", target: "p" }],
      new Set(["a"]),
    );
    assert.deepEqual([...result], [["p", "a"]]);
  });

  it("brings free ends attached to things inside a moved frame", function () {
    const result = companionsOf(
      [
        node("f", "frame"),
        node("inside", "sticky", { parent: "f" }),
        node("p", "point"),
      ],
      [{ id: "l", source: "inside", target: "p" }],
      new Set(["f"]),
    );
    assert.deepEqual([...result], [["p", "f"]]);
  });

  it("leaves a free end that's inside the moved frame to move with it", function () {
    const result = companionsOf(
      [node("f", "frame"), node("p", "point", { parent: "f" })],
      [{ id: "l", source: "f", target: "p" }],
      new Set(["f"]),
    );
    assert.equal(result.size, 0);
  });

  it("brings the rest of an ink stroke", function () {
    const result = companionsOf(
      [
        node("i1", "ink", { stroke: "s" }),
        node("i2", "ink", { stroke: "s" }),
        node("i3", "ink", { stroke: "t" }),
      ],
      [],
      new Set(["i1"]),
    );
    assert.deepEqual([...result], [["i2", "i1"]]);
  });

  it("leaves frames whose parents loop to React Flow", function () {
    const result = companionsOf(
      [
        node("f", "frame", { parent: "g" }),
        node("g", "frame", { parent: "f" }),
        node("inside", "sticky", { parent: "g" }),
        node("p", "point"),
      ],
      [{ id: "l", source: "inside", target: "p" }],
      new Set(["f"]),
    );
    assert.equal(result.size, 0);
  });

  it("skips anything already moving", function () {
    const result = companionsOf(
      [node("a", "sticky"), node("p", "point")],
      [{ id: "l", source: "a", target: "p" }],
      new Set(["a", "p"]),
    );
    assert.equal(result.size, 0);
  });
});

describe("whiteboard withoutParentLoops", function () {
  it("leaves nodes alone when there's no loop", function () {
    const nodes = [
      { id: "f" },
      { id: "g", parentId: "f" },
      { id: "card", parentId: "g" },
    ];
    assert.strictEqual(withoutParentLoops(nodes), nodes);
  });

  it("lifts everything in a loop to the top level", function () {
    const result = withoutParentLoops([
      { id: "f", parentId: "g" },
      { id: "g", parentId: "h" },
      { id: "h", parentId: "f" },
      { id: "card", parentId: "g" },
      { id: "other", parentId: "elsewhere" },
    ]);
    assert.deepEqual(
      result.map((n) => [n.id, n.parentId]),
      [
        ["f", undefined],
        ["g", undefined],
        ["h", undefined],
        ["card", "g"],
        ["other", "elsewhere"],
      ],
    );
  });

  it("lifts a node that's its own parent", function () {
    const result = withoutParentLoops([{ id: "f", parentId: "f" }]);
    assert.isUndefined(result[0]!.parentId);
  });
});

describe("whiteboard sortParentsFirst", function () {
  const ids = (nodes: { id: string }[]) => nodes.map((n) => n.id);

  it("handles an empty board", function () {
    assert.deepEqual(sortParentsFirst([]), []);
  });

  it("keeps the order of nodes that are already parents first", function () {
    const nodes = [
      { id: "b" },
      { id: "f" },
      { id: "a", parentId: "f" },
      { id: "g", parentId: "f" },
      { id: "card", parentId: "g" },
    ];
    assert.deepEqual(ids(sortParentsFirst(nodes)), ids(nodes));
  });

  it("moves each frame ahead of what's inside it, however deep", function () {
    assert.deepEqual(
      ids(
        sortParentsFirst([
          { id: "card", parentId: "g" },
          { id: "g", parentId: "f" },
          { id: "sticky", parentId: "f" },
          { id: "f" },
          { id: "loose" },
        ]),
      ),
      ["f", "loose", "g", "sticky", "card"],
    );
  });

  it("counts a parent that isn't among the nodes as the top level", function () {
    assert.deepEqual(
      ids(
        sortParentsFirst([
          { id: "card", parentId: "f" },
          { id: "orphan", parentId: "gone" },
          { id: "f" },
        ]),
      ),
      ["orphan", "f", "card"],
    );
  });

  it("doesn't hang on frames whose parents loop", function () {
    const sorted = sortParentsFirst([
      { id: "f", parentId: "g" },
      { id: "g", parentId: "f" },
      { id: "top" },
    ]);
    assert.deepEqual(ids(sorted), ["top", "f", "g"]);
  });
});

// f0 at the top, f1 in it and so on, with a card in the last frame
const nested = (frames: number) => {
  const byId = new Map<
    string,
    { parent?: string; position: { x: number; y: number } }
  >();
  for (let i = 0; i <= frames; i++) {
    byId.set(`f${i}`, {
      ...(i > 0 ? { parent: `f${i - 1}` } : {}),
      position: { x: 1, y: 10 },
    });
  }
  byId.set("card", { parent: `f${frames}`, position: { x: 100, y: 200 } });
  return byId;
};

describe("whiteboard inParentLoop", function () {
  it("finds a node in a loop, but not one below it", function () {
    const byId = new Map([
      ["a", { parent: "b" }],
      ["b", { parent: "a" }],
      ["self", { parent: "self" }],
      ["card", { parent: "a" }],
      ["top", {}],
      ["lost", { parent: "gone" }],
    ]);
    assert.isTrue(inParentLoop(byId, "a"));
    assert.isTrue(inParentLoop(byId, "self"));
    assert.isFalse(inParentLoop(byId, "card"));
    assert.isFalse(inParentLoop(byId, "top"));
    assert.isFalse(inParentLoop(byId, "lost"));
  });
});

describe("whiteboard parentChainBroken", function () {
  it("allows MAX_FRAME_DEPTH frames around a node and refuses one more", function () {
    assert.isFalse(parentChainBroken(nested(MAX_FRAME_DEPTH - 1), "card"));
    assert.isTrue(parentChainBroken(nested(MAX_FRAME_DEPTH), "card"));
  });

  it("refuses a loop anywhere up the chain, and not a parent it doesn't know", function () {
    const byId = new Map([
      ["a", { parent: "b" }],
      ["b", { parent: "a" }],
      ["self", { parent: "self" }],
      ["card", { parent: "a" }],
      ["top", {}],
      ["lost", { parent: "gone" }],
    ]);
    assert.isTrue(parentChainBroken(byId, "a"));
    assert.isTrue(parentChainBroken(byId, "self"));
    assert.isTrue(parentChainBroken(byId, "card"));
    assert.isFalse(parentChainBroken(byId, "top"));
    assert.isFalse(parentChainBroken(byId, "lost"));
  });
});

describe("whiteboard absolutePosition", function () {
  it("adds the positions of up to MAX_FRAME_DEPTH frames", function () {
    const card = (byId: ReturnType<typeof nested>) =>
      absolutePosition(byId, byId.get("card")!);
    assert.deepEqual(card(nested(2)), { x: 103, y: 230 });
    assert.deepEqual(card(nested(MAX_FRAME_DEPTH - 1)), {
      x: 100 + MAX_FRAME_DEPTH,
      y: 200 + 10 * MAX_FRAME_DEPTH,
    });
    assert.deepEqual(card(nested(MAX_FRAME_DEPTH)), {
      x: 100 + MAX_FRAME_DEPTH,
      y: 200 + 10 * MAX_FRAME_DEPTH,
    });
  });

  it("leaves a node alone at the top level or under a parent it doesn't know", function () {
    const byId = new Map([["f", { position: { x: 5, y: 5 } }]]);
    const at = { position: { x: 1, y: 2 } };
    assert.deepEqual(absolutePosition(byId, at), { x: 1, y: 2 });
    assert.deepEqual(absolutePosition(byId, { ...at, parent: "gone" }), {
      x: 1,
      y: 2,
    });
  });
});
