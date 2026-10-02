import { check } from "meteor/check";
import deleteWhiteboardComment from "../../methods/deleteWhiteboardComment";
import { deleteComment } from "../whiteboardEdits";
import defineMethod from "./defineMethod";

defineMethod(deleteWhiteboardComment, {
  validate(arg) {
    check(arg, { messageId: String });
    return arg;
  },

  async run({ messageId }) {
    check(this.userId, String);
    await deleteComment(this.userId, messageId);
  },
});
