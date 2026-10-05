import { check } from "meteor/check";
import isAdmin from "../../lib/isAdmin";
import ChatMessages from "../../lib/models/ChatMessages";
import MeteorUsers from "../../lib/models/MeteorUsers";
import Puzzles from "../../lib/models/Puzzles";
import chatMessagesForFirehose from "../../lib/publications/chatMessagesForFirehose";
import definePublication from "./definePublication";

definePublication(chatMessagesForFirehose, {
  validate(arg) {
    check(arg, {
      huntId: String,
    });
    return arg;
  },

  async run({ huntId }) {
    if (!this.userId) {
      return [];
    }

    const user = await MeteorUsers.findOneAsync(this.userId);
    if (!user?.hunts?.includes(huntId)) {
      return [];
    }

    // Deleted puzzles go to global admins only, as for puzzlesForHunt
    return [
      ChatMessages.find({ hunt: huntId }),
      Puzzles[isAdmin(user) ? "findAllowingDeleted" : "find"]({ hunt: huntId }),
    ];
  },
});
