import { check } from "meteor/check";
import { Meteor } from "meteor/meteor";
import isReaction from "../../lib/isReaction";
import ChatMessages from "../../lib/models/ChatMessages";
import MeteorUsers from "../../lib/models/MeteorUsers";
import setChatMessagePin from "../../methods/setChatMessagePin";
import defineMethod from "./defineMethod";

defineMethod(setChatMessagePin, {
  validate(arg) {
    check(arg, {
      messageId: String,
      pinned: Boolean,
    });

    return arg;
  },

  async run({ messageId, pinned }) {
    check(this.userId, String);

    // Any member of the hunt may pin or unpin, as with tags. The message is
    // looked up within the caller's hunts so a message elsewhere answers the
    // same as an unknown id.
    const user = await MeteorUsers.findOneAsync(this.userId, {
      projection: { hunts: 1 },
    });
    const message = await ChatMessages.findOneAsync(
      { _id: messageId, hunt: { $in: user?.hunts ?? [] } },
      { projection: { content: 1, parentId: 1 } },
    );
    if (!message) {
      throw new Meteor.Error(404, "Unknown message");
    }
    // A reaction is shown on its parent, never in the history or the pinned
    // pane, so there is nothing for a pin on it to show
    if (isReaction(message)) {
      throw new Meteor.Error(400, "A reaction can't be pinned");
    }

    await ChatMessages.updateAsync(
      messageId,
      pinned ? { $set: { pinTs: new Date() } } : { $unset: { pinTs: "" } },
    );
  },
});
