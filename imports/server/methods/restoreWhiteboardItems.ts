import { check } from "meteor/check";
import restoreWhiteboardItems from "../../methods/restoreWhiteboardItems";
import { restoreItems } from "../whiteboardVersions";
import defineMethod from "./defineMethod";

defineMethod(restoreWhiteboardItems, {
  validate(arg) {
    check(arg, { boardId: String, versionId: String, nodeIds: [String] });
    return arg;
  },

  async run({ boardId, versionId, nodeIds }) {
    check(this.userId, String);
    return {
      restored: await restoreItems(this.userId, boardId, versionId, nodeIds),
    };
  },
});
