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

    const renderThread = (canComment: boolean, compact = false) =>
      render(
        <ThemeProvider theme={lightTheme}>
          <CommentPanel
            huntId="hunt"
            puzzleId="puzzle"
            thread={thread}
            targetLabel="the board"
            canComment={canComment}
            compact={compact}
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
      assert.exists(screen.getByRole("button", { name: "Resolve" }));
      assert.exists(screen.getByRole("button", { name: "Send" }));
    });

    it("shows reactions without a way to react when it can't comment", async function () {
      renderThread(false);
      const pill = await screen.findByRole<HTMLButtonElement>("button", {
        name: "👍",
      });
      assert.isTrue(pill.disabled);
      assert.isNull(screen.queryByRole("button", { name: "React" }));
      assert.isNull(screen.queryByRole("button", { name: "Resolve" }));
      assert.isNull(screen.queryByRole("button", { name: "Send" }));
    });

    it("lays out as a sheet when compact", async function () {
      const box = document.createElement("div");
      box.style.width = "360px";
      box.style.display = "flex";
      box.style.flexDirection = "column";
      document.body.append(box);
      try {
        render(
          <ThemeProvider theme={lightTheme}>
            <CommentPanel
              huntId="hunt"
              puzzleId="puzzle"
              thread={thread}
              targetLabel="the board"
              canComment
              compact
              offline={false}
              onClose={sinon.fake()}
              onDeleted={sinon.fake()}
              onDraftSent={sinon.fake()}
              onError={sinon.fake()}
            />
          </ThemeProvider>,
          { container: box },
        );
        const panel = await screen.findByRole("dialog");
        const style = getComputedStyle(panel);
        assert.equal(panel.getBoundingClientRect().width, 360);
        assert.equal(style.borderTopLeftRadius, "12px");
        assert.equal(style.borderTopRightRadius, "12px");
        assert.equal(style.borderBottomLeftRadius, "0px");
        // Finger-sized buttons, and an editor iOS won't zoom in on
        const resolve = screen.getByRole("button", { name: "Resolve" });
        assert.include(resolve.className, "btn-lg");
        assert.include(
          screen.getByRole("button", { name: "Close" }).className,
          "btn-lg",
        );
        const send = screen.getByRole("button", { name: "Send" });
        assert.isAtLeast(send.getBoundingClientRect().height, 44);
        const editor = await waitFor(() => {
          const found = panel.querySelector<HTMLElement>("[data-slate-editor]");
          assert.isNotNull(found);
          return found;
        });
        assert.equal(getComputedStyle(editor).fontSize, "16px");
        // Scrolling the thread doesn't scroll the page behind it
        let messages = screen.getByText("reply").parentElement;
        while (messages && getComputedStyle(messages).overflowY !== "auto") {
          messages = messages.parentElement;
        }
        assert.exists(messages);
        assert.equal(getComputedStyle(messages).overscrollBehaviorY, "contain");
        // An existing thread doesn't bring up the keyboard
        assert.isFalse(editor.contains(document.activeElement));
        assert.equal(document.activeElement, panel);
      } finally {
        cleanup();
        box.remove();
      }
    });
  });
});
