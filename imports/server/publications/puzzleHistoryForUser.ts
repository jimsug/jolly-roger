import { check } from "meteor/check";
import CallActivities from "../../lib/models/CallActivities";
import ChatMessages from "../../lib/models/ChatMessages";
import DocumentActivities from "../../lib/models/DocumentActivities";
import MeteorUsers from "../../lib/models/MeteorUsers";
import Puzzles from "../../lib/models/Puzzles";
import Tags from "../../lib/models/Tags";
import puzzleHistoryForUser from "../../lib/publications/puzzleHistoryForUser";
import definePublication from "./definePublication";

// Everything a user did on one puzzle, for the expanded row on the puzzle
// history page.
definePublication(puzzleHistoryForUser, {
  validate(arg) {
    check(arg, { puzzleId: String });
    return arg;
  },

  async run({ puzzleId }) {
    if (!this.userId) {
      return [];
    }

    const user = await MeteorUsers.findOneAsync(this.userId);
    const puzzle = await Puzzles.findOneAsync({
      _id: puzzleId,
      hunt: { $in: user?.hunts ?? [] },
    });
    if (!puzzle) {
      return [];
    }
    const { hunt } = puzzle;

    return [
      Puzzles.find({ _id: puzzleId }),
      // The whole hunt's tags, so the row keeps up with tags added later
      Tags.find({ hunt }),
      CallActivities.find({ user: this.userId, hunt, call: puzzleId }),
      ChatMessages.find({
        hunt,
        puzzle: puzzleId,
        $or: [
          { sender: this.userId },
          {
            "content.children": {
              $elemMatch: { type: "mention", userId: this.userId },
            },
          },
        ],
      }),
      DocumentActivities.find({ user: this.userId, hunt, puzzle: puzzleId }),
    ];
  },
});
