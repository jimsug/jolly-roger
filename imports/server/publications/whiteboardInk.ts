import { check } from "meteor/check";
import WhiteboardNodes from "../../lib/models/WhiteboardNodes";
import whiteboardInk from "../../lib/publications/whiteboardInk";
import { boardForMember } from "../whiteboardShared";
import definePublication from "./definePublication";

// A board's ink, kept apart from the rest of its contents (see
// whiteboardContents) so that someone who hides ink isn't sent its points.
// With outlines, each segment comes without its points: where it is and how
// big, so moving and fitting frames around it still accounts for it.
definePublication(whiteboardInk, {
  validate(arg) {
    check(arg, { boardId: String, outlines: Boolean });
    return arg;
  },

  async run({ boardId, outlines }) {
    if (!(await boardForMember(this.userId, boardId))) {
      return [];
    }

    return WhiteboardNodes.find(
      { board: boardId, type: "ink" },
      outlines ? { projection: { points: 0 } } : {},
    );
  },
});
