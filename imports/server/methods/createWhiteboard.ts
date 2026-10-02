import { check } from "meteor/check";
import createWhiteboard from "../../methods/createWhiteboard";
import { createWhiteboard as createWhiteboardForHunt } from "../whiteboard";
import defineMethod from "./defineMethod";

defineMethod(createWhiteboard, {
  validate(arg) {
    check(arg, { huntId: String });
    return arg;
  },

  async run({ huntId }) {
    check(this.userId, String);
    return createWhiteboardForHunt(this.userId, huntId);
  },
});
