import { cleanup, render, screen } from "@testing-library/react";
import { assert } from "chai";
import { ThemeProvider } from "styled-components";
import PressEnterHint from "../../../../imports/client/components/PressEnterHint";
import PuzzleUnlockModal from "../../../../imports/client/components/PuzzleUnlockModal";
import { lightTheme } from "../../../../imports/client/theme";
import type { PuzzleType } from "../../../../imports/lib/models/Puzzles";

// i18next escapes interpolated values for HTML, which React then renders
// literally, so a title with an apostrophe or an ampersand must go in some
// other way.
const TITLE = "Tom & Jerry's <Day> / Night";

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
          interests={[]}
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
