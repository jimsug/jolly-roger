import { check } from "meteor/check";
import WhiteboardEdges from "../../lib/models/WhiteboardEdges";
import WhiteboardNodes from "../../lib/models/WhiteboardNodes";
import whiteboardContents from "../../lib/publications/whiteboardContents";
import { boardForMember } from "../whiteboardShared";
import definePublication from "./definePublication";

definePublication(whiteboardContents, {
  validate(arg) {
    check(arg, { boardId: String });
    return arg;
  },

  async run({ boardId }) {
    if (!(await boardForMember(this.userId, boardId))) {
      return [];
    }

    // Ink comes separately, from whiteboardInk.
    return [
      WhiteboardNodes.find({ board: boardId, type: { $ne: "ink" } }),
      WhiteboardEdges.find({ board: boardId }),
    ];
  },
});
