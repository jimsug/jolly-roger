import { Accounts } from "meteor/accounts-base";
import { DDP } from "meteor/ddp";
import { Random } from "meteor/random";
import { assert } from "chai";
import type { ChatMessageContentType } from "../../../../imports/lib/models/ChatMessages";
import ChatMessages, {
  contentFromMessage,
} from "../../../../imports/lib/models/ChatMessages";
import Hunts from "../../../../imports/lib/models/Hunts";
import MeteorUsers from "../../../../imports/lib/models/MeteorUsers";
import Puzzles from "../../../../imports/lib/models/Puzzles";
import nodeIsText from "../../../../imports/lib/nodeIsText";
import sendChatMessage from "../../../../imports/methods/sendChatMessage";
import sendChatMessageInternal from "../../../../imports/server/sendChatMessageInternal";
import resetDatabase from "../../../lib/resetDatabase";

const text = (body: string): ChatMessageContentType => ({
  type: "message",
  children: [{ text: body }],
});

describe("sendChatMessage", function () {
  this.timeout(30000);

  let huntId: string;
  let otherHuntId: string;
  let memberId: string;
  let outsiderId: string;
  let puzzleId: string;
  let otherPuzzleId: string;
  let otherHuntPuzzleId: string;

  const asUser = <T>(userId: string, fn: () => Promise<T>) =>
    DDP._CurrentMethodInvocation.withValue({ userId }, fn);

  const send = (
    userId: string,
    content: ChatMessageContentType,
    extra: { puzzleId?: string; parentId?: string } = {},
  ) =>
    asUser(userId, () =>
      sendChatMessage.callPromise({
        puzzleId: extra.puzzleId ?? puzzleId,
        content: JSON.stringify(content),
        ...(extra.parentId ? { parentId: extra.parentId } : {}),
      }),
    );

  const messagesOn = (puzzle: string) =>
    ChatMessages.find({ puzzle }, { sort: { timestamp: 1 } }).fetchAsync();

  this.beforeAll(async function () {
    await resetDatabase("sendChatMessage");
    memberId = await Accounts.createUserAsync({
      email: "member@example.com",
      password: "password",
    });
    outsiderId = await Accounts.createUserAsync({
      email: "outsider@example.com",
      password: "password",
    });
    const newHunt = (name: string) =>
      asUser(memberId, () =>
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
    huntId = await newHunt("Chat hunt");
    otherHuntId = await newHunt("Other hunt");
    await MeteorUsers.updateAsync(memberId, {
      $set: { displayName: "Member", hunts: [huntId] },
    });
    await MeteorUsers.updateAsync(outsiderId, {
      $set: { displayName: "Outsider", hunts: [otherHuntId] },
    });
    const newPuzzle = (hunt: string, title: string) =>
      asUser(memberId, () =>
        Puzzles.insertAsync({
          hunt,
          title,
          tags: [],
          answers: [],
          expectedAnswerCount: 1,
        }),
      );
    puzzleId = await newPuzzle(huntId, "Chatty");
    otherPuzzleId = await newPuzzle(huntId, "Quiet");
    otherHuntPuzzleId = await newPuzzle(otherHuntId, "Elsewhere");
  });

  this.beforeEach(async function () {
    await ChatMessages.collection.rawCollection().deleteMany({});
  });

  it("stores a member's message on the puzzle", async function () {
    await send(memberId, text("hello"));

    const messages = await messagesOn(puzzleId);
    assert.lengthOf(messages, 1);
    const message = messages[0]!;
    assert.equal(message.hunt, huntId);
    assert.equal(message.sender, memberId);
    assert.deepEqual(message.content, text("hello"));
    assert.notProperty(message, "pinTs");
    assert.notProperty(message, "parentId");
  });

  it("rejects a sender who is not in the hunt", async function () {
    await assert.isRejected(send(outsiderId, text("hello")), /not a member/);
    await assert.isRejected(
      send(outsiderId, text("hello"), { puzzleId: otherPuzzleId }),
      /not a member/,
    );
    assert.isEmpty(await messagesOn(puzzleId));
    assert.isEmpty(await messagesOn(otherPuzzleId));
  });

  it("still lets the server post system messages", async function () {
    // The membership check goes on the sender, not on whoever's method the
    // server is posting from
    await asUser(outsiderId, () =>
      sendChatMessageInternal({
        puzzleId,
        content: contentFromMessage("Guess was marked correct"),
        sender: undefined,
      }),
    );
    const messages = await messagesOn(puzzleId);
    assert.lengthOf(messages, 1);
    assert.isUndefined(messages[0]!.sender);
  });

  it("accepts a reply to a message on the same puzzle", async function () {
    await send(memberId, text("question"));
    const [parent] = await messagesOn(puzzleId);
    await send(memberId, text("answer"), { parentId: parent!._id });

    const messages = await messagesOn(puzzleId);
    assert.lengthOf(messages, 2);
    assert.equal(messages[1]!.parentId, parent!._id);
  });

  it("rejects a reply to a message elsewhere, or to none", async function () {
    await send(memberId, text("question"), { puzzleId: otherPuzzleId });
    const [parent] = await messagesOn(otherPuzzleId);
    await assert.isRejected(
      send(memberId, text("answer"), { parentId: parent!._id }),
      /not on puzzle/,
    );
    await assert.isRejected(
      send(memberId, text("answer"), { parentId: Random.id() }),
      /not on puzzle/,
    );
    assert.isEmpty(await messagesOn(puzzleId));
  });

  it("accepts a link to a puzzle in the hunt", async function () {
    const content: ChatMessageContentType = {
      type: "message",
      children: [{ text: "see " }, { type: "puzzle", puzzleId: otherPuzzleId }],
    };
    await send(memberId, content);

    const messages = await messagesOn(puzzleId);
    assert.lengthOf(messages, 1);
    assert.deepEqual(messages[0]!.content, content);
  });

  it("rejects a link to a puzzle in another hunt, or an unknown one", async function () {
    const linkTo = (id: string): ChatMessageContentType => ({
      type: "message",
      children: [{ type: "puzzle", puzzleId: id }],
    });
    await assert.isRejected(
      send(memberId, linkTo(otherHuntPuzzleId)),
      /not in hunt/,
    );
    await assert.isRejected(send(memberId, linkTo(Random.id())), /not in hunt/);
    assert.isEmpty(await messagesOn(puzzleId));
  });

  it("rejects content it doesn't know how to render", async function () {
    await assert.isRejected(
      send(memberId, {
        type: "message",
        children: [{ type: "attachment", url: "https://example.com/x" }],
      } as unknown as ChatMessageContentType),
      /Match error/,
    );
    assert.isEmpty(await messagesOn(puzzleId));
  });

  it("keeps the text of an ordinary message as sent", async function () {
    await send(memberId, text("  /pinned to the wall "));
    const [message] = await messagesOn(puzzleId);
    const child = message!.content.children[0]!;
    assert.isTrue(nodeIsText(child));
    assert.equal(nodeIsText(child) ? child.text : "", "  /pinned to the wall ");
    assert.notProperty(message, "pinTs");
  });
});
