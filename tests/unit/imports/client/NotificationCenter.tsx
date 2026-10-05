import { cleanup, render, screen } from "@testing-library/react";
import { assert } from "chai";
import { MemoryRouter } from "react-router";
import { ThemeProvider } from "styled-components";
import {
  BoardCommentNotificationMessage,
  ChatNotificationMessage,
} from "../../../../imports/client/components/NotificationCenter";
import { lightTheme } from "../../../../imports/client/theme";
import type { ChatNotificationType } from "../../../../imports/lib/models/ChatNotifications";
import type { HuntType } from "../../../../imports/lib/models/Hunts";
import type { PuzzleType } from "../../../../imports/lib/models/Puzzles";

const HUNT_ID = "notificationCenterHunt";
const common = {
  deleted: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: "operator",
};

const hunt = { _id: HUNT_ID, name: "The hunt", ...common } as HuntType;
const puzzle = (
  id: string,
  title: string,
  kind?: "whiteboard",
): PuzzleType => ({
  _id: id,
  hunt: HUNT_ID,
  title,
  tags: [],
  answers: [],
  expectedAnswerCount: 1,
  ...(kind ? { kind } : {}),
  ...common,
});
// The whiteboard's hidden puzzle, which board comments are sent to
const backing = puzzle("backingPuzzle", "Whiteboard", "whiteboard");
// The puzzle whose card the comment is on. React escapes text, so the title
// must show as typed.
const card = puzzle("cardPuzzle", "Tom & Jerry's <Feeder>");

const row: ChatNotificationType = {
  _id: "row",
  user: "me",
  sender: "ada",
  puzzle: backing._id,
  hunt: HUNT_ID,
  content: {
    type: "message",
    children: [{ text: "\n  Is this the meta?\nSecond line" }],
  },
  timestamp: new Date(),
  message: "comment",
  mentioned: false,
  thread: "comment",
  reason: "boardComment",
  cardPuzzle: card._id,
  ...common,
};

describe("NotificationCenter", function () {
  afterEach(function () {
    cleanup();
  });

  it("shows a comment on a puzzle's card as a comment on that puzzle, from its sender", function () {
    render(
      <ThemeProvider theme={lightTheme}>
        <MemoryRouter>
          <BoardCommentNotificationMessage
            cn={row}
            hunt={hunt}
            puzzle={backing}
            cardPuzzle={card}
            displayNames={new Map([["ada", "Ada Lovelace"]])}
          />
        </MemoryRouter>
      </ThemeProvider>,
    );
    const link = screen.getByRole("link", { name: card.title });
    assert.include(
      link.closest("strong")?.textContent ?? "",
      `Comment on ${card.title}`,
    );
    assert.equal(
      link.getAttribute("href"),
      `/hunts/${HUNT_ID}/whiteboard?comment=comment#msg=comment`,
    );
    const body = document.querySelector(".toast-body")?.textContent ?? "";
    assert.include(body, "Ada Lovelace: Is this the meta?");
    assert.notInclude(body, "Second line");
    assert.isNull(screen.queryByText("Whiteboard"));
  });

  it("shows a comment whose card's puzzle has gone as a comment on the whiteboard", function () {
    render(
      <ThemeProvider theme={lightTheme}>
        <MemoryRouter>
          <BoardCommentNotificationMessage
            cn={row}
            hunt={hunt}
            puzzle={backing}
            cardPuzzle={undefined}
            displayNames={new Map([["ada", "Ada Lovelace"]])}
          />
        </MemoryRouter>
      </ThemeProvider>,
    );
    const link = screen.getByRole("link", {
      name: "Comment on the whiteboard",
    });
    assert.equal(
      link.getAttribute("href"),
      `/hunts/${HUNT_ID}/whiteboard?comment=comment#msg=comment`,
    );
    const body = document.querySelector(".toast-body")?.textContent ?? "";
    assert.include(body, "Ada Lovelace: Is this the meta?");
  });

  it("shows other chat notifications under the puzzle the message was on", function () {
    render(
      <ThemeProvider theme={lightTheme}>
        <MemoryRouter>
          <ChatNotificationMessage
            cn={{ ...row, reason: undefined, cardPuzzle: undefined }}
            hunt={hunt}
            puzzle={backing}
            displayNames={new Map([["ada", "Ada Lovelace"]])}
            selfUserId="me"
            roles={[]}
          />
        </MemoryRouter>
      </ThemeProvider>,
    );
    screen.getByRole("link", { name: "Whiteboard" });
    assert.isNull(screen.queryByText(/^Comment on/));
  });
});
