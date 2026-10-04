import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
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
          offline={false}
          onClose={sinon.fake()}
          onDeleted={sinon.fake()}
          onDraftSent={sinon.fake()}
          onError={sinon.fake()}
        />
      </ThemeProvider>,
    );
    assert.exists(await screen.findByText(`New comment on ${TARGET}`));
  });

  it("keeps what's being written while the connection drops", async function () {
    const panel = (canComment: boolean, offline: boolean) => (
      <ThemeProvider theme={lightTheme}>
        <CommentPanel
          huntId="hunt"
          puzzleId="puzzle"
          draft={{ x: 0, y: 0 }}
          targetLabel="the board"
          canComment={canComment}
          offline={offline}
          onClose={sinon.fake()}
          onDeleted={sinon.fake()}
          onDraftSent={sinon.fake()}
          onError={sinon.fake()}
        />
      </ThemeProvider>
    );
    const { rerender } = render(panel(true, false));
    const editor = await waitFor(() => {
      const found = document.querySelector<HTMLElement>("[data-slate-editor]");
      assert.isNotNull(found);
      assert.isTrue(found.contains(document.activeElement));
      return found;
    });
    act(() => {
      // Slate types from beforeinput, at the selection focusing set
      editor.dispatchEvent(
        new InputEvent("beforeinput", {
          inputType: "insertText",
          data: "Half a thought",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    const send = () =>
      screen.getByRole<HTMLButtonElement>("button", { name: "Send" });
    await waitFor(() => assert.isFalse(send().disabled));

    rerender(panel(false, true));
    assert.include(
      document.querySelector("[data-slate-editor]")?.textContent ?? "",
      "Half a thought",
    );
    assert.isTrue(send().disabled);

    rerender(panel(true, false));
    assert.include(
      document.querySelector("[data-slate-editor]")?.textContent ?? "",
      "Half a thought",
    );
    assert.isFalse(send().disabled);
  });

  it("drops the composer when commenting goes for good", async function () {
    const panel = (canComment: boolean) => (
      <ThemeProvider theme={lightTheme}>
        <CommentPanel
          huntId="hunt"
          puzzleId="puzzle"
          draft={{ x: 0, y: 0 }}
          targetLabel="the board"
          canComment={canComment}
          offline={false}
          onClose={sinon.fake()}
          onDeleted={sinon.fake()}
          onDraftSent={sinon.fake()}
          onError={sinon.fake()}
        />
      </ThemeProvider>
    );
    const { rerender } = render(panel(true));
    await waitFor(() =>
      assert.isNotNull(document.querySelector("[data-slate-editor]")),
    );
    rerender(panel(false));
    assert.isNull(document.querySelector("[data-slate-editor]"));
    assert.isNull(screen.queryByRole("button", { name: "Send" }));
  });
});
