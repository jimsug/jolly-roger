import i18n from "i18next";
import Flags from "../../Flags";
import {
  dingwordsMatchingMessage,
  normalizedTagForDingwordSearch,
} from "../../lib/dingwordLogic";
import MeteorUsers from "../../lib/models/MeteorUsers";
import PuzzleNotifications from "../../lib/models/PuzzleNotifications";
import Puzzles from "../../lib/models/Puzzles";
import Tags from "../../lib/models/Tags";
import { serverLanguage } from "../lang";
import type Hookset from "./Hookset";

// Notifies hunt members whose dingwords match a tag that was just added to a
// puzzle, the same way chat messages do.
const TagNotificationHooks: Hookset = {
  name: "TagNotificationHooks",

  async onPuzzleTagAdded(
    puzzleId: string,
    tagId: string,
    addingUserId: string,
  ) {
    if (await Flags.activeAsync("disable.dingwords")) {
      return;
    }

    const puzzle = await Puzzles.findOneAsync(puzzleId);
    const tag = await Tags.findOneAsync(tagId);
    if (!puzzle || !tag) {
      return;
    }

    // Multi-word dingwords match single spaces, so "group:events" is
    // searched as "group events".
    const normalizedText = normalizedTagForDingwordSearch(tag.name);
    const content = i18n.t(
      "notification.puzzle.tagged",
      "{{puzzle}} has been tagged with '{{tag}}'",
      {
        lng: serverLanguage,
        puzzle: puzzle.title,
        tag: tag.name,
        // Plain text in the toast, so escaping only shows entities; drop once both i18n inits stop escaping
        interpolation: { escapeValue: false },
      },
    );

    for await (const user of MeteorUsers.find(
      { hunts: puzzle.hunt, "dingwords.0": { $exists: true } },
      { projection: { dingwords: 1, dingwordsOpenMatch: 1 } },
    )) {
      if (user._id === addingUserId) {
        continue;
      }
      if (dingwordsMatchingMessage(normalizedText, user).length === 0) {
        continue;
      }
      await PuzzleNotifications.insertAsync({
        user: user._id,
        hunt: puzzle.hunt,
        puzzle: puzzleId,
        content,
        background: "secondary",
      });
    }
  },
};

export default TagNotificationHooks;
