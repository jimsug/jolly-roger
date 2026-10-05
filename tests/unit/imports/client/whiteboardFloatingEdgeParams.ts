import type { InternalNode } from "@xyflow/react";
import { assert } from "chai";
import floatingEdgeParams from "../../../../imports/client/components/whiteboard/floatingEdgeParams";

const node = (
  id: string,
  type: string,
  box: { x: number; y: number; width: number; height: number },
  doc: Record<string, unknown> = {},
) =>
  ({
    id,
    type,
    data: { doc: { _id: id, type, ...doc } },
    position: { x: box.x, y: box.y },
    width: box.width,
    height: box.height,
    measured: { width: box.width, height: box.height },
    internals: { positionAbsolute: { x: box.x, y: box.y }, z: 0 },
  }) as unknown as InternalNode;

// How far a point is from the outline of the ellipse filling a box, as the
// ellipse's equation: 1 on the outline.
const onEllipse = (
  box: { x: number; y: number; width: number; height: number },
  p: { x: number; y: number },
) => {
  const a = box.width / 2;
  const b = box.height / 2;
  return ((p.x - box.x - a) / a) ** 2 + ((p.y - box.y - b) / b) ** 2;
};

describe("whiteboard floatingEdgeParams", function () {
  const shapeBox = { x: 0, y: 0, width: 160, height: 120 };
  // A card whose centre is down and to the right of the shape's, at 45
  // degrees.
  const card = node("card", "puzzle", {
    x: 230,
    y: 235,
    width: 100,
    height: 50,
  });

  it("ends a diagonal line on an ellipse's outline", function () {
    const ellipse = node("e", "shape", shapeBox, { shape: "ellipse" });
    const p = floatingEdgeParams(ellipse, card);
    assert.closeTo(
      onEllipse(shapeBox, { x: p.sourceX, y: p.sourceY }),
      1,
      1e-9,
    );
    // Along the line between the two centres.
    assert.closeTo(p.sourceX - 80, p.sourceY - 60, 1e-9);
    assert.isBelow(p.sourceX, 160);
    assert.isBelow(p.sourceY, 120);

    const back = floatingEdgeParams(card, ellipse);
    assert.closeTo(
      onEllipse(shapeBox, { x: back.targetX, y: back.targetY }),
      1,
      1e-9,
    );
  });

  it("ends a diagonal line on a rectangle's border", function () {
    const rect = node("r", "shape", shapeBox, { shape: "rect" });
    const p = floatingEdgeParams(rect, card);
    assert.closeTo(p.sourceY, 120, 1e-9);
    assert.closeTo(p.sourceX, 140, 1e-9);
  });

  it("joins an ellipse to something inside it at the nearest point of its outline", function () {
    const wide = { x: 0, y: 0, width: 400, height: 60 };
    const ellipse = node("e", "shape", wide, { shape: "ellipse" });
    // Centred 100 right of the ellipse's centre, on its long axis.
    const inside = node("t", "text", { x: 280, y: 20, width: 40, height: 20 });
    const p = floatingEdgeParams(ellipse, inside);
    assert.closeTo(onEllipse(wide, { x: p.sourceX, y: p.sourceY }), 1, 1e-6);
    // Straight up or down to the outline, not out along the axis to its end.
    const reach = Math.hypot(p.sourceX - 300, p.sourceY - 30);
    assert.closeTo(reach, 25.881, 0.01);
  });

  it("leaves an ellipse with no size at its centre", function () {
    const flat = node(
      "e",
      "shape",
      { x: 10, y: 10, width: 0, height: 0 },
      {
        shape: "ellipse",
      },
    );
    const p = floatingEdgeParams(flat, card);
    assert.deepEqual([p.sourceX, p.sourceY], [10, 10]);
  });
});
