import { assert } from "chai";
import isReaction, { reactionEmoji } from "../../../../imports/lib/isReaction";
import type { ChatMessageContentNodeType } from "../../../../imports/lib/models/ChatMessages";

// A reply to some other message
const message = (
  children: ChatMessageContentNodeType[],
  parentId = "parent",
) => ({
  content: { type: "message" as const, children },
  parentId,
});
// A message of its own, with no parent at all
const topLevel = (children: ChatMessageContentNodeType[]) => ({
  content: { type: "message" as const, children },
});

describe("isReaction", function () {
  it("treats a reply holding one emoji as a reaction", function () {
    assert.isTrue(isReaction(message([{ text: "👍" }])));
    assert.isTrue(
      isReaction(message([{ text: " 🎉 " }])),
      "whitespace trimmed",
    );
    assert.isTrue(isReaction(message([{ text: "✅" }])), "quick reaction");
    assert.isTrue(isReaction(message([{ text: "↔️" }])), "variation selector");
    assert.isTrue(isReaction(message([{ text: "👍🏽" }])), "skin tone");
    assert.isTrue(isReaction(message([{ text: "👨‍👩‍👧" }])), "ZWJ sequence");
    assert.isTrue(isReaction(message([{ text: "🇦🇺" }])), "flag");
    assert.isTrue(isReaction(message([{ text: "1️⃣" }])), "keycap");
  });

  it("needs a parent: an emoji on its own is just a message", function () {
    assert.isFalse(isReaction(topLevel([{ text: "👍" }])));
  });

  it("needs exactly one text node holding nothing but emoji", function () {
    assert.isFalse(isReaction(message([])));
    assert.isFalse(isReaction(message([{ text: "" }])));
    assert.isFalse(isReaction(message([{ text: "   " }])));
    assert.isFalse(isReaction(message([{ text: "👍 nice" }])));
    assert.isFalse(isReaction(message([{ text: "nice" }])));
    assert.isFalse(isReaction(message([{ text: "123" }])), "digits are Emoji");
    assert.isFalse(isReaction(message([{ text: "#" }])));
    assert.isFalse(isReaction(message([{ text: "👍" }, { text: "👍" }])));
    assert.isFalse(
      isReaction(message([{ type: "mention", userId: "someone" }])),
    );
    assert.isFalse(
      isReaction(
        message([{ type: "image", url: "https://example.com/a.png" }]),
      ),
    );
  });

  it("reads the emoji back trimmed", function () {
    assert.equal(reactionEmoji(message([{ text: " 🎉 " }])), "🎉");
    assert.equal(
      reactionEmoji(message([{ type: "mention", userId: "someone" }])),
      "",
    );
  });
});
