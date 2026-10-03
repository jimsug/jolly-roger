import { check } from "meteor/check";
import setWhiteboardCommentResolved from "../../methods/setWhiteboardCommentResolved";
import { setCommentResolved } from "../whiteboardEdits";
import defineMethod from "./defineMethod";

defineMethod(setWhiteboardCommentResolved, {
  validate(arg) {
    check(arg, { messageId: String, resolved: Boolean });
    return arg;
  },

  async run({ messageId, resolved }) {
    check(this.userId, String);
    await setCommentResolved(this.userId, messageId, resolved);
  },
});
