import { Meteor } from "meteor/meteor";
import { cleanup, render, screen } from "@testing-library/react";
import { assert } from "chai";
import { ThemeProvider } from "styled-components";
import type { PuzzleType } from "../../../../imports/lib/models/Puzzles";

// i18next escapes interpolated values for HTML, which React then renders
// literally, so a title with an apostrophe or an ampersand must go in some
// other way.
const TITLE = "Tom & Jerry's <Day> / Night";

if (Meteor.isClient) {
  const PuzzleUnlockModal: typeof import("../../../../imports/client/components/PuzzleUnlockModal").default =
    require("../../../../imports/client/components/PuzzleUnlockModal").default;
  const {
    PressEnterHint,
  }: typeof import("../../../../imports/client/components/PuzzleListPage") = require("../../../../imports/client/components/PuzzleListPage");
  const {
    lightTheme,
  }: typeof import("../../../../imports/client/theme") = require("../../../../imports/client/theme");

  describe("puzzle titles in translated text", function () {
    afterEach(function () {
      cleanup();
    });

    it("are shown as typed in the unlock modal heading", async function () {
      const puzzle: PuzzleType = {
        _id: "puzzle",
        hunt: "hunt",
        title: TITLE,
        tags: [],
        answers: [],
        expectedAnswerCount: 1,
        locked: true,
        deleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "operator",
      };
      render(
        <ThemeProvider theme={lightTheme}>
          <PuzzleUnlockModal
            puzzle={puzzle}
            feedbacks={[]}
            showOnMount
            ref={null}
          />
        </ThemeProvider>,
      );
      assert.exists(await screen.findByText(`Unlock puzzle: ${TITLE}`));
    });

    it("are shown as typed in the Enter-to-open hint", function () {
      render(<PressEnterHint title={TITLE} />);
      const title = screen.getByText(TITLE);
      assert.equal(title.tagName, "STRONG");
      assert.equal(
        title.parentElement?.textContent,
        `Press Enter to go to ${TITLE}`,
      );
    });
  });
}
