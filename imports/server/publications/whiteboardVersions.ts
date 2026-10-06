import { check } from "meteor/check";
import WhiteboardVersions from "../../lib/models/WhiteboardVersions";
import whiteboardVersions from "../../lib/publications/whiteboardVersions";
import { boardForMember } from "../whiteboardShared";
import definePublication from "./definePublication";

definePublication(whiteboardVersions, {
  validate(arg) {
    check(arg, { boardId: String });
    return arg;
  },

  async run({ boardId }) {
    if (
      !(await boardForMember(
        this.userId,
        boardId,
        "disable.whiteboard_versions",
      ))
    ) {
      return [];
    }

    return WhiteboardVersions.find(
      { board: boardId },
      { projection: { hash: 0 } },
    );
  },
});
