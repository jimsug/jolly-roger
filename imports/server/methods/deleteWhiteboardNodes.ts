import { check } from "meteor/check";
import deleteWhiteboardNodesMethod from "../../methods/deleteWhiteboardNodes";
import { deleteNodes } from "../whiteboardEdits";
import defineMethod from "./defineMethod";

defineMethod(deleteWhiteboardNodesMethod, {
  validate(arg) {
    check(arg, { boardId: String, nodeIds: [String] });
    return arg;
  },

  async run({ boardId, nodeIds }) {
    check(this.userId, String);
    await deleteNodes(this.userId, boardId, nodeIds);
  },
});
