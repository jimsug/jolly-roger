import { check } from "meteor/check";
import Flags from "../../Flags";
import MeteorUsers from "../../lib/models/MeteorUsers";
import Whiteboards from "../../lib/models/Whiteboards";
import WhiteboardVersions from "../../lib/models/WhiteboardVersions";
import whiteboardVersions from "../../lib/publications/whiteboardVersions";
import definePublication from "./definePublication";

definePublication(whiteboardVersions, {
  validate(arg) {
    check(arg, { boardId: String });
    return arg;
  },

  async run({ boardId }) {
    if (!this.userId) {
      return [];
    }

    const board = await Whiteboards.findOneAsync(boardId);
    if (!board) {
      return [];
    }

    const user = await MeteorUsers.findOneAsync(this.userId);
    if (!user?.hunts?.includes(board.hunt)) {
      return [];
    }

    if (
      (await Flags.activeAsync("disable.whiteboard")) ||
      (await Flags.activeAsync("disable.whiteboard_versions"))
    ) {
      return [];
    }

    return WhiteboardVersions.find(
      { board: boardId },
      { projection: { hash: 0 } },
    );
  },
});
