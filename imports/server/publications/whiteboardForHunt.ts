import { check } from "meteor/check";
import Flags from "../../Flags";
import MeteorUsers from "../../lib/models/MeteorUsers";
import Whiteboards from "../../lib/models/Whiteboards";
import whiteboardForHunt from "../../lib/publications/whiteboardForHunt";
import definePublication from "./definePublication";

definePublication(whiteboardForHunt, {
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

    if (await Flags.activeAsync("disable.whiteboard")) {
      return [];
    }

    return Whiteboards.find({ hunt: huntId });
  },
});
