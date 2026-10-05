import { check } from "meteor/check";
import { Meteor } from "meteor/meteor";
import isReaction from "../../lib/isReaction";
import ChatMessages from "../../lib/models/ChatMessages";
import nodeIsText from "../../lib/nodeIsText";
import editChatMessage from "../../methods/editChatMessage";
import {
  assertPuzzleLinksInHunt,
  parseChatMessageContent,
} from "../chatMessageContent";
import { assertHuntMember } from "../sendChatMessageInternal";
import { assertMayCommentOnBoard } from "../whiteboardShared";
import defineMethod from "./defineMethod";

defineMethod(editChatMessage, {
  validate(arg) {
    check(arg, {
      messageId: String,
      content: String,
    });

    return arg;
  },

  async run({ messageId, content }) {
    check(this.userId, String);

    // Only the sender may edit; looking the message up by sender means
    // someone else's message (or a system message) answers the same as an
    // unknown id
    const message = await ChatMessages.findOneAsync({
      _id: messageId,
      sender: this.userId,
    });
    if (!message) {
      throw new Meteor.Error(404, "Unknown message");
    }
    if (message.deletedAt) {
      throw new Meteor.Error(400, "That message has been deleted");
    }
    if (isReaction(message)) {
      throw new Meteor.Error(400, "A reaction can't be edited");
    }
    await assertHuntMember(this.userId, message.hunt);
    // A comment or a reply in a comment thread is part of the board, so it
    // needs a board that can still be commented on, as a new reply does
    if (message.comment || message.thread) {
      await assertMayCommentOnBoard(this.userId, { puzzle: message.puzzle });
    }

    const contentObj = parseChatMessageContent(content);
    const empty = contentObj.children.every(
      (child) => nodeIsText(child) && child.text.trim() === "",
    );
    if (empty) {
      throw new Meteor.Error(400, "A message can't be edited to nothing");
    }
    // A reply that became only an emoji would turn into a reaction and
    // vanish from the history
    if (
      message.parentId &&
      isReaction({ content: contentObj, parentId: message.parentId })
    ) {
      throw new Meteor.Error(400, "A reply can't be edited into a reaction");
    }
    await assertPuzzleLinksInHunt(contentObj, message.hunt);

    // Edits don't run the chat message hooks: Discord isn't sent the new
    // text (a second post would read as a new message), and dingwords,
    // mentions and thread replies don't notify again. Only the content and
    // when it changed are written, so a reply, pin or comment pin stays as
    // it is. A delete that lands first wins.
    await ChatMessages.updateAsync(
      { _id: messageId, deletedAt: { $exists: false } },
      { $set: { content: contentObj, editedAt: new Date() } },
    );
  },
});
