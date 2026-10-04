import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { assert } from "chai";
import sinon from "sinon";
import { ThemeProvider } from "styled-components";
import CommentPanel from "../../../../imports/client/components/whiteboard/CommentPanel";
import { lightTheme } from "../../../../imports/client/theme";
import isReaction from "../../../../imports/lib/isReaction";
import type { ChatMessageType } from "../../../../imports/lib/models/ChatMessages";
import { groupThreads } from "../../../../imports/lib/whiteboard/comments";

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

  describe("reactions", function () {
    const text = (value: string) => ({
      type: "message" as const,
      children: [{ text: value }],
    });
    const message = (_id: string, extra: Partial<ChatMessageType>) =>
      ({
        _id,
        hunt: "hunt",
        puzzle: "puzzle",
        sender: "someone",
        timestamp: new Date(1000),
        content: text(_id),
        ...extra,
      }) as ChatMessageType;
    const thread = groupThreads(
      [
        message("root", { comment: { x: 0, y: 0 } }),
        message("reply", { parentId: "root", thread: "root" }),
        message("like", {
          parentId: "reply",
          thread: "root",
          content: text("👍"),
        }),
      ],
      isReaction,
    ).get("root")!;

    const renderThread = (canComment: boolean) =>
      render(
        <ThemeProvider theme={lightTheme}>
          <CommentPanel
            huntId="hunt"
            puzzleId="puzzle"
            thread={thread}
            targetLabel="the board"
            canComment={canComment}
            offline={false}
            onClose={sinon.fake()}
            onDeleted={sinon.fake()}
            onDraftSent={sinon.fake()}
            onError={sinon.fake()}
          />
        </ThemeProvider>,
      );

    it("shows reactions on the message they're on, with a React button on each message", async function () {
      renderThread(true);
      const pill = await screen.findByRole<HTMLButtonElement>("button", {
        name: "👍",
      });
      assert.isFalse(pill.disabled);
      // Under the reply it's on, not the comment
      assert.lengthOf(screen.getAllByRole("button", { name: "👍" }), 1);
      assert.isTrue(
        !!(
          screen.getByText("reply").compareDocumentPosition(pill) &
          Node.DOCUMENT_POSITION_FOLLOWING
        ),
      );
      assert.lengthOf(screen.getAllByRole("button", { name: "React" }), 2);
    });

    it("shows reactions without a way to react when it can't comment", async function () {
      renderThread(false);
      const pill = await screen.findByRole<HTMLButtonElement>("button", {
        name: "👍",
      });
      assert.isTrue(pill.disabled);
      assert.isNull(screen.queryByRole("button", { name: "React" }));
    });
  });
});
