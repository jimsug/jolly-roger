import { assert } from "chai";
import chatMessagePlainText from "../../../../imports/lib/chatMessagePlainText";
import type { ChatMessageContentType } from "../../../../imports/lib/models/ChatMessages";

const content = (
  children: ChatMessageContentType["children"],
): ChatMessageContentType => ({ type: "message", children });

describe("chatMessagePlainText", function () {
  const displayNames = new Map([["u1", "Alice"]]);
  const puzzleTitles = new Map([["p1", "Crossword"]]);

  it("flattens every kind of node into one line", function () {
    const text = chatMessagePlainText(
      content([
        { text: "hey " },
        { type: "mention", userId: "u1" },
        { text: " and " },
        { type: "role-mention", roleId: "operator" },
        { text: " see " },
        { type: "puzzle", puzzleId: "p1" },
        { text: " " },
        { type: "image", url: "https://example.com/a.png" },
      ]),
      displayNames,
      puzzleTitles,
    );
    assert.equal(text, "hey @Alice and @operator see [Crossword] 🖼");
  });

  it("falls back when a name or title is unknown", function () {
    assert.equal(
      chatMessagePlainText(
        content([
          { type: "mention", userId: "nobody" },
          { type: "puzzle", puzzleId: "nothing" },
        ]),
        displayNames,
        puzzleTitles,
      ),
      "@???[???]",
    );
    assert.equal(
      chatMessagePlainText(
        content([
          { type: "mention", userId: "u1" },
          { type: "puzzle", puzzleId: "p1" },
        ]),
      ),
      "@???[???]",
      "without lookup tables everything is unknown",
    );
  });

  it("handles an empty message", function () {
    assert.equal(chatMessagePlainText(content([])), "");
  });
});
