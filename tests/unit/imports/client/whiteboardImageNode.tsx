import { cleanup, render, waitFor } from "@testing-library/react";
import { ReactFlow, ReactFlowProvider } from "@xyflow/react";
import { assert } from "chai";
import sinon from "sinon";
import { ThemeProvider } from "styled-components";
import ImageNode from "../../../../imports/client/components/whiteboard/ImageNode";
import type { WhiteboardActions } from "../../../../imports/client/components/whiteboard/WhiteboardContext";
import WhiteboardContext from "../../../../imports/client/components/whiteboard/WhiteboardContext";
import { lightTheme } from "../../../../imports/client/theme";
import type { WhiteboardNodeType } from "../../../../imports/lib/models/WhiteboardNodes";

const nodeTypes = { image: ImageNode };

describe("whiteboard image node", function () {
  afterEach(function () {
    cleanup();
  });

  const url = "https://s3.us-east-1.amazonaws.com/bucket/hunt/puzzle/upload";
  const doc: WhiteboardNodeType = {
    _id: "image",
    hunt: "hunt",
    board: "board",
    type: "image",
    position: { x: 20, y: 30 },
    width: 240,
    height: 135,
    image: { url, width: 1600, height: 900 },
    contributors: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: "user",
  };

  const actions: WhiteboardActions = {
    readOnly: true,
    readOnlyForLayout: false,
    compact: false,
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

  const renderAt = (zoom: number) =>
    render(
      <ThemeProvider theme={lightTheme}>
        <div style={{ width: 800, height: 600 }}>
          <ReactFlowProvider>
            <WhiteboardContext value={actions}>
              <ReactFlow
                nodes={[
                  {
                    id: doc._id,
                    type: "image",
                    position: doc.position,
                    width: doc.width,
                    height: doc.height,
                    data: { doc },
                  },
                ]}
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

  it("draws the image at the node's size, not draggable", async function () {
    const { container } = renderAt(1);
    const img = await waitFor(() => {
      const found = container.querySelector<HTMLImageElement>(
        '.react-flow__node[data-id="image"] img',
      );
      assert.isNotNull(found);
      return found;
    });
    assert.equal(img.getAttribute("src"), url);
    assert.equal(img.getAttribute("width"), "240");
    assert.equal(img.getAttribute("height"), "135");
    assert.equal(img.getAttribute("draggable"), "false");
    assert.equal(img.alt, "Image");
    const box = img.getBoundingClientRect();
    assert.closeTo(box.width, 240, 1);
    assert.closeTo(box.height, 135, 1);
    assert.isNull(container.querySelector(".jr-image-far"));
  });

  it("draws a grey box instead when zoomed right out", async function () {
    const { container } = renderAt(0.1);
    const far = await waitFor(() => {
      const found = container.querySelector<HTMLElement>(
        '.react-flow__node[data-id="image"] .jr-image-far',
      );
      assert.isNotNull(found);
      return found;
    });
    assert.equal(far.title, "Image");
    assert.equal(far.textContent, "Image");
    assert.exists(far.querySelector("svg"));
    assert.isNull(container.querySelector("img"));
  });
});
