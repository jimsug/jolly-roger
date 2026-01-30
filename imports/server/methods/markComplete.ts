import { check } from "meteor/check";
import { Meteor } from "meteor/meteor";
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

    const content = {
      type: "message" as const,
      children: [
        { text: "" },
        {
          type: "mention" as const,
          userId: this.userId,
        },
        {
          text: ` marked puzzle ${markedComplete ? "complete" : "incomplete"}`,
        },
      ],
    };
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
