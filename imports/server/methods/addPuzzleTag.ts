import { check } from "meteor/check";
import { Meteor } from "meteor/meteor";
import Logger from "../../Logger";
import MeteorUsers from "../../lib/models/MeteorUsers";
import Puzzles from "../../lib/models/Puzzles";
import addPuzzleTag from "../../methods/addPuzzleTag";
import GlobalHooks from "../GlobalHooks";
import getOrCreateTagByName from "../getOrCreateTagByName";
import defineMethod from "./defineMethod";

defineMethod(addPuzzleTag, {
  validate(arg) {
    check(arg, {
      puzzleId: String,
      tagName: String,
    });

    return arg;
  },

  async run({ puzzleId, tagName }) {
    check(this.userId, String);

    // Look up which hunt the specified puzzle is from.
    const puzzle = await Puzzles.findOneAsync(
      {
        _id: puzzleId,
      },
      {
        projection: {
          hunt: 1,
          tags: 1,
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

    const huntId = puzzle.hunt;
    const tagId = await getOrCreateTagByName(huntId, tagName);

    if (puzzle.tags.includes(tagId)) {
      // Nothing changes, so nobody needs telling about it.
      return;
    }

    Logger.info("Tagging puzzle", { puzzle: puzzleId, tag: tagName });
    await Puzzles.updateAsync(
      {
        _id: puzzleId,
      },
      {
        $addToSet: {
          tags: tagId,
        },
      },
    );

    await GlobalHooks.runTagAddedHooks(puzzleId, tagId, this.userId);
  },
});
