import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { assert } from "chai";
import type React from "react";
import sinon from "sinon";
import { ThemeProvider } from "styled-components";
import { ChatHistoryMessage } from "../../../../imports/client/components/PuzzlePage";
import { lightTheme } from "../../../../imports/client/theme";

const SELF = "historySelf";
const OTHER = "historyOther";

const message = (
  sender: string,
  extra: { editedAt?: Date; deletedAt?: Date } = {},
) => ({
  _id: `${sender}Message`,
  hunt: "hunt",
  puzzle: "puzzle",
  sender,
  content: {
    type: "message" as const,
    children: extra.deletedAt ? [] : [{ text: `from ${sender}` }],
  },
  timestamp: new Date(),
  ...extra,
});

const renderMessage = (
  shown: ReturnType<typeof message>,
  props: Partial<React.ComponentProps<typeof ChatHistoryMessage>> = {},
) =>
  render(
    <ThemeProvider theme={lightTheme}>
      <ChatHistoryMessage
        message={shown}
        reactions={[]}
        displayNames={
          new Map([
            [SELF, "Self"],
            [OTHER, "Other"],
          ])
        }
        isSystemMessage={false}
        isHighlighted={false}
        isPinned={false}
        isReplyTarget={false}
        isPulsing={false}
        suppressSender={false}
        selfUserId={SELF}
        roles={[]}
        scrollToMessage={sinon.fake()}
        onReply={sinon.fake()}
        imageOnLoad={sinon.fake()}
        canDelete={shown.sender === SELF && !shown.deletedAt}
        onEdit={sinon.fake()}
        onEditDone={sinon.fake()}
        onDelete={sinon.fake()}
        {...props}
      />
    </ThemeProvider>,
  );

describe("ChatHistoryMessage", function () {
  afterEach(function () {
    cleanup();
  });

  it("offers Edit and Delete on your own message", function () {
    const onEdit = sinon.fake();
    const onDelete = sinon.fake();
    const mine = message(SELF);
    renderMessage(mine, { onEdit, onDelete });
    fireEvent.click(screen.getByRole("button", { name: "Edit message" }));
    assert.isTrue(onEdit.calledOnceWith(mine._id));
    fireEvent.click(screen.getByRole("button", { name: "Delete message" }));
    assert.isTrue(onDelete.calledOnceWith(mine));
  });

  it("offers neither on someone else's message", function () {
    renderMessage(message(OTHER));
    assert.exists(screen.getByRole("button", { name: "Reply" }));
    assert.isNull(screen.queryByRole("button", { name: "Edit message" }));
    assert.isNull(screen.queryByRole("button", { name: "Delete message" }));
  });

  it("offers neither without the handlers, as in the pinned pane", function () {
    renderMessage(message(SELF), {
      onEdit: undefined,
      onDelete: undefined,
    });
    assert.isNull(screen.queryByRole("button", { name: "Edit message" }));
    assert.isNull(screen.queryByRole("button", { name: "Delete message" }));
  });

  it("shows a deleted message as a placeholder with no actions", function () {
    renderMessage(message(SELF, { deletedAt: new Date() }));
    assert.exists(screen.getByText("Message deleted"));
    assert.exists(screen.getByText("Self"), "who sent it still shows");
    assert.lengthOf(screen.queryAllByRole("button"), 0);
  });

  it("marks an edited message, with when in its title", function () {
    const editedAt = new Date();
    renderMessage(message(OTHER, { editedAt }));
    const mark = screen.getByText("(edited)");
    assert.match(mark.title, /^Edited /);
    assert.exists(screen.getByText("from historyOther"));
  });

  it("doesn't mark a message that hasn't been edited", function () {
    renderMessage(message(OTHER));
    assert.isNull(screen.queryByText("(edited)"));
  });
});
