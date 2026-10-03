import { check } from "meteor/check";
import deleteWhiteboardEdges from "../../methods/deleteWhiteboardEdges";
import { deleteEdges } from "../whiteboardEdits";
import defineMethod from "./defineMethod";

defineMethod(deleteWhiteboardEdges, {
  validate(arg) {
    check(arg, { boardId: String, edgeIds: [String] });
    return arg;
  },

  async run({ boardId, edgeIds }) {
    check(this.userId, String);
    await deleteEdges(this.userId, boardId, edgeIds);
  },
});
