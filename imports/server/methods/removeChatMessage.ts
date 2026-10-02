import { check } from "meteor/check";
import { Meteor } from "meteor/meteor";
import ChatMessages from "../../lib/models/ChatMessages";
import removeChatMessage from "../../methods/removeChatMessage";
import defineMethod from "./defineMethod";

defineMethod(removeChatMessage, {
  validate(arg) {
    check(arg, {
      id: String,
    });

    return arg;
  },

  async run({ id }: { id: string }) {
    check(this.userId, String);
    const message = await ChatMessages.findOneAsync({ _id: id });
    if (!message) {
      throw new Meteor.Error(404, "Message not found");
    }
    if (this.userId !== message?.sender) {
      throw new Meteor.Error(403, "Not allowed");
    }
    // Removing a comment's first message would strand its replies; the board
    // deletes the whole thread instead.
    if (message.comment) {
      throw new Meteor.Error(400, "Delete a whiteboard comment from the board");
    }

    await ChatMessages.removeAsync(message);
  },
});
