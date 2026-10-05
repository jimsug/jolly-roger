import { Accounts } from "meteor/accounts-base";
import { assert } from "chai";
import sinon from "sinon";
import FixtureHunt from "../../../../imports/FixtureHunt";
import type { ChatMessageContentType } from "../../../../imports/lib/models/ChatMessages";
import ChatMessages, {
  contentFromMessage,
} from "../../../../imports/lib/models/ChatMessages";
import ChatNotifications from "../../../../imports/lib/models/ChatNotifications";
import Hunts from "../../../../imports/lib/models/Hunts";
import MeteorUsers from "../../../../imports/lib/models/MeteorUsers";
import Whiteboards from "../../../../imports/lib/models/Whiteboards";
import deleteChatMessage from "../../../../imports/methods/deleteChatMessage";
import deleteWhiteboardComment from "../../../../imports/methods/deleteWhiteboardComment";
import editChatMessage from "../../../../imports/methods/editChatMessage";
import type { CommentAnchorInput } from "../../../../imports/methods/sendChatMessage";
import sendChatMessage from "../../../../imports/methods/sendChatMessage";
import setChatMessagePin from "../../../../imports/methods/setChatMessagePin";
import GlobalHooks from "../../../../imports/server/GlobalHooks";
import makeFixtureHunt from "../../../../imports/server/makeFixtureHunt";
import sendChatMessageInternal from "../../../../imports/server/sendChatMessageInternal";
import { ensureWhiteboard } from "../../../../imports/server/whiteboard";
import asUser from "../../../lib/asUser";
import resetDatabase from "../../../lib/resetDatabase";

const huntId = FixtureHunt._id;
const puzzleId = FixtureHunt.puzzles[0]!._id;

async function makeUser(email: string, roles: string[], dingwords?: string[]) {
  const userId = await Accounts.createUserAsync({
    email,
    password: "password",
  });
  await MeteorUsers.updateAsync(userId, {
    $set: {
      displayName: email,
      hunts: [huntId],
      roles: { [huntId]: roles },
      ...(dingwords ? { dingwords } : {}),
    },
  });
  return userId;
}

describe("editing and deleting chat messages", function () {
  this.timeout(30000);

  let operator: string;
  let sender: string;
  let other: string;
  let dinged: string;
  let backingId: string;

  before(async function () {
    await resetDatabase("editing and deleting chat messages");
    operator = await makeUser("operator@example.com", ["operator"]);
    sender = await makeUser("sender@example.com", []);
    other = await makeUser("other@example.com", []);
    dinged = await makeUser("dinged@example.com", [], ["crossword"]);
    await makeFixtureHunt(operator);
    const boardId = await ensureWhiteboard(operator, huntId);
    backingId = (await Whiteboards.findOneAsync(boardId))!.puzzle;
  });

  beforeEach(async function () {
    await ChatMessages.collection.rawCollection().deleteMany({});
    await ChatNotifications.collection.rawCollection().deleteMany({});
    await Hunts.updateAsync(huntId, { $set: { isArchived: false } });
    await MeteorUsers.updateAsync(sender, { $set: { hunts: [huntId] } });
  });

  // Sends a message and returns it. Texts must be unique within a test.
  const send = async (
    userId: string,
    text: string,
    {
      puzzle = puzzleId,
      ...rest
    }: {
      puzzle?: string;
      parentId?: string;
      comment?: CommentAnchorInput;
    } = {},
  ) => {
    await asUser(userId, () =>
      sendChatMessage.callPromise({
        puzzleId: puzzle,
        content: JSON.stringify(contentFromMessage(text)),
        ...rest,
      }),
    );
    return (await ChatMessages.findOneAsync({
      puzzle,
      "content.children.text": text,
    }))!;
  };
  const edit = (
    userId: string,
    messageId: string,
    content: ChatMessageContentType,
  ) =>
    asUser(userId, () =>
      editChatMessage.callPromise({
        messageId,
        content: JSON.stringify(content),
      }),
    );
  const remove = (userId: string, messageId: string) =>
    asUser(userId, () => deleteChatMessage.callPromise({ messageId }));
  const reload = async (id: string) =>
    (await ChatMessages.findOneAllowingDeletedAsync(id))!;
  const comment = (userId: string, text: string) =>
    send(userId, text, { puzzle: backingId, comment: { x: 10, y: 20 } });

  // Takes the sender out of the hunt, as an operator removing them would
  const leaveHunt = () =>
    MeteorUsers.updateAsync(sender, { $set: { hunts: [] } });

  describe("edit", function () {
    it("changes the content and keeps the reply, pin and thread", async function () {
      const root = await comment(sender, "a comment");
      const reply = await send(sender, "frist", {
        puzzle: backingId,
        parentId: root._id,
      });
      await asUser(sender, () =>
        setChatMessagePin.callPromise({ messageId: reply._id, pinned: true }),
      );
      const pinned = await reload(reply._id);

      await edit(sender, reply._id, contentFromMessage("first"));
      const edited = await reload(reply._id);
      assert.deepEqual(edited.content, contentFromMessage("first"));
      assert.equal(edited.parentId, root._id);
      assert.equal(edited.thread, root._id);
      assert.deepEqual(edited.pinTs, pinned.pinTs);
      assert.instanceOf(edited.editedAt, Date);
      assert.deepEqual(edited.timestamp, reply.timestamp);
    });

    it("keeps a comment's pin on the board", async function () {
      const root = await comment(sender, "on the board");
      await edit(sender, root._id, contentFromMessage("still on the board"));
      const edited = await reload(root._id);
      assert.deepEqual(edited.comment, root.comment);
      assert.deepEqual(
        edited.content,
        contentFromMessage("still on the board"),
      );
    });

    it("refuses anyone but the sender", async function () {
      const message = await send(sender, "mine");
      await assert.isRejected(
        edit(other, message._id, contentFromMessage("yours")),
        /Unknown message/,
      );
      await assert.isRejected(
        edit(operator, message._id, contentFromMessage("theirs")),
        /Unknown message/,
      );
      assert.deepEqual((await reload(message._id)).content, message.content);
    });

    it("refuses a system message", async function () {
      await asUser(operator, () =>
        sendChatMessageInternal({
          puzzleId,
          content: contentFromMessage("from the server"),
          sender: undefined,
        }),
      );
      const system = (await ChatMessages.findOneAsync({ puzzle: puzzleId }))!;
      await assert.isRejected(
        edit(sender, system._id, contentFromMessage("from me")),
        /Unknown message/,
      );
    });

    it("refuses a reaction, or a reply turned into one", async function () {
      const parent = await send(other, "solved it");
      const reaction = await send(sender, "🎉", { parentId: parent._id });
      await assert.isRejected(
        edit(sender, reaction._id, contentFromMessage("🔥")),
        /reaction can't be edited/,
      );
      const reply = await send(sender, "nice one", { parentId: parent._id });
      await assert.isRejected(
        edit(sender, reply._id, contentFromMessage("👍")),
        /into a reaction/,
      );
    });

    it("refuses a deleted message", async function () {
      const message = await send(sender, "gone soon");
      await remove(sender, message._id);
      await assert.isRejected(
        edit(sender, message._id, contentFromMessage("back")),
        /has been deleted/,
      );
      assert.deepEqual((await reload(message._id)).content.children, []);
    });

    it("refuses content send would refuse, or nothing at all", async function () {
      const message = await send(sender, "something");
      await assert.isRejected(
        asUser(sender, () =>
          editChatMessage.callPromise({
            messageId: message._id,
            content: JSON.stringify({ type: "message", children: [{}] }),
          }),
        ),
        /Match error/,
      );
      await assert.isRejected(
        edit(sender, message._id, contentFromMessage("   ")),
        /to nothing/,
      );
      await assert.isRejected(
        edit(sender, message._id, {
          type: "message",
          children: [{ type: "puzzle", puzzleId: "notAPuzzleIdAtAll" }],
        }),
        /is not in hunt/,
      );
      assert.deepEqual((await reload(message._id)).content, message.content);
    });

    it("refuses a sender who has left the hunt", async function () {
      const message = await send(sender, "said while a member");
      await leaveHunt();
      await assert.isRejected(
        edit(sender, message._id, contentFromMessage("said after leaving")),
        /not a member/,
      );
      assert.deepEqual((await reload(message._id)).content, message.content);
    });

    it("allows an ordinary message on an archived hunt", async function () {
      const message = await send(sender, "before the archive");
      await Hunts.updateAsync(huntId, { $set: { isArchived: true } });
      await edit(sender, message._id, contentFromMessage("after the archive"));
      assert.deepEqual(
        (await reload(message._id)).content,
        contentFromMessage("after the archive"),
      );
    });

    it("refuses a comment thread on an archived hunt", async function () {
      const root = await comment(sender, "before the archive");
      await Hunts.updateAsync(huntId, { $set: { isArchived: true } });
      await assert.isRejected(
        edit(sender, root._id, contentFromMessage("after the archive")),
        /archived/,
      );
    });

    it("runs no hooks and sends no new notifications", async function () {
      const message = await send(sender, "an ordinary message");
      const hooks = sinon.spy(GlobalHooks, "runChatMessageCreatedHooks");
      try {
        await edit(sender, message._id, {
          type: "message",
          children: [
            { type: "mention", userId: other },
            { text: " is the crossword done?" },
          ],
        });
        assert.isTrue(hooks.notCalled, "Discord and the other hooks don't run");
      } finally {
        hooks.restore();
      }
      assert.equal(
        await ChatNotifications.find({}).countAsync(),
        0,
        "Neither the mention nor the dingword notifies",
      );
    });
  });

  describe("delete", function () {
    it("leaves a placeholder, keeping replies", async function () {
      const message = await send(sender, "the crossword is a trap");
      const reply = await send(other, "agreed", { parentId: message._id });
      const reaction = await send(other, "👍", { parentId: message._id });
      await asUser(other, () =>
        setChatMessagePin.callPromise({ messageId: message._id, pinned: true }),
      );
      assert.equal(
        await ChatNotifications.find({ message: message._id }).countAsync(),
        1,
        "The dingword notified",
      );

      await remove(sender, message._id);
      const deleted = await reload(message._id);
      assert.isFalse(deleted.deleted, "still published");
      assert.instanceOf(deleted.deletedAt, Date);
      assert.deepEqual(deleted.content.children, []);
      assert.isUndefined(deleted.pinTs);
      assert.equal(deleted.sender, sender);
      assert.deepEqual(deleted.timestamp, message.timestamp);
      assert.isUndefined(
        await ChatMessages.findOneAllowingDeletedAsync(reaction._id),
        "Reactions go",
      );
      const kept = await reload(reply._id);
      assert.equal(kept.parentId, message._id, "Replies stay");
      assert.deepEqual(kept.content, reply.content);
      assert.equal(
        await ChatNotifications.find({ message: message._id }).countAsync(),
        0,
        "Its notifications go",
      );
    });

    it("takes away mention and thread notifications too", async function () {
      const root = await comment(other, "a comment");
      await send(sender, "a reply that will go", {
        puzzle: backingId,
        parentId: root._id,
      });
      const reply = (await ChatMessages.findOneAsync({
        parentId: root._id,
      }))!;
      const mention = await asUser(sender, async () => {
        await sendChatMessage.callPromise({
          puzzleId,
          content: JSON.stringify({
            type: "message",
            children: [{ type: "mention", userId: other }, { text: " look" }],
          }),
        });
        return (await ChatMessages.findOneAsync({
          puzzle: puzzleId,
          sender,
        }))!;
      });
      assert.equal(
        await ChatNotifications.find({
          message: { $in: [reply._id, mention._id] },
        }).countAsync(),
        2,
      );
      await remove(sender, reply._id);
      await remove(sender, mention._id);
      assert.equal(await ChatNotifications.find({}).countAsync(), 0);
    });

    it("refuses anyone but the sender", async function () {
      const message = await send(sender, "keep this");
      await assert.isRejected(remove(other, message._id), /Unknown message/);
      await assert.isRejected(remove(operator, message._id), /Unknown message/);
      const kept = await reload(message._id);
      assert.isUndefined(kept.deletedAt);
      assert.deepEqual(kept.content, message.content);
    });

    it("refuses a reaction", async function () {
      const parent = await send(other, "something to react to");
      const reaction = await send(sender, "🎉", { parentId: parent._id });
      await assert.isRejected(
        remove(sender, reaction._id),
        /taken back, not deleted/,
      );
    });

    it("refuses a sender who has left the hunt", async function () {
      const message = await send(sender, "still here");
      await leaveHunt();
      await assert.isRejected(remove(sender, message._id), /not a member/);
      const kept = await reload(message._id);
      assert.isUndefined(kept.deletedAt);
      assert.deepEqual(kept.content, message.content);
    });

    it("allows an ordinary message on an archived hunt", async function () {
      const message = await send(sender, "archived but going");
      await Hunts.updateAsync(huntId, { $set: { isArchived: true } });
      await remove(sender, message._id);
      assert.instanceOf((await reload(message._id)).deletedAt, Date);
    });

    it("does nothing the second time", async function () {
      const message = await send(sender, "delete me twice");
      await remove(sender, message._id);
      const first = await reload(message._id);
      await remove(sender, message._id);
      assert.deepEqual((await reload(message._id)).deletedAt, first.deletedAt);
    });

    it("takes away notifications written before they named their message", async function () {
      const message = await send(sender, "an old crossword note");
      await ChatNotifications.collection
        .rawCollection()
        .updateMany({ user: dinged }, { $unset: { message: 1 } });
      assert.equal(
        await ChatNotifications.find({ user: dinged }).countAsync(),
        1,
      );

      await remove(sender, message._id);
      assert.equal(
        await ChatNotifications.find({ user: dinged }).countAsync(),
        0,
      );
    });

    it("leaves nothing to pin or react to", async function () {
      const message = await send(sender, "pin me later");
      await remove(sender, message._id);
      await assert.isRejected(
        asUser(other, () =>
          setChatMessagePin.callPromise({
            messageId: message._id,
            pinned: true,
          }),
        ),
        /has been deleted/,
      );
      await asUser(other, () =>
        setChatMessagePin.callPromise({
          messageId: message._id,
          pinned: false,
        }),
      );
      assert.isUndefined((await reload(message._id)).pinTs);

      await assert.isRejected(
        asUser(other, () =>
          sendChatMessage.callPromise({
            puzzleId,
            content: JSON.stringify(contentFromMessage("👍")),
            parentId: message._id,
          }),
        ),
        /has been deleted/,
      );
      assert.equal(
        await ChatMessages.find({ parentId: message._id }).countAsync(),
        0,
      );

      // It can still be replied to
      const reply = await send(other, "what did it say?", {
        parentId: message._id,
      });
      assert.equal(reply.parentId, message._id);
    });

    describe("in a comment thread", function () {
      it("sends a comment to the comment rules", async function () {
        const root = await comment(sender, "my comment");
        await assert.isRejected(
          remove(sender, root._id),
          /deleted with its thread/,
        );
        assert.isUndefined((await reload(root._id)).deletedAt);

        await send(other, "a reply", { puzzle: backingId, parentId: root._id });
        await assert.isRejected(
          asUser(other, () =>
            deleteWhiteboardComment.callPromise({ messageId: root._id }),
          ),
          /Only its author/,
        );
        await assert.isRejected(
          asUser(sender, () =>
            deleteWhiteboardComment.callPromise({ messageId: root._id }),
          ),
          /Someone has replied/,
        );
        assert.isFalse((await reload(root._id)).deleted);
      });

      it("lets the author remove a thread with no replies", async function () {
        const root = await comment(sender, "a lonely comment");
        await asUser(sender, () =>
          deleteWhiteboardComment.callPromise({ messageId: root._id }),
        );
        assert.isTrue((await reload(root._id)).deleted);
      });

      it("leaves a reply as a placeholder", async function () {
        const root = await comment(sender, "is this right?");
        const reply = await send(other, "no", {
          puzzle: backingId,
          parentId: root._id,
        });
        await remove(other, reply._id);
        const deleted = await reload(reply._id);
        assert.instanceOf(deleted.deletedAt, Date);
        assert.equal(deleted.thread, root._id);

        // It still stops the author taking the whole thread back
        await assert.isRejected(
          asUser(sender, () =>
            deleteWhiteboardComment.callPromise({ messageId: root._id }),
          ),
          /Someone has replied/,
        );
        assert.isFalse((await reload(root._id)).deleted);
      });

      it("refuses a reply on an archived hunt", async function () {
        const root = await comment(sender, "archived soon");
        const reply = await send(other, "a reply to keep", {
          puzzle: backingId,
          parentId: root._id,
        });
        await Hunts.updateAsync(huntId, { $set: { isArchived: true } });
        await assert.isRejected(remove(other, reply._id), /archived/);
        assert.isUndefined((await reload(reply._id)).deletedAt);
      });
    });

    it("leaves dingwords alone for someone who wasn't notified", async function () {
      const message = await send(sender, "nothing to see here");
      const theirs = await send(other, "the crossword again");
      await remove(sender, message._id);
      assert.equal(
        await ChatNotifications.find({
          user: dinged,
          message: theirs._id,
        }).countAsync(),
        1,
      );
    });
  });
});
