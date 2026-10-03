import { Accounts } from "meteor/accounts-base";
import { assert } from "chai";
import { SUPPRESS_ALL_DINGWORDS } from "../../../../imports/lib/dingwordLogic";
import type { ChatMessageContentType } from "../../../../imports/lib/models/ChatMessages";
import ChatMessages from "../../../../imports/lib/models/ChatMessages";
import ChatNotifications from "../../../../imports/lib/models/ChatNotifications";
import MeteorUsers from "../../../../imports/lib/models/MeteorUsers";
import Puzzles from "../../../../imports/lib/models/Puzzles";
import ChatNotificationHooks from "../../../../imports/server/hooks/ChatNotificationHooks";
import asUser from "../../../lib/asUser";
import createTestHunt from "../../../lib/createTestHunt";
import resetDatabase from "../../../lib/resetDatabase";

const text = (body: string): ChatMessageContentType => ({
  type: "message",
  children: [{ text: body }],
});

const mentionOf = (userId: string): ChatMessageContentType => ({
  type: "message",
  children: [{ text: "hey " }, { type: "mention", userId }],
});

describe("dingword suppression", function () {
  this.timeout(30000);

  let huntId: string;
  let otherHuntId: string;
  let senderId: string;
  let dingedId: string;
  let mentionedId: string;
  let outsiderId: string;
  let puzzleId: string;
  let otherPuzzleId: string;

  const newUser = async (
    email: string,
    hunts: string[],
    dingwords: string[],
  ) => {
    const userId = await Accounts.createUserAsync({
      email,
      password: "password",
    });
    await MeteorUsers.updateAsync(userId, {
      $set: { displayName: email, hunts, dingwords },
    });
    return userId;
  };

  // Sends a message from the sender and runs the notification hook on it
  const send = async (
    content: ChatMessageContentType,
    puzzle = puzzleId,
    hunt = huntId,
  ) => {
    const messageId = await asUser(senderId, () =>
      ChatMessages.insertAsync({
        hunt,
        puzzle,
        content,
        sender: senderId,
        timestamp: new Date(),
      }),
    );
    await asUser(senderId, async () => {
      await ChatNotificationHooks.onChatMessageCreated!(messageId);
    });
    return messageId;
  };

  const notificationsFor = (userId: string) =>
    ChatNotifications.find({ user: userId }).fetchAsync();

  const setSuppressed = (
    userId: string,
    suppressed: Record<string, Record<string, string[]>> | undefined,
  ) =>
    MeteorUsers.updateAsync(
      userId,
      suppressed
        ? { $set: { suppressedDingwords: suppressed } }
        : { $unset: { suppressedDingwords: "" } },
    );

  this.beforeAll(async function () {
    await resetDatabase("dingword suppression");
    senderId = await Accounts.createUserAsync({
      email: "sender@example.com",
      password: "password",
    });
    huntId = await createTestHunt(senderId, { name: "Dingword hunt" });
    otherHuntId = await createTestHunt(senderId, { name: "Other hunt" });
    await MeteorUsers.updateAsync(senderId, {
      $set: { displayName: "Sender", hunts: [huntId] },
    });
    dingedId = await newUser("dinged@example.com", [huntId], ["foo", "bar"]);
    mentionedId = await newUser("mentioned@example.com", [huntId], []);
    outsiderId = await newUser("outsider@example.com", [otherHuntId], ["foo"]);

    const newPuzzle = (hunt: string, title: string) =>
      asUser(senderId, () =>
        Puzzles.insertAsync({
          hunt,
          title,
          tags: [],
          answers: [],
          expectedAnswerCount: 1,
        }),
      );
    puzzleId = await newPuzzle(huntId, "Dinged puzzle");
    otherPuzzleId = await newPuzzle(huntId, "Other puzzle");
  });

  this.beforeEach(async function () {
    await ChatNotifications.collection.rawCollection().deleteMany({});
    await ChatMessages.collection.rawCollection().deleteMany({});
    await setSuppressed(dingedId, undefined);
  });

  describe("ChatNotificationHooks", function () {
    it("records the message and the dingwords that matched", async function () {
      const messageId = await send(text("Foo, then bar"));

      const notifications = await notificationsFor(dingedId);
      assert.lengthOf(notifications, 1);
      assert.equal(notifications[0]!.message, messageId);
      assert.sameMembers(notifications[0]!.dingwords ?? [], ["foo", "bar"]);
      assert.isFalse(notifications[0]!.mentioned);
      assert.isEmpty(
        await notificationsFor(outsiderId),
        "Members of other hunts aren't dinged",
      );
    });

    it("records each puzzle the message links to, once", async function () {
      const linked = await send({
        type: "message",
        children: [
          { text: "foo, see " },
          { type: "puzzle", puzzleId: otherPuzzleId },
          { text: " and " },
          { type: "puzzle", puzzleId: otherPuzzleId },
        ],
      });
      const plain = await send(text("foo"));

      const notifications = await notificationsFor(dingedId);
      assert.lengthOf(notifications, 2);
      assert.deepEqual(
        notifications.find((cn) => cn.message === linked)?.mentionedPuzzles,
        [otherPuzzleId],
      );
      assert.notProperty(
        notifications.find((cn) => cn.message === plain) ?? {},
        "mentionedPuzzles",
        "A message without links records none",
      );
    });

    it("records no dingwords for a plain @-mention", async function () {
      const messageId = await send(mentionOf(mentionedId));

      const notifications = await notificationsFor(mentionedId);
      assert.lengthOf(notifications, 1);
      assert.equal(notifications[0]!.message, messageId);
      assert.notProperty(notifications[0]!, "dingwords");
      assert.isTrue(notifications[0]!.mentioned);
    });

    it("records both when a mention and a dingword ding the same user", async function () {
      await send({
        type: "message",
        children: [{ type: "mention", userId: dingedId }, { text: " foo" }],
      });

      const notifications = await notificationsFor(dingedId);
      assert.lengthOf(notifications, 1);
      assert.deepEqual(notifications[0]!.dingwords, ["foo"]);
      assert.isTrue(notifications[0]!.mentioned);
    });

    it("leaves out dingwords muted on the puzzle", async function () {
      await setSuppressed(dingedId, { [huntId]: { [puzzleId]: ["foo"] } });

      await send(text("foo"));
      assert.isEmpty(await notificationsFor(dingedId));

      await send(text("foo bar"));
      const partial = await notificationsFor(dingedId);
      assert.lengthOf(partial, 1);
      assert.deepEqual(partial[0]!.dingwords, ["bar"]);

      await send(text("foo"), otherPuzzleId);
      assert.lengthOf(
        await notificationsFor(dingedId),
        2,
        "A mute only applies to its own puzzle",
      );
    });

    it("mutes every dingword on the puzzle with the sentinel but still passes on mentions", async function () {
      await setSuppressed(dingedId, {
        [huntId]: { [puzzleId]: [SUPPRESS_ALL_DINGWORDS] },
      });

      await send(text("foo bar"));
      assert.isEmpty(await notificationsFor(dingedId));

      await send(mentionOf(dingedId));
      const notifications = await notificationsFor(dingedId);
      assert.lengthOf(notifications, 1);
      assert.notProperty(notifications[0]!, "dingwords");
    });
  });
});
