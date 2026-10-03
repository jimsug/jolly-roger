import { check } from "meteor/check";
import createWhiteboard from "../../methods/createWhiteboard";
import { ensureWhiteboard } from "../whiteboard";
import defineMethod from "./defineMethod";

defineMethod(createWhiteboard, {
  validate(arg) {
    check(arg, { huntId: String });
    return arg;
  },

  run({ huntId }) {
    check(this.userId, String);
    return ensureWhiteboard(this.userId, huntId);
  },
});
