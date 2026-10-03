import { Accounts } from "meteor/accounts-base";
import { DDP } from "meteor/ddp";
import { Random } from "meteor/random";
import { assert } from "chai";
import { ACTIVITY_COLLECTION } from "../../../../imports/lib/config/activityTracking";
import isReaction from "../../../../imports/lib/isReaction";
import type { ChatMessageContentType } from "../../../../imports/lib/models/ChatMessages";
import ChatMessages from "../../../../imports/lib/models/ChatMessages";
import ChatNotifications from "../../../../imports/lib/models/ChatNotifications";
import Hunts from "../../../../imports/lib/models/Hunts";
import MeteorUsers from "../../../../imports/lib/models/MeteorUsers";
import Puzzles from "../../../../imports/lib/models/Puzzles";
import removeChatMessage from "../../../../imports/methods/removeChatMessage";
import sendChatMessage from "../../../../imports/methods/sendChatMessage";
import resetDatabase from "../../../lib/resetDatabase";
import StubSubscription, {
  publishHandler,
} from "../../../lib/StubSubscription";

const text = (body: string): ChatMessageContentType => ({
  type: "message",
  children: [{ text: body }],
});

describe("chat reactions", function () {
  this.timeout(30000);

  let huntId: string;
  let memberId: string;
  let reactorId: string;
  let dingedId: string;
  let puzzleId: string;

  const asUser = <T>(userId: string, fn: () => Promise<T>) =>
    DDP._CurrentMethodInvocation.withValue({ userId }, fn);

  const send = (userId: string, content: ChatMessageContentType) =>
    asUser(userId, () =>
      sendChatMessage.callPromise({
        puzzleId,
        content: JSON.stringify(content),
      }),
    );
  const react = (userId: string, parentId: string, emoji: string) =>
    asUser(userId, () =>
      sendChatMessage.callPromise({
        puzzleId,
        content: JSON.stringify(text(emoji)),
        parentId,
      }),
    );
  const remove = (userId: string, messageId: string) =>
    asUser(userId, () => removeChatMessage.callPromise({ messageId }));

  const messagesOn = (puzzle: string) =>
    ChatMessages.find({ puzzle }, { sort: { timestamp: 1 } }).fetchAsync();

  this.beforeAll(async function () {
    await resetDatabase("chat reactions");
    memberId = await Accounts.createUserAsync({
      email: "member@example.com",
      password: "password",
    });
    reactorId = await Accounts.createUserAsync({
      email: "reactor@example.com",
      password: "password",
    });
    dingedId = await Accounts.createUserAsync({
      email: "dinged@example.com",
      password: "password",
    });
    huntId = await asUser(memberId, () =>
      Hunts.insertAsync({
        name: "Reaction hunt",
        mailingLists: [],
        openSignups: false,
        hasGuessQueue: true,
        defaultRoles: [],
        allowUnlockablePuzzles: false,
        isArchived: false,
        customLinkEmbed: false,
      }),
    );
    for (const userId of [memberId, reactorId]) {
      await MeteorUsers.updateAsync(userId, {
        $set: { displayName: userId, hunts: [huntId] },
      });
    }
    // An emoji makes a fine dingword, which is how a reaction would ding
    // someone if the hooks didn't leave reactions alone
    await MeteorUsers.updateAsync(dingedId, {
      $set: { displayName: "Dinged", hunts: [huntId], dingwords: ["🔥"] },
    });
    puzzleId = await asUser(memberId, () =>
      Puzzles.insertAsync({
        hunt: huntId,
        title: "Reactive",
        tags: [],
        answers: [],
        expectedAnswerCount: 1,
      }),
    );
  });

  this.beforeEach(async function () {
    await ChatMessages.collection.rawCollection().deleteMany({});
    await ChatNotifications.collection.rawCollection().deleteMany({});
  });

  it("stores a reaction as a reply holding only the emoji", async function () {
    await send(memberId, text("Solved it!"));
    const [parent] = await messagesOn(puzzleId);
    await react(reactorId, parent!._id, "🎉");

    const messages = await messagesOn(puzzleId);
    assert.lengthOf(messages, 2);
    const reaction = messages[1]!;
    assert.equal(reaction.parentId, parent!._id);
    assert.equal(reaction.sender, reactorId);
    assert.isTrue(isReaction(reaction));
    assert.isFalse(isReaction(parent!));
  });

  it("lets the reactor take their own reaction back", async function () {
    await send(memberId, text("Solved it!"));
    const [parent] = await messagesOn(puzzleId);
    await react(reactorId, parent!._id, "🎉");
    const reaction = (await messagesOn(puzzleId))[1]!;

    await remove(reactorId, reaction._id);
    assert.isUndefined(await ChatMessages.findOneAsync(reaction._id));
    assert.lengthOf(await messagesOn(puzzleId), 1);
  });

  it("keeps one reaction per emoji per user", async function () {
    await send(memberId, text("Solved it!"));
    const [parent] = await messagesOn(puzzleId);
    await react(reactorId, parent!._id, "🎉");
    await react(reactorId, parent!._id, "🎉");
    assert.lengthOf(
      await messagesOn(puzzleId),
      2,
      "Reacting again with the same emoji adds nothing",
    );

    await react(reactorId, parent!._id, "🔥");
    await react(memberId, parent!._id, "🎉");
    assert.lengthOf(
      await messagesOn(puzzleId),
      4,
      "Another emoji, or another user, is a new reaction",
    );
  });

  it("refuses to remove someone else's reaction", async function () {
    await send(memberId, text("Solved it!"));
    const [parent] = await messagesOn(puzzleId);
    await react(reactorId, parent!._id, "🎉");
    const reaction = (await messagesOn(puzzleId))[1]!;

    // Someone else's message answers the same as an unknown one
    await assert.isRejected(remove(memberId, reaction._id), /Unknown message/);
    assert.isDefined(await ChatMessages.findOneAsync(reaction._id));
  });

  it("refuses to remove an ordinary message, even your own", async function () {
    await send(memberId, text("Solved it!"));
    const [message] = await messagesOn(puzzleId);
    await react(memberId, message!._id, "🎉");
    const [, reaction] = await messagesOn(puzzleId);

    await assert.isRejected(remove(memberId, message!._id), /Only reactions/);
    assert.isDefined(await ChatMessages.findOneAsync(message!._id));
    // A reply that isn't just an emoji isn't a reaction either
    await asUser(memberId, () =>
      sendChatMessage.callPromise({
        puzzleId,
        content: JSON.stringify(text("🎉 indeed")),
        parentId: message!._id,
      }),
    );
    const reply = (await messagesOn(puzzleId))[2]!;
    assert.isFalse(isReaction(reply));
    await assert.isRejected(remove(memberId, reply._id), /Only reactions/);
    await remove(memberId, reaction!._id);
  });

  it("refuses an unknown message", async function () {
    await assert.isRejected(remove(memberId, Random.id()), /Unknown message/);
  });

  it("does not count as chat activity on the puzzle list", async function () {
    await send(memberId, text("Solved it!"));
    const [parent] = await messagesOn(puzzleId);
    await react(reactorId, parent!._id, "🎉");

    const sub = new StubSubscription(memberId);
    try {
      await publishHandler("PuzzleActivity.publications.forHunt").call(sub, {
        huntId,
      });
      // The two writes may straddle an activity bucket boundary, so count
      // across every bucket the puzzle has
      const buckets = [...sub.published(ACTIVITY_COLLECTION).values()].filter(
        (bucket) => bucket.puzzle === puzzleId,
      );
      assert.isNotEmpty(buckets);
      assert.equal(
        buckets.reduce((sum, bucket) => sum + bucket.chatUsers, 0),
        1,
        "Only the message counts as someone chatting",
      );
      assert.equal(
        buckets.reduce((sum, bucket) => sum + bucket.totalUsers, 0),
        1,
      );
    } finally {
      sub.stop();
    }
  });

  it("does not ding anyone for a reaction", async function () {
    await send(memberId, text("🔥 take"));
    const [parent] = await messagesOn(puzzleId);
    assert.lengthOf(
      await ChatNotifications.find({ user: dingedId }).fetchAsync(),
      1,
      "A message that says the dingword dings",
    );

    await react(reactorId, parent!._id, "🔥");
    assert.lengthOf(
      await ChatNotifications.find({ user: dingedId }).fetchAsync(),
      1,
      "A reaction that is the dingword does not",
    );
  });
});
