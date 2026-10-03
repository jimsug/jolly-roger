import { check, Match } from "meteor/check";
import { Meteor } from "meteor/meteor";
import type { Mongo } from "meteor/mongo";
import i18n from "i18next";
import Logger from "../../Logger";
import Hunts from "../../lib/models/Hunts";
import MeteorUsers from "../../lib/models/MeteorUsers";
import type { PuzzleType } from "../../lib/models/Puzzles";
import Puzzles from "../../lib/models/Puzzles";
import { userMayWritePuzzlesForHunt } from "../../lib/permission_stubs";
import { Url } from "../../lib/typedModel/regexes";
import unlockPuzzle from "../../methods/unlockPuzzle";
import assertNotWhiteboardPuzzle from "../assertNotWhiteboardPuzzle";
import GlobalHooks from "../GlobalHooks";
import { serverLanguage } from "../lang";
import sendChatMessageInternal from "../sendChatMessageInternal";
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
    await assertNotWhiteboardPuzzle(puzzleId);

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
      throw new Meteor.Error(
        401,
        `User ${this.userId} may not unlock puzzles from hunt ${puzzle.hunt}`,
      );
    }

    if (!puzzle.locked) {
      return;
    }

    const trimmedUrl = url?.trim();
    // The schema would reject it anyway, but as an opaque 500 rather than
    // something the unlock modal can show.
    if (trimmedUrl && !Url.test(trimmedUrl)) {
      throw new Meteor.Error(400, "Puzzle URL must be a valid URL");
    }
    Logger.info("Unlocking a puzzle", {
      hunt: puzzle.hunt,
      puzzle: puzzleId,
      url: trimmedUrl,
    });

    const update: Mongo.Modifier<PuzzleType> = {
      $unset: { locked: "", lockedSummary: "" },
    };
    if (trimmedUrl) {
      update.$set = { url: trimmedUrl };
    }
    // Only the unlock that clears the lock posts the chat line and announces
    // the puzzle, so two at once (a double click, or two operators) do it
    // once between them.
    const unlocked = await Puzzles.updateAsync(
      { _id: puzzleId, locked: true },
      update,
    );
    if (unlocked === 0) {
      return;
    }

    const message = i18n.t(
      "puzzle.unlock.chatMessage",
      "unlocked this puzzle",
      {
        lng: serverLanguage,
      },
    );
    await sendChatMessageInternal({
      puzzleId,
      content: {
        type: "message",
        children: [
          { type: "mention", userId: this.userId },
          { text: ` ${message}` },
        ],
      },
      sender: undefined,
    });

    // The creation hooks were skipped while the puzzle was locked, so this is
    // when the puzzle gets announced.
    Meteor.defer(() => {
      void GlobalHooks.runPuzzleCreatedHooks(puzzleId);
    });
  },
});
