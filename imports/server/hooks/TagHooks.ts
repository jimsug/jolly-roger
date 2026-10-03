import i18n from "i18next";
import Flags from "../../Flags";
import { normalizedMessageDingsUserByDingword } from "../../lib/dingwordLogic";
import MeteorUsers from "../../lib/models/MeteorUsers";
import PuzzleNotifications from "../../lib/models/PuzzleNotifications";
import Puzzles from "../../lib/models/Puzzles";
import Tags from "../../lib/models/Tags";
import { serverLanguage } from "../lang";
import type Hookset from "./Hookset";

// Notifies hunt members whose dingwords match a tag that was just added to a
// puzzle, the same way chat messages do.
const TagHooks: Hookset = {
  name: "TagHooks",

  async onAddPuzzleTag(puzzleId: string, tagId: string, addingUserId: string) {
    if (await Flags.activeAsync("disable.dingwords")) {
      return;
    }

    const puzzle = await Puzzles.findOneAsync(puzzleId);
    const tag = await Tags.findOneAsync(tagId);
    if (!puzzle || !tag) {
      return;
    }

    // Dingwords match on whitespace-separated words, so "group:events" is
    // searched as "group events".
    const normalizedText = tag.name.toLowerCase().replaceAll(":", " ");
    const content = i18n.t(
      "notification.puzzle.tagged",
      "{{puzzle}} has been tagged with '{{tag}}'",
      {
        lng: serverLanguage,
        puzzle: puzzle.title,
        tag: tag.name,
        interpolation: { escapeValue: false },
      },
    );

    for await (const user of MeteorUsers.find(
      { hunts: puzzle.hunt, "dingwords.0": { $exists: true } },
      { projection: { dingwords: 1 } },
    )) {
      if (user._id === addingUserId) {
        continue;
      }
      if (!normalizedMessageDingsUserByDingword(normalizedText, user)) {
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

export default TagHooks;
