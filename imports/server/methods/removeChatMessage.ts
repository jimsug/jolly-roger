import { check } from "meteor/check";
import { Meteor } from "meteor/meteor";
import isReaction from "../../lib/isReaction";
import ChatMessages from "../../lib/models/ChatMessages";
import removeChatMessage from "../../methods/removeChatMessage";
import defineMethod from "./defineMethod";

defineMethod(removeChatMessage, {
  validate(arg) {
    check(arg, {
      messageId: String,
    });

    return arg;
  },

  async run({ messageId }) {
    check(this.userId, String);

    // Only the sender may remove a reaction; looking the message up by sender
    // means someone else's message answers the same as an unknown id
    const message = await ChatMessages.findOneAsync(
      { _id: messageId, sender: this.userId },
      { projection: { content: 1, parentId: 1 } },
    );
    if (!message) {
      throw new Meteor.Error(404, "Unknown message");
    }
    if (!isReaction(message)) {
      throw new Meteor.Error(400, "Only reactions can be removed");
    }

    await ChatMessages.removeAsync(messageId);
  },
});
