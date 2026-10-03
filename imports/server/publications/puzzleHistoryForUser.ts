import { check } from "meteor/check";
import Bookmarks from "../../lib/models/Bookmarks";
import ChatMessages from "../../lib/models/ChatMessages";
import DocumentActivities from "../../lib/models/DocumentActivities";
import Guesses from "../../lib/models/Guesses";
import Puzzles from "../../lib/models/Puzzles";
import Tags from "../../lib/models/Tags";
import puzzleHistoryForUser from "../../lib/publications/puzzleHistoryForUser";
import CallActivities from "../models/CallActivities";
import huntsForPuzzleHistory from "../puzzleHistoryHunts";
import definePublication from "./definePublication";

// Everything a user did on one puzzle, for the expanded row on the puzzle
// history page.
definePublication(puzzleHistoryForUser, {
  validate(arg) {
    check(arg, {
      userId: String,
      puzzleId: String,
    });
    return arg;
  },

  async run({ userId, puzzleId }) {
    if (!this.userId) {
      return [];
    }

    const hunts = await huntsForPuzzleHistory(this.userId, userId);
    if (!hunts) {
      return [];
    }

    const puzzle = await Puzzles.findOneAsync({
      _id: puzzleId,
      hunt: { $in: hunts },
    });
    if (!puzzle) {
      return [];
    }
    const { hunt } = puzzle;

    return [
      Puzzles.find({ _id: puzzleId }),
      Tags.find({ _id: { $in: puzzle.tags } }),
      Bookmarks.find({ user: userId, hunt, puzzle: puzzleId }),
      CallActivities.find({ user: userId, hunt, call: puzzleId }),
      ChatMessages.find({
        hunt,
        puzzle: puzzleId,
        $or: [
          { sender: userId },
          {
            "content.children": {
              $elemMatch: { type: "mention", userId },
            },
          },
        ],
      }),
      DocumentActivities.find({ user: userId, hunt, puzzle: puzzleId }),
      Guesses.find({ createdBy: userId, hunt, puzzle: puzzleId }),
    ];
  },
});
