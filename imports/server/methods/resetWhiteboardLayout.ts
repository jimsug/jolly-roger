import { check } from "meteor/check";
import resetWhiteboardLayout from "../../methods/resetWhiteboardLayout";
import { resetLayout } from "../whiteboardReset";
import defineMethod from "./defineMethod";

defineMethod(resetWhiteboardLayout, {
  validate(arg) {
    check(arg, { boardId: String, putBack: Boolean });
    return arg;
  },

  async run({ boardId, putBack }) {
    check(this.userId, String);
    await resetLayout(this.userId, boardId, putBack);
  },
});
