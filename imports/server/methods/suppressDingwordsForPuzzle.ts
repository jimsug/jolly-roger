import { check, Match } from "meteor/check";
import { Meteor } from "meteor/meteor";
import {
  dingedByMentions,
  dingedByRoleMentions,
  SUPPRESS_ALL_DINGWORDS,
} from "../../lib/dingwordLogic";
import ChatNotifications from "../../lib/models/ChatNotifications";
import MeteorUsers from "../../lib/models/MeteorUsers";
import suppressDingwordsForPuzzle from "../../methods/suppressDingwordsForPuzzle";
import checkPuzzleNotificationScope from "../puzzleNotificationScope";
import defineMethod from "./defineMethod";

defineMethod(suppressDingwordsForPuzzle, {
  validate(arg) {
    check(arg, {
      hunt: String,
      puzzle: String,
      dingword: Match.Optional(String),
      dismissUntil: Date,
    });

    return arg;
  },

  async run({ hunt, puzzle, dingword, dismissUntil }) {
    check(this.userId, String);

    const word = dingword?.trim();
    if (word === "") {
      throw new Meteor.Error(400, "Dingword must not be blank");
    }
    const wordToSuppress = word ?? SUPPRESS_ALL_DINGWORDS;

    const { user, hunt: huntDoc } = await checkPuzzleNotificationScope(
      this.userId,
      hunt,
      puzzle,
    );

    await MeteorUsers.updateAsync(this.userId, {
      $addToSet: { [`suppressedDingwords.${hunt}.${puzzle}`]: wordToSuppress },
    });

    // Clear the notifications this mute would have prevented: those where
    // every matched dingword is now muted and nothing else (an @-mention or
    // role mention) dinged the user.
    const suppressed = new Set([
      ...(user.suppressedDingwords?.[hunt]?.[puzzle] ?? []),
      wordToSuppress,
    ]);
    const notifications = await ChatNotifications.find({
      user: this.userId,
      hunt,
      puzzle,
      createdAt: { $lte: dismissUntil },
    }).fetchAsync();
    const stale = notifications.filter((cn) => {
      // The hook records whether a mention was involved; rows from before it
      // did are judged from their content, which can only approximate the
      // role mention case (who counted as an active operator at the time).
      const mentioned =
        cn.mentioned ??
        (dingedByMentions(cn, user) || dingedByRoleMentions(cn, user, huntDoc));
      if (mentioned) {
        return false;
      }
      return (
        suppressed.has(SUPPRESS_ALL_DINGWORDS) ||
        (cn.dingwords ?? []).every((w) => suppressed.has(w))
      );
    });
    if (stale.length > 0) {
      await ChatNotifications.removeAsync({
        _id: { $in: stale.map((cn) => cn._id) },
      });
    }
  },
});
