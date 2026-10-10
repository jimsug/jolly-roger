import { check } from "meteor/check";
import Flags from "../../Flags";
import Documents from "../../lib/models/Documents";
import MeteorUsers from "../../lib/models/MeteorUsers";
import Settings from "../../lib/models/Settings";
import boardForHunt from "../../lib/publications/boardForHunt";
import definePublication from "./definePublication";

definePublication(boardForHunt, {
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

    if (await Flags.activeAsync("disable.board")) {
      return [];
    }

    return [
      Documents.find({ hunt: huntId, provider: "board" }),
      // Just that a service is set up and where: the secret and the service
      // account stay on the server
      Settings.find(
        { name: "board.service" },
        { projection: { name: 1, "value.url": 1 } },
      ),
    ];
  },
});
