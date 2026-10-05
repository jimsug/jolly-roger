import { check } from "meteor/check";
import { Meteor } from "meteor/meteor";
import isReaction from "../../lib/isReaction";
import ChatMessages from "../../lib/models/ChatMessages";
import ChatNotifications from "../../lib/models/ChatNotifications";
import deleteChatMessage from "../../methods/deleteChatMessage";
import { assertHuntMember } from "../sendChatMessageInternal";
import { assertMayCommentOnBoard } from "../whiteboardShared";
import defineMethod from "./defineMethod";

defineMethod(deleteChatMessage, {
  validate(arg) {
    check(arg, {
      messageId: String,
    });

    return arg;
  },

  async run({ messageId }) {
    check(this.userId, String);

    // Only the sender may delete; looking the message up by sender means
    // someone else's message (or a system message) answers the same as an
    // unknown id
    const message = await ChatMessages.findOneAsync({
      _id: messageId,
      sender: this.userId,
    });
    if (!message) {
      throw new Meteor.Error(404, "Unknown message");
    }
    if (message.comment) {
      throw new Meteor.Error(
        400,
        "A whiteboard comment is deleted with its thread",
      );
    }
    if (isReaction(message)) {
      throw new Meteor.Error(400, "A reaction is taken back, not deleted");
    }
    if (message.deletedAt) {
      return;
    }
    await assertHuntMember(this.userId, message.hunt);
    if (message.thread) {
      await assertMayCommentOnBoard(this.userId, { puzzle: message.puzzle });
    }

    // The message stays, emptied, so replies to it keep their place and
    // their links back to it. Discord, which was sent the message when it
    // was new, isn't told.
    await ChatMessages.updateAsync(
      { _id: messageId, deletedAt: { $exists: false } },
      {
        $set: {
          content: { type: "message", children: [] },
          deletedAt: new Date(),
        },
        $unset: { pinTs: 1, editedAt: 1 },
      },
    );

    // Reactions are shown on the message, so they go with it. Hard deletes,
    // as when a reaction is taken back. The puzzle is in the selector so the
    // { deleted, puzzle } index serves the lookup.
    const reactions = (
      await ChatMessages.find(
        { puzzle: message.puzzle, parentId: messageId },
        { projection: { content: 1, parentId: 1 } },
      ).fetchAsync()
    ).filter((reply) => isReaction(reply));
    if (reactions.length > 0) {
      await ChatMessages.removeAsync({
        _id: { $in: reactions.map((reaction) => reaction._id) },
      });
    }

    // Every notification about the message goes (dingwords, mentions, thread
    // replies, board comments). Hard deletes, since each holds a copy of the
    // content. Rows from before notifications named their message are
    // matched the way they were written. The hunt is in the selector so the
    // { hunt } index serves the lookup.
    await ChatNotifications.removeAsync({
      hunt: message.hunt,
      $or: [
        { message: messageId },
        {
          message: { $exists: false },
          puzzle: message.puzzle,
          sender: this.userId,
          timestamp: message.timestamp,
        },
      ],
    });
  },
});
