import { DDP } from "meteor/ddp";
import i18n from "i18next";
import Flags from "../../Flags";
import MeteorUsers from "../../lib/models/MeteorUsers";
import PuzzleNotifications from "../../lib/models/PuzzleNotifications";
import Puzzles from "../../lib/models/Puzzles";
import { serverLanguage } from "../lang";
import type Hookset from "./Hookset";

// Tells every member of the hunt about a new puzzle with a short-lived toast.
// Locked puzzles get theirs when they are unlocked, since that is when the
// creation hooks run for them.
const NewPuzzleNotificationHooks: Hookset = {
  name: "NewPuzzleNotificationHooks",

  async onPuzzleCreated(puzzleId: string) {
    if (await Flags.activeAsync("disable.new_puzzle_notifications")) {
      return;
    }

    const puzzle = await Puzzles.findOneAsync(puzzleId);
    if (!puzzle) {
      return;
    }

    const content = i18n.t("notification.puzzle.added", "New puzzle added!", {
      lng: serverLanguage,
    });

    const members = await MeteorUsers.find(
      { hunts: puzzle.hunt },
      { projection: { _id: 1 } },
    ).mapAsync((u) => u._id);

    // One row per member, so a single bulk write rather than a round trip
    // each. The creation hooks run deferred, outside the method that made
    // the puzzle, so run the insert as the creator for createdBy (as the job
    // worker does for jobs).
    await DDP._CurrentInvocation.withValue({ userId: puzzle.createdBy }, () =>
      PuzzleNotifications.insertManyAsync(
        members.map((user) => ({
          user,
          hunt: puzzle.hunt,
          puzzle: puzzleId,
          content,
          ephemeral: true,
          background: "info",
        })),
      ),
    );
  },
};

export default NewPuzzleNotificationHooks;
