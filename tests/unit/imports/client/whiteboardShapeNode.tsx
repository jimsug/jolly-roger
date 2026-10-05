import { cleanup, render, waitFor } from "@testing-library/react";
import { ReactFlow, ReactFlowProvider } from "@xyflow/react";
import { assert } from "chai";
import sinon from "sinon";
import { ThemeProvider } from "styled-components";
import colors from "../../../../imports/client/components/whiteboard/colors";
import ShapeNode from "../../../../imports/client/components/whiteboard/ShapeNode";
import type { WhiteboardActions } from "../../../../imports/client/components/whiteboard/WhiteboardContext";
import WhiteboardContext from "../../../../imports/client/components/whiteboard/WhiteboardContext";
import { lightTheme } from "../../../../imports/client/theme";
import type { WhiteboardNodeType } from "../../../../imports/lib/models/WhiteboardNodes";

const nodeTypes = { shape: ShapeNode };

const actions: WhiteboardActions = {
  readOnly: true,
  readOnlyForLayout: false,
  compact: false,
  coarse: false,
  updateNodes: sinon.fake(),
  updateEdge: sinon.fake(),
  persistResize: sinon.fake(),
  fitToContents: sinon.fake(),
  tidyCards: sinon.fake(),
  beginEndpointDrag: sinon.fake(),
  onEditingChange: sinon.fake(),
  editOnAppear: undefined,
  clearEditOnAppear: sinon.fake(),
};

const base = {
  hunt: "hunt",
  board: "board",
  contributors: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: "user",
};

function renderAt(docs: WhiteboardNodeType[], zoom: number) {
  return render(
    <ThemeProvider theme={lightTheme}>
      <div style={{ width: 800, height: 600 }}>
        <ReactFlowProvider>
          <WhiteboardContext value={actions}>
            <ReactFlow
              nodes={docs.map((doc) => ({
                id: doc._id,
                type: doc.type,
                position: doc.position,
                width: doc.width,
                height: doc.height,
                data: { doc },
              }))}
              edges={[]}
              nodeTypes={nodeTypes}
              defaultViewport={{ x: 0, y: 0, zoom }}
              minZoom={0.05}
            />
          </WhiteboardContext>
        </ReactFlowProvider>
      </div>
    </ThemeProvider>,
  );
}

describe("whiteboard shape node", function () {
  afterEach(function () {
    cleanup();
  });

  const rect: WhiteboardNodeType = {
    ...base,
    _id: "rect",
    type: "shape",
    shape: "rect",
    color: "blue",
    position: { x: 20, y: 30 },
    width: 160,
    height: 120,
  };
  const ellipse: WhiteboardNodeType = {
    ...base,
    _id: "ellipse",
    type: "shape",
    shape: "ellipse",
    position: { x: 300, y: 30 },
    width: 100,
    height: 60,
  };

  const shapeSvg = (container: HTMLElement, id: string) =>
    waitFor(() => {
      const found = container.querySelector<SVGSVGElement>(
        `.react-flow__node[data-id="${id}"] svg.jr-shape`,
      );
      assert.isNotNull(found);
      return found;
    });

  it("draws a rectangle in its colour's fill and outline", async function () {
    const { container } = renderAt([rect], 1);
    const svg = await shapeSvg(container, "rect");
    assert.isFalse(svg.classList.contains("jr-shape-far"));
    assert.equal(svg.querySelector("title")?.textContent, "Rectangle");
    const shape = svg.querySelector("rect");
    assert.isNotNull(shape);
    assert.isNull(svg.querySelector("ellipse"));
    assert.equal(shape.getAttribute("fill"), colors.fill.blue);
    assert.equal(shape.getAttribute("stroke"), colors.stroke.blue);
    assert.equal(shape.getAttribute("stroke-width"), "2");
    // The outline sits inside the node
    assert.equal(shape.getAttribute("x"), "1");
    assert.equal(shape.getAttribute("width"), "158");
    assert.equal(shape.getAttribute("height"), "118");
  });

  it("draws an ellipse with no colour clear, outlined in the text colour", async function () {
    const { container } = renderAt([ellipse], 1);
    const svg = await shapeSvg(container, "ellipse");
    assert.equal(svg.querySelector("title")?.textContent, "Ellipse");
    const shape = svg.querySelector("ellipse");
    assert.isNotNull(shape);
    assert.isNull(svg.querySelector("rect"));
    assert.equal(shape.getAttribute("fill"), "none");
    assert.equal(shape.getAttribute("stroke"), lightTheme.colors.text);
    assert.equal(shape.getAttribute("cx"), "50");
    assert.equal(shape.getAttribute("cy"), "30");
    assert.equal(shape.getAttribute("rx"), "49");
    assert.equal(shape.getAttribute("ry"), "29");
  });

  it("draws only the filled outline when zoomed right out", async function () {
    const { container } = renderAt([rect, ellipse], 0.1);
    const far = await shapeSvg(container, "rect");
    assert.isTrue(far.classList.contains("jr-shape-far"));
    const shape = far.querySelector("rect");
    assert.equal(shape?.getAttribute("fill"), colors.fill.blue);
    assert.equal(shape?.getAttribute("stroke"), colors.stroke.blue);
    // Kept a couple of pixels thick on screen however far out
    assert.equal(shape?.getAttribute("vector-effect"), "non-scaling-stroke");
    const farEllipse = await shapeSvg(container, "ellipse");
    assert.isTrue(farEllipse.classList.contains("jr-shape-far"));
    assert.exists(farEllipse.querySelector("ellipse"));
  });

  it("shows a locked shape's padlock at every zoom", async function () {
    const locked = { ...rect, locked: true, lockedBy: "user" };
    const near = renderAt([locked], 1);
    await waitFor(() =>
      assert.exists(
        near.container.querySelector(
          '.react-flow__node[data-id="rect"] .jr-lock-badge',
        ),
      ),
    );
    cleanup();
    const { container } = renderAt([locked], 0.1);
    const far = await shapeSvg(container, "rect");
    assert.isTrue(far.classList.contains("jr-shape-far"));
    assert.exists(
      container.querySelector(
        '.react-flow__node[data-id="rect"] .jr-lock-badge',
      ),
    );
  });
});
