import { Meteor } from "meteor/meteor";
import { cleanup, render, screen } from "@testing-library/react";
import { assert } from "chai";
import sinon from "sinon";
import { ThemeProvider } from "styled-components";

// i18next escapes interpolated values for HTML, which React then renders
// literally, so whatever a comment is on must go in some other way.
const TARGET = "Tom & Jerry's <Day>";

if (Meteor.isClient) {
  const CommentPanel: typeof import("../../../../imports/client/components/whiteboard/CommentPanel").default =
    require("../../../../imports/client/components/whiteboard/CommentPanel").default;
  const {
    lightTheme,
  }: typeof import("../../../../imports/client/theme") = require("../../../../imports/client/theme");

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
            readOnly
            onClose={sinon.fake()}
            onDraftSent={sinon.fake()}
          />
        </ThemeProvider>,
      );
      assert.exists(await screen.findByText(`New comment on ${TARGET}`));
    });
  });
}
