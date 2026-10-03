import { check } from "meteor/check";
import ChatNotifications from "../../lib/models/ChatNotifications";
import dismissChatNotificationsForPuzzle from "../../methods/dismissChatNotificationsForPuzzle";
import checkHuntPuzzleMembership from "../checkHuntPuzzleMembership";
import defineMethod from "./defineMethod";

defineMethod(dismissChatNotificationsForPuzzle, {
  validate(arg) {
    check(arg, {
      hunt: String,
      puzzle: String,
      dismissUntil: Date,
    });

    return arg;
  },

  async run({ hunt, puzzle, dismissUntil }) {
    check(this.userId, String);

    await checkHuntPuzzleMembership(this.userId, hunt, puzzle);

    await ChatNotifications.removeAsync({
      user: this.userId,
      hunt,
      puzzle,
      createdAt: { $lte: dismissUntil },
    });
  },
});
