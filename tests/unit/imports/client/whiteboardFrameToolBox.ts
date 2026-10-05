import { assert } from "chai";
import frameToolBox from "../../../../imports/client/components/whiteboard/frameToolBox";
import type { WhiteboardFlowNode } from "../../../../imports/client/hooks/useWhiteboardSync";

const node = (
  id: string,
  type: string,
  doc: Record<string, unknown> = {},
  data: Record<string, unknown> = {},
) =>
  ({
    id,
    type,
    data: { doc: { _id: id, type, ...doc }, ...data },
    position: { x: 10, y: 20 },
    measured: { width: 300, height: 200 },
  }) as unknown as WhiteboardFlowNode;

describe("frameToolBox", function () {
  it("gives a node's box in its frame", function () {
    assert.deepEqual(frameToolBox(node("n", "sticky", { locked: true })), {
      id: "n",
      x: 10,
      y: 20,
      width: 300,
      height: 200,
      locked: true,
    });
  });

  it("marks a shape as background and nothing else", function () {
    assert.isTrue(frameToolBox(node("s", "shape")).background);
    for (const type of ["sticky", "text", "image", "ink", "frame", "puzzle"]) {
      assert.notProperty(frameToolBox(node("n", type)), "background", type);
    }
  });

  it("counts a collapsed frame at its stored height", function () {
    const box = frameToolBox(
      node("f", "frame", { width: 800, height: 600 }, { collapsed: true }),
    );
    assert.equal(box.height, 600);
    assert.equal(box.width, 300);
  });
});
