import { check } from "meteor/check";
import setWhiteboardLayoutLocked from "../../methods/setWhiteboardLayoutLocked";
import { setLayoutLocked } from "../whiteboardEdits";
import defineMethod from "./defineMethod";

defineMethod(setWhiteboardLayoutLocked, {
  validate(arg) {
    check(arg, { boardId: String, locked: Boolean });
    return arg;
  },

  async run({ boardId, locked }) {
    check(this.userId, String);
    await setLayoutLocked(this.userId, boardId, locked);
  },
});
