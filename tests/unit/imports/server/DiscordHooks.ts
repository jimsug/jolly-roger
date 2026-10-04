import { assert } from "chai";
import { formatTagForDiscord } from "../../../../imports/server/hooks/DiscordHooks";

describe("DiscordHooks", function () {
  describe("formatTagForDiscord", function () {
    it("swaps known prefixes for an icon and leaves other names alone", function () {
      assert.equal(formatTagForDiscord("group:events"), "📂 events");
      assert.equal(formatTagForDiscord("meta-for:events"), "⭐️ events");
      assert.equal(formatTagForDiscord("where:Building 10"), "📍 Building 10");
      assert.equal(formatTagForDiscord("needs:extraction"), "needs:extraction");
    });

    it("shows a synonym prefix as its canonical kind", function () {
      assert.equal(formatTagForDiscord("loc:atrium"), "📍 atrium");
      assert.equal(formatTagForDiscord("location:atrium"), "📍 atrium");
      assert.equal(formatTagForDiscord("stuck"), "stuck");
    });

    it("escapes markdown so a tag name can't smuggle a link into the embed", function () {
      assert.equal(
        formatTagForDiscord("[Hunt voice chat](https://evil.example)"),
        "\\[Hunt voice chat\\]\\(https://evil.example\\)",
      );
      assert.equal(
        formatTagForDiscord("group:*loud* _b_"),
        "📂 \\*loud\\* \\_b\\_",
      );
      assert.equal(formatTagForDiscord("||spoiler||"), "\\|\\|spoiler\\|\\|");
      assert.equal(formatTagForDiscord("`code`"), "\\`code\\`");
    });
  });
});
