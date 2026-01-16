import { check } from "meteor/check";
import { Meteor } from "meteor/meteor";
import { contentFromMessage } from "../../lib/models/ChatMessages";
import Hunts from "../../lib/models/Hunts";
import MeteorUsers from "../../lib/models/MeteorUsers";
import Puzzles from "../../lib/models/Puzzles";
import { userMayWritePuzzlesForHunt } from "../../lib/permission_stubs";
import markComplete from "../../methods/markComplete";
import GlobalHooks from "../GlobalHooks";
import sendChatMessageInternal from "../sendChatMessageInternal";
import defineMethod from "./defineMethod";

defineMethod(markComplete, {
  validate(arg) {
    check(arg, {
      puzzleId: String,
      markedComplete: Boolean,
    });
    return arg;
  },

  async run({ puzzleId, markedComplete }) {
    check(this.userId, String);

    const oldPuzzle = await Puzzles.findOneAllowingDeletedAsync(puzzleId);
    if (!oldPuzzle) {
      throw new Meteor.Error(404, "Unknown puzzle id");
    }

    const hunt = await Hunts.findOneAsync(oldPuzzle.hunt);
    if (
      !userMayWritePuzzlesForHunt(
        await MeteorUsers.findOneAsync(this.userId),
        hunt,
      )
    ) {
      throw new Meteor.Error(
        401,
        `User ${this.userId} may not modify puzzles from hunt ${oldPuzzle.hunt}`,
      );
    }

    if (oldPuzzle.markedComplete === markedComplete) {
      return;
    }

    await Puzzles.updateAsync(puzzleId, {
      $set: {
        markedComplete,
      },
    });

    const message = `Puzzle was marked ${
      markedComplete ? "complete" : "incomplete"
    }`;
    const content = contentFromMessage(message);
    await sendChatMessageInternal({
      puzzleId,
      content,
      sender: undefined,
    });

    // Run any puzzle update hooks
    Meteor.defer(() => {
      void GlobalHooks.runPuzzleUpdatedHooks(puzzleId, oldPuzzle);
    });
  },
});
