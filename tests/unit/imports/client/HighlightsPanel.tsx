import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { assert } from "chai";
import sinon from "sinon";
import { ThemeProvider } from "styled-components";
import HighlightsPanel from "../../../../imports/client/components/HighlightsPanel";
import BoardFocusContext from "../../../../imports/client/components/whiteboard/BoardFocusContext";
import { lightTheme } from "../../../../imports/client/theme";

const SELF = "highlightsSelf";
const OTHER = "highlightsOther";

const message = (
  _id: string,
  sender: string,
  parentId?: string,
  extra: { comment?: { x: number; y: number }; thread?: string } = {},
) => ({
  _id,
  sender,
  content: { type: "message" as const, children: [{ text: `about ${_id}` }] },
  timestamp: new Date(),
  parentId,
  ...extra,
});

const renderPanel = (
  chatMessages: ReturnType<typeof message>[],
  focusComment?: (threadId: string) => void,
) =>
  render(
    <ThemeProvider theme={lightTheme}>
      <BoardFocusContext value={focusComment && { focusComment }}>
        <HighlightsPanel
          chatMessages={chatMessages}
          displayNames={
            new Map([
              [SELF, "Self"],
              [OTHER, "Other"],
            ])
          }
          selfUserId={SELF}
          roles={[]}
          scrollToMessage={sinon.fake()}
          onHeightChange={sinon.fake()}
        />
      </BoardFocusContext>
    </ThemeProvider>,
  );

describe("HighlightsPanel", function () {
  afterEach(function () {
    cleanup();
  });

  it("counts other people's replies to you", function () {
    renderPanel([
      message("question", SELF),
      message("followUp", SELF, "question"),
      message("answer", OTHER, "question"),
    ]);
    assert.exists(screen.getByRole("button", { name: "Highlights (1)" }));
  });

  it("doesn't count your replies to yourself", function () {
    renderPanel([
      message("question", SELF),
      message("followUp", SELF, "question"),
    ]);
    assert.isNull(screen.queryByRole("button"));
  });

  it("lists the board threads you're in, with a way to show each on the board", async function () {
    const focusComment = sinon.fake();
    const comment = { x: 0, y: 0 };
    renderPanel(
      [
        message("started", SELF, undefined, { comment }),
        message("joined", OTHER, undefined, { comment }),
        message("myReply", SELF, "joined", { thread: "joined" }),
        message("notMine", OTHER, undefined, { comment }),
      ],
      focusComment,
    );
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /^Highlights/ }));
    });
    const tab = await screen.findByRole("tab", { name: "Comments (2)" });
    act(() => {
      fireEvent.click(tab);
    });
    const panel = screen.getByRole("tabpanel");
    within(panel).getByText("about started");
    within(panel).getByText("about joined");
    assert.isNull(within(panel).queryByText("about notMine"));
    const show = within(panel).getAllByRole("button", {
      name: "Show on board",
    });
    assert.lengthOf(show, 2);
    act(() => {
      fireEvent.click(show[0]!);
    });
    assert.isTrue(focusComment.calledOnce);
    assert.include(["started", "joined"], focusComment.firstCall.args[0]);
  });

  it("has no Comments tab off the board", async function () {
    renderPanel([
      message("started", SELF, undefined, { comment: { x: 0, y: 0 } }),
      message("answer", OTHER, "started"),
    ]);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /^Highlights/ }));
    });
    await screen.findByRole("tab", { name: "Replies (1)" });
    assert.isNull(screen.queryByRole("tab", { name: /^Comments/ }));
  });
});
