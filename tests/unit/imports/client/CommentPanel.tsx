import { cleanup, render, screen } from "@testing-library/react";
import { assert } from "chai";
import sinon from "sinon";
import { ThemeProvider } from "styled-components";
import CommentPanel from "../../../../imports/client/components/whiteboard/CommentPanel";
import { lightTheme } from "../../../../imports/client/theme";

// i18next escapes interpolated values for HTML, which React then renders
// literally, so whatever a comment is on must go in some other way.
const TARGET = "Tom & Jerry's <Day>";

describe("whiteboard comment panel", function () {
  afterEach(function () {
    cleanup();
  });

  it("shows what a new comment is on as typed", async function () {
    render(
      <ThemeProvider theme={lightTheme}>
        <CommentPanel
          huntId="hunt"
          puzzleId="puzzle"
          draft={{ x: 0, y: 0 }}
          targetLabel={TARGET}
          canComment={false}
          onClose={sinon.fake()}
          onDraftSent={sinon.fake()}
        />
      </ThemeProvider>,
    );
    assert.exists(await screen.findByText(`New comment on ${TARGET}`));
  });
});
