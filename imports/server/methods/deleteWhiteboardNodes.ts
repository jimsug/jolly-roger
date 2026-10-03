import { check } from "meteor/check";
import deleteWhiteboardNodes from "../../methods/deleteWhiteboardNodes";
import { deleteNodes } from "../whiteboardEdits";
import defineMethod from "./defineMethod";

defineMethod(deleteWhiteboardNodes, {
  validate(arg) {
    check(arg, { boardId: String, nodeIds: [String] });
    return arg;
  },

  async run({ boardId, nodeIds }) {
    check(this.userId, String);
    await deleteNodes(this.userId, boardId, nodeIds);
  },
});
