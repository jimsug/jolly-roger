import { check } from "meteor/check";
import { Meteor } from "meteor/meteor";
import Logger from "../../Logger";
import MeteorUsers from "../../lib/models/MeteorUsers";
import Puzzles from "../../lib/models/Puzzles";
import removePuzzleTag from "../../methods/removePuzzleTag";
import assertNotWhiteboardPuzzle from "../assertNotWhiteboardPuzzle";
import { deferSyncPuzzlesOnBoard } from "../whiteboard";
import defineMethod from "./defineMethod";

defineMethod(removePuzzleTag, {
  validate(arg) {
    check(arg, {
      puzzleId: String,
      tagId: String,
    });

    return arg;
  },

  async run({ puzzleId, tagId }) {
    check(this.userId, String);
    await assertNotWhiteboardPuzzle(puzzleId);

    const puzzle = await Puzzles.findOneAsync(
      {
        _id: puzzleId,
      },
      {
        projection: {
          hunt: 1,
        },
      },
    );
    if (!puzzle) {
      throw new Meteor.Error(404, `No puzzle known with id ${puzzleId}`);
    }

    const user = await MeteorUsers.findOneAsync(this.userId);
    if (!user?.hunts?.includes(puzzle.hunt)) {
      throw new Meteor.Error(
        403,
        `User ${this.userId} is not a member of hunt ${puzzle.hunt}`,
      );
    }

    Logger.info("Untagging puzzle", { puzzle: puzzleId, tag: tagId });
    const updated = await Puzzles.updateAsync(
      {
        _id: puzzleId,
        tags: tagId,
      },
      {
        $pull: {
          tags: tagId,
        },
      },
    );

    // The board only needs to catch up if the tag was there to remove.
    if (updated > 0) {
      deferSyncPuzzlesOnBoard(puzzle.hunt, [puzzleId]);
    }
  },
});
