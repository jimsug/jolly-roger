import { check } from "meteor/check";
import placeWhiteboardCardsByTags from "../../methods/placeWhiteboardCardsByTags";
import { placeByTags } from "../whiteboardReset";
import defineMethod from "./defineMethod";

defineMethod(placeWhiteboardCardsByTags, {
  validate(arg) {
    check(arg, { boardId: String, nodeIds: [String] });
    return arg;
  },

  async run({ boardId, nodeIds }) {
    check(this.userId, String);
    await placeByTags(this.userId, boardId, nodeIds);
  },
});
