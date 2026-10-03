import Hunts from "../../lib/models/Hunts";
import PuzzleNotifications from "../../lib/models/PuzzleNotifications";
import Puzzles from "../../lib/models/Puzzles";
import puzzleNotificationsForSelf from "../../lib/publications/puzzleNotificationsForSelf";
import publishJoinedQuery from "../publishJoinedQuery";
import definePublication from "./definePublication";

definePublication(puzzleNotificationsForSelf, {
  async run() {
    if (!this.userId) {
      return [];
    }
    await publishJoinedQuery(
      this,
      {
        model: PuzzleNotifications,
        foreignKeys: [
          {
            field: "puzzle",
            join: { model: Puzzles, allowDeleted: true },
          },
          {
            field: "hunt",
            join: { model: Hunts },
          },
        ],
      },
      { user: this.userId },
    );
    this.ready();

    return undefined;
  },
});
