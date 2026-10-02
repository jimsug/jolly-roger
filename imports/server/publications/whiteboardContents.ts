import { check } from "meteor/check";
import Flags from "../../Flags";
import MeteorUsers from "../../lib/models/MeteorUsers";
import WhiteboardEdges from "../../lib/models/WhiteboardEdges";
import WhiteboardNodes from "../../lib/models/WhiteboardNodes";
import Whiteboards from "../../lib/models/Whiteboards";
import whiteboardContents from "../../lib/publications/whiteboardContents";
import definePublication from "./definePublication";

definePublication(whiteboardContents, {
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

    if (await Flags.activeAsync("disable.whiteboard")) {
      return [];
    }

    return [
      WhiteboardNodes.find({ board: boardId }),
      WhiteboardEdges.find({ board: boardId }),
    ];
  },
});
