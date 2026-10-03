import { check } from "meteor/check";
import ChatNotifications from "../../lib/models/ChatNotifications";
import dismissAllDingsForPuzzle from "../../methods/dismissAllDingsForPuzzle";
import checkPuzzleNotificationScope from "../puzzleNotificationScope";
import defineMethod from "./defineMethod";

defineMethod(dismissAllDingsForPuzzle, {
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

    await checkPuzzleNotificationScope(this.userId, hunt, puzzle);

    await ChatNotifications.removeAsync({
      user: this.userId,
      hunt,
      puzzle,
      createdAt: { $lte: dismissUntil },
    });
  },
});
