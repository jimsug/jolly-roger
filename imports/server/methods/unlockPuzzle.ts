import { check } from "meteor/check";
import { Meteor } from "meteor/meteor";
import Hunts from "../../lib/models/Hunts";
import MeteorUsers from "../../lib/models/MeteorUsers";
import Puzzles from "../../lib/models/Puzzles";
import { userMayWritePuzzlesForHunt } from "../../lib/permission_stubs";
import unlockPuzzle from "../../methods/unlockPuzzle";
import GlobalHooks from "../GlobalHooks";
import defineMethod from "./defineMethod";

defineMethod(unlockPuzzle, {
  validate(arg) {
    check(arg, {
      puzzleId: String,
      url: Match.Optional(String),
    });
    return arg;
  },

  async run({ puzzleId, url }) {
    check(this.userId, String);

    const puzzle = await Puzzles.findOneAsync(puzzleId);
    if (!puzzle) {
      throw new Meteor.Error(404, "Unknown puzzle id");
    }

    const hunt = await Hunts.findOneAsync(puzzle.hunt);
    if (!hunt) {
      throw new Meteor.Error(404, "Unknown hunt id");
    }

    if (
      !userMayWritePuzzlesForHunt(
        await MeteorUsers.findOneAsync(this.userId),
        hunt,
      )
    ) {
      throw new Meteor.Error(401, "Only operators can unlock puzzles");
    }

    if (!puzzle.locked) {
      return;
    }

    const update: any = {
      $unset: {
        locked: "",
        lockedSummary: "",
      },
    };
    if (url !== undefined && url.trim() !== "") {
      update.$set = { url: url.trim() };
    }

    await Puzzles.updateAsync(puzzleId, update);

    const content = {
      type: "message" as const,
      children: [
        { text: "" },
        {
          type: "mention" as const,
          userId: this.userId,
        },
        {
          text: ` unlocked this puzzle`,
        },
      ],
    };

    await sendChatMessageInternal({
      puzzleId,
      content,
      sender: undefined,
    });

    // Run any puzzle update hooks if needed
    Meteor.defer(() => {
      void GlobalHooks.runPuzzleCreatedHooks(puzzleId, puzzle);
    });
  },
});
