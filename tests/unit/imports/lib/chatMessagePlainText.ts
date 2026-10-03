import { assert } from "chai";
import i18next, { type TFunction } from "i18next";
import chatMessagePlainText, {
  firehosePlainText,
} from "../../../../imports/lib/chatMessagePlainText";
import type { ChatMessageContentType } from "../../../../imports/lib/models/ChatMessages";

const content = (
  children: ChatMessageContentType["children"],
): ChatMessageContentType => ({ type: "message", children });

const everyKind = content([
  { text: "hey " },
  { type: "mention", userId: "u1" },
  { text: " and " },
  { type: "role-mention", roleId: "operator" },
  { text: " see " },
  { type: "puzzle", puzzleId: "p1" },
  { text: " " },
  { type: "image", url: "https://example.com/a.png" },
]);
const unknowns = content([
  { type: "mention", userId: "nobody" },
  { type: "puzzle", puzzleId: "nothing" },
]);

describe("chatMessagePlainText", function () {
  const displayNames = new Map([["u1", "Alice"]]);
  const puzzleTitles = new Map([["p1", "Crossword"]]);

  it("flattens every kind of node into one line", function () {
    assert.equal(
      chatMessagePlainText(everyKind, displayNames, puzzleTitles),
      "hey @Alice and @operator see [Crossword] 🖼",
    );
  });

  it("falls back when a name or title is unknown", function () {
    assert.equal(
      chatMessagePlainText(unknowns, displayNames, puzzleTitles),
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

describe("firehosePlainText", function () {
  const displayNames = new Map([["u1", "Alice"]]);
  const puzzles = new Map([
    ["p1", { title: "Crossword" }],
    ["p2", { title: "Tom & Jerry's <Day>" }],
  ]);
  let t: TFunction;

  this.beforeAll(async function () {
    // No resources, so every string is its English default, and i18next's
    // HTML escaping is left on as the app has it
    t = await i18next.createInstance().init({ lng: "en" });
  });

  it("spaces every kind of node out and labels puzzles and images", function () {
    assert.equal(
      firehosePlainText(everyKind, displayNames, puzzles, t),
      "hey   @Alice   and   @operator   see  [puzzle: Crossword]   [image]",
    );
  });

  it("falls back when a name or title is unknown", function () {
    assert.equal(
      firehosePlainText(unknowns, displayNames, puzzles, t),
      " @???  [puzzle: ???]",
    );
  });

  it("keeps a puzzle title as it is, unescaped", function () {
    assert.equal(
      firehosePlainText(
        content([{ type: "puzzle", puzzleId: "p2" }]),
        displayNames,
        puzzles,
        t,
      ),
      "[puzzle: Tom & Jerry's <Day>]",
    );
  });

  it("handles an empty message", function () {
    assert.equal(firehosePlainText(content([]), displayNames, puzzles, t), "");
  });
});
