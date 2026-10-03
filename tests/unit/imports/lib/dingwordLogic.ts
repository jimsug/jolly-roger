import type { Meteor } from "meteor/meteor";
import { assert } from "chai";
import {
  dingedByMentions,
  dingedByRoleMentions,
  messageDingsUser,
  normalizedForDingwordSearch,
  normalizedMessageDingsUserByDingword,
} from "../../../../imports/lib/dingwordLogic";
import type { ChatMessageContentType } from "../../../../imports/lib/models/ChatMessages";

const HUNT = "hunt1";
const SENDER = "sender";

const text = (body: string): ChatMessageContentType => ({
  type: "message",
  children: [{ text: body }],
});

const message = (content: ChatMessageContentType, sender = SENDER) => ({
  content,
  sender,
  hunt: HUNT,
});

const user = (
  dingwords: string[],
  extra: Partial<Meteor.User> = {},
): Meteor.User =>
  ({
    _id: "user1",
    dingwords,
    ...extra,
  }) as Meteor.User;

const matches = (
  body: string,
  dingwords: string[],
  extra: Partial<Meteor.User> = {},
) =>
  normalizedMessageDingsUserByDingword(
    normalizedForDingwordSearch(message(text(body))),
    user(dingwords, extra),
  );

describe("dingwordLogic", function () {
  describe("normalizedMessageDingsUserByDingword", function () {
    it("returns the dingwords that appear as whole words", function () {
      assert.deepEqual(matches("the cryptic is hard", ["cryptic", "logic"]), [
        "cryptic",
      ]);
      assert.deepEqual(
        matches("Cryptic logic puzzle", ["cryptic", "logic", "sudoku"]),
        ["cryptic", "logic"],
      );
      assert.deepEqual(matches("nothing here", ["cryptic"]), []);
      assert.deepEqual(matches("cryptic", []), []);
      assert.deepEqual(matches("", ["cryptic"]), []);
    });

    it("ignores case", function () {
      assert.deepEqual(matches("REO SPEEDWAGON", ["reo speedwagon"]), [
        "reo speedwagon",
      ]);
      assert.deepEqual(matches("sudoku time", ["SUDOKU"]), ["SUDOKU"]);
    });

    it("needs a word boundary on both sides unless open match is on", function () {
      assert.deepEqual(matches("illogical", ["logic"]), []);
      assert.deepEqual(matches("logician", ["logic"]), []);
      assert.deepEqual(matches("logic!", ["logic"]), ["logic"]);
      assert.deepEqual(matches("(logic)", ["logic"]), ["logic"]);

      const open = { dingwordsOpenMatch: true };
      assert.deepEqual(matches("logician", ["logic"], open), ["logic"]);
      assert.deepEqual(matches("logical", ["logic"], open), ["logic"]);
      assert.deepEqual(matches("illogical", ["logic"], open), []);
      assert.deepEqual(matches("a logic", ["logic"], open), ["logic"]);
    });

    it("treats regex characters in a dingword literally", function () {
      assert.deepEqual(matches("what?", ["what?"]), ["what?"]);
      assert.deepEqual(matches("whatever", ["what?"]), []);
      assert.deepEqual(matches("c++ rules", ["c++"]), ["c++"]);
      assert.deepEqual(matches("a.b", ["a.b"]), ["a.b"]);
      assert.deepEqual(matches("axb", ["a.b"]), []);
      assert.deepEqual(matches("1 (two)", ["(two)"]), ["(two)"]);
    });

    it("matches multi-word dingwords across any whitespace", function () {
      assert.deepEqual(
        matches("the  reo\nspeedwagon song", ["reo speedwagon"]),
        ["reo speedwagon"],
      );
      assert.deepEqual(matches("reospeedwagon", ["reo speedwagon"]), []);
      assert.deepEqual(matches("blank", ["", "  "]), []);
    });

    it("respects word boundaries in other scripts", function () {
      assert.deepEqual(matches("das straße ist", ["straße"]), ["straße"]);
      assert.deepEqual(matches("straßenbahn", ["straße"]), []);
      assert.deepEqual(matches("café au lait", ["café"]), ["café"]);
      // Letters outside the basic plane take two UTF-16 units
      assert.deepEqual(matches("𝐀logic", ["logic"]), []);
      assert.deepEqual(matches("logic𝐀", ["logic"]), []);
      assert.deepEqual(
        matches("logic𝐀", ["logic"], { dingwordsOpenMatch: true }),
        ["logic"],
      );
      assert.deepEqual(matches("🧩logic🧩", ["logic"]), ["logic"]);
    });

    it("finds a later occurrence when the first is inside a word", function () {
      assert.deepEqual(matches("illogical logic", ["logic"]), ["logic"]);
      assert.deepEqual(matches("logical logician", ["logic"]), []);
    });

    it("collapses whitespace in the dingword as well as the message", function () {
      assert.deepEqual(matches("reo speedwagon", ["  reo \n speedwagon "]), [
        "  reo \n speedwagon ",
      ]);
    });

    it("stays cheap with a long dingword list", function () {
      const dingwords = Array.from(
        { length: 100 },
        (_, i) => `word${i} phrase`,
      );
      const text = `${"filler ".repeat(500)}word99 phrase`;
      const started = Date.now();
      for (let i = 0; i < 100; i += 1) {
        assert.deepEqual(matches(text, dingwords), ["word99 phrase"]);
      }
      assert.isBelow(Date.now() - started, 1000);
    });
  });

  describe("normalizedForDingwordSearch", function () {
    it("lowercases the text and lets mentions split words", function () {
      const content: ChatMessageContentType = {
        type: "message",
        children: [
          { text: "Hey" },
          { type: "mention", userId: "u2" },
          { text: "LOGIC time " },
        ],
      };
      assert.equal(
        normalizedForDingwordSearch(message(content)),
        "hey logic time",
      );
    });
  });

  describe("mentions", function () {
    const mention: ChatMessageContentType = {
      type: "message",
      children: [
        { text: "hi " },
        { type: "mention", userId: "user1" },
        { text: " and " },
        { type: "role-mention", roleId: "operator" },
      ],
    };

    it("detects @-mentions of the user", function () {
      assert.isTrue(dingedByMentions(message(mention), user([])));
      assert.isFalse(
        dingedByMentions(message(mention), user([], { _id: "someone" })),
      );
      assert.isFalse(dingedByMentions(message(text("plain")), user([])));
    });

    it("detects role mentions for users holding the role", function () {
      const operator = user([], { roles: { [HUNT]: ["operator"] } });
      assert.isTrue(dingedByRoleMentions(message(mention), operator));
      assert.isFalse(dingedByRoleMentions(message(mention), user([])));
      const member = user([], { hunts: [HUNT] });
      assert.isTrue(
        dingedByRoleMentions(message(mention), member, {
          _id: HUNT,
          defaultRoles: ["operator"],
        }),
        "Default roles count for members when the hunt is passed",
      );
      assert.isFalse(
        dingedByRoleMentions(message(mention), member),
        "Without the hunt document, default roles are unknown",
      );
    });
  });

  describe("messageDingsUser", function () {
    it("dings on dingwords, mentions and role mentions", function () {
      assert.isTrue(
        messageDingsUser(message(text("a sudoku")), user(["sudoku"])),
      );
      assert.isFalse(
        messageDingsUser(message(text("a sudokus")), user(["sudoku"])),
      );
      const mention: ChatMessageContentType = {
        type: "message",
        children: [{ type: "mention", userId: "user1" }],
      };
      assert.isTrue(messageDingsUser(message(mention), user([])));
      const role: ChatMessageContentType = {
        type: "message",
        children: [{ type: "role-mention", roleId: "operator" }],
      };
      assert.isTrue(
        messageDingsUser(
          message(role),
          user([], { roles: { [HUNT]: ["operator"] } }),
        ),
      );
      assert.isFalse(messageDingsUser(message(role), user([])));
    });

    it("never dings on your own or system messages", function () {
      assert.isFalse(
        messageDingsUser(message(text("sudoku"), "user1"), user(["sudoku"])),
      );
      assert.isFalse(
        messageDingsUser(
          { content: text("sudoku"), sender: undefined, hunt: HUNT },
          user(["sudoku"]),
        ),
      );
    });
  });
});
