import { Accounts } from "meteor/accounts-base";
import { Random } from "meteor/random";
import { assert } from "chai";
import type { ChatMessageContentType } from "../../../../imports/lib/models/ChatMessages";
import ChatMessages from "../../../../imports/lib/models/ChatMessages";
import MeteorUsers from "../../../../imports/lib/models/MeteorUsers";
import Puzzles from "../../../../imports/lib/models/Puzzles";
import sendChatMessage from "../../../../imports/methods/sendChatMessage";
import setChatMessagePin from "../../../../imports/methods/setChatMessagePin";
import asUser from "../../../lib/asUser";
import createTestHunt from "../../../lib/createTestHunt";
import resetDatabase from "../../../lib/resetDatabase";

const text = (body: string): ChatMessageContentType => ({
  type: "message",
  children: [{ text: body }],
});

describe("pinned chat messages", function () {
  this.timeout(30000);

  let huntId: string;
  let memberId: string;
  let otherMemberId: string;
  let outsiderId: string;
  let puzzleId: string;
  let otherPuzzleId: string;

  const send = (
    userId: string,
    content: ChatMessageContentType,
    puzzle = puzzleId,
  ) =>
    asUser(userId, () =>
      sendChatMessage.callPromise({
        puzzleId: puzzle,
        content: JSON.stringify(content),
      }),
    );

  const messagesOn = (puzzle: string) =>
    ChatMessages.find({ puzzle }, { sort: { timestamp: 1 } }).fetchAsync();
  const pinnedOn = (puzzle: string) =>
    ChatMessages.find({ puzzle, pinTs: { $exists: true } }).fetchAsync();

  this.beforeAll(async function () {
    await resetDatabase("pinned chat messages");
    memberId = await Accounts.createUserAsync({
      email: "member@example.com",
      password: "password",
    });
    otherMemberId = await Accounts.createUserAsync({
      email: "other@example.com",
      password: "password",
    });
    outsiderId = await Accounts.createUserAsync({
      email: "outsider@example.com",
      password: "password",
    });
    huntId = await createTestHunt(memberId, { name: "Pin hunt" });
    for (const userId of [memberId, otherMemberId]) {
      await MeteorUsers.updateAsync(userId, {
        $set: { displayName: userId, hunts: [huntId] },
      });
    }
    await MeteorUsers.updateAsync(outsiderId, {
      $set: { displayName: "Outsider", hunts: [] },
    });
    const newPuzzle = (title: string) =>
      asUser(memberId, () =>
        Puzzles.insertAsync({
          hunt: huntId,
          title,
          tags: [],
          answers: [],
          expectedAnswerCount: 1,
        }),
      );
    puzzleId = await newPuzzle("Pinboard");
    otherPuzzleId = await newPuzzle("Corkboard");
  });

  this.beforeEach(async function () {
    await ChatMessages.collection.rawCollection().deleteMany({});
  });

  it("pins a message sent with /pin and drops the command", async function () {
    const before = new Date();
    await send(memberId, text("/pin Remember the metas"));

    const messages = await messagesOn(puzzleId);
    assert.lengthOf(messages, 1);
    const message = messages[0]!;
    assert.deepEqual(message.content, text("Remember the metas"));
    assert.instanceOf(message.pinTs, Date);
    assert.isAtLeast(message.pinTs.getTime(), before.getTime());
  });

  it("reads the command however it is capitalised or spaced", async function () {
    await send(memberId, text("  /PIN   Shout "));
    const [message] = await messagesOn(puzzleId);
    assert.deepEqual(message!.content, text("Shout "));
    assert.instanceOf(message!.pinTs, Date);
  });

  it("pins a message whose command is followed by something other than text", async function () {
    await send(memberId, {
      type: "message",
      children: [{ text: "/pin " }, { type: "mention", userId: otherMemberId }],
    });
    const [message] = await messagesOn(puzzleId);
    assert.deepEqual(message!.content.children, [
      { type: "mention", userId: otherMemberId },
    ]);
    assert.instanceOf(message!.pinTs, Date);
  });

  it("clears every pin on the puzzle for a bare /pin or /unpin, sending nothing", async function () {
    await send(memberId, text("/pin one"));
    await send(otherMemberId, text("/pin two"));
    await send(memberId, text("/pin elsewhere"), otherPuzzleId);
    assert.lengthOf(await pinnedOn(puzzleId), 2);

    await send(memberId, text("/unpin"));
    assert.isEmpty(await pinnedOn(puzzleId));
    assert.lengthOf(
      await messagesOn(puzzleId),
      2,
      "The command itself is not a message",
    );
    assert.lengthOf(
      await pinnedOn(otherPuzzleId),
      1,
      "Other puzzles keep their pins",
    );

    await send(memberId, text("/pin three"));
    await send(memberId, text(" /pin "));
    assert.isEmpty(await pinnedOn(puzzleId));
    assert.lengthOf(await messagesOn(puzzleId), 3);
  });

  it("only lets members clear pins", async function () {
    await send(memberId, text("/pin one"));
    await assert.isRejected(send(outsiderId, text("/unpin")), /not a member/);
    assert.lengthOf(await pinnedOn(puzzleId), 1);
  });

  it("never pins a reaction", async function () {
    await send(memberId, text("plain"));
    const [message] = await messagesOn(puzzleId);

    // "/pin" on a reply that is only an emoji makes a reaction, not a pin
    await asUser(otherMemberId, () =>
      sendChatMessage.callPromise({
        puzzleId,
        content: JSON.stringify(text("/pin 👍")),
        parentId: message!._id,
      }),
    );
    const [, reaction] = await messagesOn(puzzleId);
    assert.equal(reaction!.parentId, message!._id);
    assert.deepEqual(reaction!.content, text("👍"));
    assert.notProperty(reaction, "pinTs");

    await assert.isRejected(
      asUser(memberId, () =>
        setChatMessagePin.callPromise({
          messageId: reaction!._id,
          pinned: true,
        }),
      ),
      /can't be pinned/,
    );
    assert.notProperty(await ChatMessages.findOneAsync(reaction!._id), "pinTs");
  });

  it("lets any member pin and unpin a message", async function () {
    await send(memberId, text("plain"));
    const [message] = await messagesOn(puzzleId);

    await asUser(otherMemberId, () =>
      setChatMessagePin.callPromise({ messageId: message!._id, pinned: true }),
    );
    assert.instanceOf(
      (await ChatMessages.findOneAsync(message!._id))?.pinTs,
      Date,
    );

    await asUser(memberId, () =>
      setChatMessagePin.callPromise({ messageId: message!._id, pinned: false }),
    );
    assert.notProperty(await ChatMessages.findOneAsync(message!._id), "pinTs");
  });

  it("refuses a non-member and an unknown message", async function () {
    await send(memberId, text("plain"));
    const [message] = await messagesOn(puzzleId);

    // A message in a hunt the caller isn't in answers the same as an unknown
    // one
    await assert.isRejected(
      asUser(outsiderId, () =>
        setChatMessagePin.callPromise({
          messageId: message!._id,
          pinned: true,
        }),
      ),
      /Unknown message/,
    );
    assert.notProperty(await ChatMessages.findOneAsync(message!._id), "pinTs");
    await assert.isRejected(
      asUser(memberId, () =>
        setChatMessagePin.callPromise({ messageId: Random.id(), pinned: true }),
      ),
      /Unknown message/,
    );
  });
});
