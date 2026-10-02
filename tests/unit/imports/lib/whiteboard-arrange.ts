import { assert } from "chai";
import type { ArrangeItem } from "../../../../imports/lib/whiteboard/arrange";
import {
  alignItems,
  arrangeUnits,
  companionsOf,
  distributeItems,
} from "../../../../imports/lib/whiteboard/arrange";

const item = (
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
): ArrangeItem => ({ id, x, y, width, height });

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
    const centre = apply(items, alignItems(items, "centre"));
    assert.deepEqual(
      centre.map((i) => i.x + i.width / 2),
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
    const xs = result.map((i) => i.x).sort((p, q) => p - q);
    assert.closeTo(xs[1]! - xs[0]!, xs[2]! - xs[1]!, 1e-9);
  });
});

describe("whiteboard arrangeUnits", function () {
  const node = (
    id: string,
    type: string,
    extra: Partial<{ parent: string; selected: boolean; stroke: string }> = {},
  ) => ({ id, type, ...extra });

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
    assert.deepEqual([...units.keys()].sort(), ["frame", "stroke:s"]);
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
    assert.deepEqual([...units.keys()].sort(), ["b", "c"]);
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
  const node = (
    id: string,
    type: string,
    extra: Partial<{ parent: string; stroke: string }> = {},
  ) => ({ id, type, ...extra });

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

  it("skips anything already moving", function () {
    const result = companionsOf(
      [node("a", "sticky"), node("p", "point")],
      [{ id: "l", source: "a", target: "p" }],
      new Set(["a", "p"]),
    );
    assert.equal(result.size, 0);
  });
});
