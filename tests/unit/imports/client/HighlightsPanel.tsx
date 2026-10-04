import { cleanup, render, screen } from "@testing-library/react";
import { assert } from "chai";
import sinon from "sinon";
import { ThemeProvider } from "styled-components";
import HighlightsPanel from "../../../../imports/client/components/HighlightsPanel";
import { lightTheme } from "../../../../imports/client/theme";

const SELF = "highlightsSelf";
const OTHER = "highlightsOther";

const message = (_id: string, sender: string, parentId?: string) => ({
  _id,
  sender,
  content: { type: "message" as const, children: [{ text: `about ${_id}` }] },
  timestamp: new Date(),
  parentId,
});

const renderPanel = (chatMessages: ReturnType<typeof message>[]) =>
  render(
    <ThemeProvider theme={lightTheme}>
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
});
