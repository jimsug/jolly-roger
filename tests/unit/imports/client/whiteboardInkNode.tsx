import { cleanup, render, waitFor } from "@testing-library/react";
import { ReactFlow, ReactFlowProvider } from "@xyflow/react";
import { assert } from "chai";
import sinon from "sinon";
import { ThemeProvider } from "styled-components";
import colors from "../../../../imports/client/components/whiteboard/colors";
import InkNode from "../../../../imports/client/components/whiteboard/InkNode";
import { markerBlend } from "../../../../imports/client/components/whiteboard/marker";
import type { WhiteboardActions } from "../../../../imports/client/components/whiteboard/WhiteboardContext";
import WhiteboardContext from "../../../../imports/client/components/whiteboard/WhiteboardContext";
import { darkTheme, lightTheme } from "../../../../imports/client/theme";
import type { WhiteboardNodeType } from "../../../../imports/lib/models/WhiteboardNodes";
import { MARKER_OPACITY } from "../../../../imports/lib/whiteboard/ink";

const nodeTypes = { ink: InkNode };

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

describe("whiteboard highlighter blend", function () {
  it("multiplies on the light theme and screens on the dark one", function () {
    assert.equal(markerBlend(lightTheme), "multiply");
    assert.equal(markerBlend(darkTheme), "screen");
  });
});

describe("whiteboard ink node", function () {
  afterEach(function () {
    cleanup();
  });

  const stroke = (
    _id: string,
    strokeWidth: WhiteboardNodeType["strokeWidth"],
  ): WhiteboardNodeType => ({
    ...base,
    _id,
    type: "ink",
    position: { x: 20, y: 30 + (_id === "pen" ? 100 : 0) },
    width: 248,
    height: 48,
    color: "yellow",
    strokeWidth,
    stroke: _id,
    points: [
      [24, 24, 0.5],
      [224, 24, 0.5],
    ],
  });

  it("draws a highlighter translucent, marked to blend with the board", async function () {
    const { container } = renderAt(
      [stroke("marker", "marker"), stroke("pen", "medium")],
      1,
    );
    const markerPath = await waitFor(() => {
      const found = container.querySelector<SVGPathElement>(
        '.react-flow__node[data-id="marker"] svg path',
      );
      assert.isNotNull(found);
      return found;
    });
    const svg = markerPath.closest("svg")!;
    assert.isTrue(svg.classList.contains("jr-ink-marker"));
    assert.equal(
      markerPath.getAttribute("fill-opacity"),
      String(MARKER_OPACITY),
    );
    assert.equal(markerPath.getAttribute("fill"), colors.stroke.yellow);

    const penPath = container.querySelector<SVGPathElement>(
      '.react-flow__node[data-id="pen"] svg path',
    );
    assert.isNotNull(penPath);
    assert.isFalse(penPath.closest("svg")!.classList.contains("jr-ink-marker"));
    assert.isNull(penPath.getAttribute("fill-opacity"));
  });
});
