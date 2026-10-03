import { check } from "meteor/check";
import MeteorUsers from "../../lib/models/MeteorUsers";
import Puzzles from "../../lib/models/Puzzles";
import puzzlesForHuntProfileList from "../../lib/publications/puzzlesForHuntProfileList";
import definePublication from "./definePublication";

definePublication(puzzlesForHuntProfileList, {
  validate(arg) {
    check(arg, { huntId: String });
    return arg;
  },

  async run({ huntId }) {
    if (!this.userId) {
      return [];
    }

    const user = await MeteorUsers.findOneAsync(this.userId);
    if (!user?.hunts?.includes(huntId)) {
      return [];
    }

    // deleted is there for the client's soft-delete filter, and kind picks
    // out the whiteboard's puzzle
    return Puzzles.find(
      { hunt: huntId },
      { projection: { title: 1, hunt: 1, deleted: 1, kind: 1 } },
    );
  },
});
