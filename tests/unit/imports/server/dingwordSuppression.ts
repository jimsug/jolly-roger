import { Accounts } from "meteor/accounts-base";
import { DDP } from "meteor/ddp";
import { Random } from "meteor/random";
import { assert } from "chai";
import { SUPPRESS_ALL_DINGWORDS } from "../../../../imports/lib/dingwordLogic";
import type { ChatMessageContentType } from "../../../../imports/lib/models/ChatMessages";
import ChatMessages from "../../../../imports/lib/models/ChatMessages";
import ChatNotifications from "../../../../imports/lib/models/ChatNotifications";
import Hunts from "../../../../imports/lib/models/Hunts";
import MeteorUsers from "../../../../imports/lib/models/MeteorUsers";
import Puzzles from "../../../../imports/lib/models/Puzzles";
import dismissAllDingsForPuzzle from "../../../../imports/methods/dismissAllDingsForPuzzle";
import suppressDingwordsForPuzzle from "../../../../imports/methods/suppressDingwordsForPuzzle";
import ChatNotificationHooks from "../../../../imports/server/hooks/ChatNotificationHooks";
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
  let otherHuntPuzzleId: string;

  const asUser = <T>(userId: string, fn: () => Promise<T>) =>
    DDP._CurrentMethodInvocation.withValue({ userId }, fn);

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
    const newHunt = (name: string) =>
      asUser(senderId, () =>
        Hunts.insertAsync({
          name,
          mailingLists: [],
          openSignups: false,
          hasGuessQueue: true,
          defaultRoles: [],
          allowUnlockablePuzzles: false,
          isArchived: false,
          customLinkEmbed: false,
        }),
      );
    huntId = await newHunt("Dingword hunt");
    otherHuntId = await newHunt("Other hunt");
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
    otherHuntPuzzleId = await newPuzzle(otherHuntId, "Elsewhere");
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

  describe("suppressDingwordsForPuzzle", function () {
    const suppress = (
      dingword: string | undefined,
      dismissUntil = new Date(),
    ) =>
      asUser(dingedId, () =>
        suppressDingwordsForPuzzle.callPromise({
          hunt: huntId,
          puzzle: puzzleId,
          ...(dingword === undefined ? {} : { dingword }),
          dismissUntil,
        }),
      );

    it("mutes the word and clears the notifications it alone caused", async function () {
      await send(text("foo"));
      await send(text("foo and bar"));
      await send(mentionOf(dingedId));
      await send(text("foo"), otherPuzzleId);
      assert.lengthOf(await notificationsFor(dingedId), 4);

      await suppress("foo");

      const user = await MeteorUsers.findOneAsync(dingedId);
      assert.deepEqual(user?.suppressedDingwords, {
        [huntId]: { [puzzleId]: ["foo"] },
      });
      const remaining = await notificationsFor(dingedId);
      assert.sameMembers(
        remaining.map((cn) => `${cn.puzzle}:${cn.dingwords?.join(",") ?? ""}`),
        [`${puzzleId}:foo,bar`, `${puzzleId}:`, `${otherPuzzleId}:foo`],
        "Only the notification where every matched word is muted goes",
      );

      await suppress("bar");
      const afterBoth = await notificationsFor(dingedId);
      assert.sameMembers(
        afterBoth.map((cn) => `${cn.puzzle}:${cn.dingwords?.join(",") ?? ""}`),
        [`${puzzleId}:`, `${otherPuzzleId}:foo`],
      );
      assert.sameMembers(
        (await MeteorUsers.findOneAsync(dingedId))?.suppressedDingwords?.[
          huntId
        ]?.[puzzleId] ?? [],
        ["foo", "bar"],
      );
    });

    it("mutes everything with no word but keeps notifications from mentions", async function () {
      await send(text("foo"));
      await send(text("bar"));
      await send(mentionOf(dingedId));
      await send(text("foo"), otherPuzzleId);

      await suppress(undefined);

      const user = await MeteorUsers.findOneAsync(dingedId);
      assert.deepEqual(user?.suppressedDingwords?.[huntId]?.[puzzleId], [
        SUPPRESS_ALL_DINGWORDS,
      ]);
      const remaining = await notificationsFor(dingedId);
      assert.sameMembers(
        remaining.map((cn) => `${cn.puzzle}:${cn.dingwords?.join(",") ?? ""}`),
        [`${puzzleId}:`, `${otherPuzzleId}:foo`],
      );
    });

    it("clears a dingword notification on a message that mentioned a role the user only holds by default", async function () {
      // With "operator" as a default role, the hook still only role-notifies
      // explicit operators, so this notification exists for the dingword
      // alone and the mute must clear it
      await Hunts.updateAsync(huntId, { $set: { defaultRoles: ["operator"] } });
      try {
        await send({
          type: "message",
          children: [
            { type: "role-mention", roleId: "operator" },
            { text: " foo" },
          ],
        });
        const notifications = await notificationsFor(dingedId);
        assert.lengthOf(notifications, 1);
        assert.deepEqual(notifications[0]!.dingwords, ["foo"]);
        assert.isFalse(notifications[0]!.mentioned);

        await suppress("foo");
        assert.isEmpty(await notificationsFor(dingedId));
      } finally {
        await Hunts.updateAsync(huntId, { $set: { defaultRoles: [] } });
      }
    });

    it("keeps a notification from before the hook recorded mentions if its content mentions the user", async function () {
      await send(mentionOf(dingedId));
      await send(text("foo"));
      await ChatNotifications.collection
        .rawCollection()
        .updateMany({ user: dingedId }, { $unset: { mentioned: "" } });

      await suppress(undefined);

      const remaining = await notificationsFor(dingedId);
      assert.lengthOf(remaining, 1);
      assert.notProperty(remaining[0]!, "dingwords");
    });

    it("only clears notifications from before dismissUntil", async function () {
      await send(text("foo"));
      await suppress("foo", new Date(Date.now() - 60 * 1000));

      assert.lengthOf(await notificationsFor(dingedId), 1);
      assert.deepEqual(
        (await MeteorUsers.findOneAsync(dingedId))?.suppressedDingwords?.[
          huntId
        ]?.[puzzleId],
        ["foo"],
      );
    });

    it("rejects callers who aren't logged in or aren't members", async function () {
      await assert.isRejected(
        suppressDingwordsForPuzzle.callPromise({
          hunt: huntId,
          puzzle: puzzleId,
          dingword: "foo",
          dismissUntil: new Date(),
        }),
        /Expected string/,
      );
      await assert.isRejected(
        asUser(outsiderId, () =>
          suppressDingwordsForPuzzle.callPromise({
            hunt: huntId,
            puzzle: puzzleId,
            dingword: "foo",
            dismissUntil: new Date(),
          }),
        ),
        /not a member/,
      );
      assert.isUndefined(
        (await MeteorUsers.findOneAsync(outsiderId))?.suppressedDingwords,
      );
    });

    it("rejects ids that don't exist or don't belong together", async function () {
      await assert.isRejected(
        asUser(dingedId, () =>
          suppressDingwordsForPuzzle.callPromise({
            hunt: huntId,
            puzzle: otherHuntPuzzleId,
            dismissUntil: new Date(),
          }),
        ),
        /Unknown puzzle/,
      );
      await assert.isRejected(
        asUser(dingedId, () =>
          suppressDingwordsForPuzzle.callPromise({
            hunt: Random.id(),
            puzzle: puzzleId,
            dismissUntil: new Date(),
          }),
        ),
        /Unknown hunt/,
      );
      await assert.isRejected(suppress("   "), /blank/);
      assert.isUndefined(
        (await MeteorUsers.findOneAsync(dingedId))?.suppressedDingwords,
      );
    });
  });

  describe("dismissAllDingsForPuzzle", function () {
    it("clears the caller's notifications for the puzzle and nothing else", async function () {
      await send(text("foo"));
      await send(mentionOf(dingedId));
      await send(text("bar"), otherPuzzleId);
      await send(mentionOf(mentionedId));

      await asUser(dingedId, () =>
        dismissAllDingsForPuzzle.callPromise({
          hunt: huntId,
          puzzle: puzzleId,
          dismissUntil: new Date(),
        }),
      );

      const remaining = await notificationsFor(dingedId);
      assert.lengthOf(remaining, 1);
      assert.equal(remaining[0]!.puzzle, otherPuzzleId);
      assert.lengthOf(
        await notificationsFor(mentionedId),
        1,
        "Other users' notifications stay",
      );
    });

    it("rejects callers who aren't logged in or aren't members, and mismatched ids", async function () {
      await send(text("foo"));
      await assert.isRejected(
        dismissAllDingsForPuzzle.callPromise({
          hunt: huntId,
          puzzle: puzzleId,
          dismissUntil: new Date(),
        }),
        /Expected string/,
      );
      await assert.isRejected(
        asUser(outsiderId, () =>
          dismissAllDingsForPuzzle.callPromise({
            hunt: huntId,
            puzzle: puzzleId,
            dismissUntil: new Date(),
          }),
        ),
        /not a member/,
      );
      await assert.isRejected(
        asUser(dingedId, () =>
          dismissAllDingsForPuzzle.callPromise({
            hunt: otherHuntId,
            puzzle: puzzleId,
            dismissUntil: new Date(),
          }),
        ),
        /Unknown puzzle/,
      );
      assert.lengthOf(await notificationsFor(dingedId), 1);
    });
  });
});
