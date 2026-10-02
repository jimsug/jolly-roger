import { check } from "meteor/check";
import { Meteor } from "meteor/meteor";
import Logger from "../../Logger";
import Puzzles from "../../lib/models/Puzzles";
import removePuzzleTag from "../../methods/removePuzzleTag";
import { assertNotWhiteboardPuzzle, syncPuzzleOnBoard } from "../whiteboard";
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

    Logger.info("Untagging puzzle", { puzzle: puzzleId, tag: tagId });
    await Puzzles.updateAsync(
      {
        _id: puzzleId,
      },
      {
        $pull: {
          tags: tagId,
        },
      },
    );

    Meteor.defer(() => {
      void syncPuzzleOnBoard(puzzleId);
    });
  },
});
