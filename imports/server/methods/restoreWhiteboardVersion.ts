import { check } from "meteor/check";
import restoreWhiteboardVersion from "../../methods/restoreWhiteboardVersion";
import { restoreVersion } from "../whiteboardVersions";
import defineMethod from "./defineMethod";

defineMethod(restoreWhiteboardVersion, {
  validate(arg) {
    check(arg, { boardId: String, versionId: String });
    return arg;
  },

  async run({ boardId, versionId }) {
    check(this.userId, String);
    await restoreVersion(this.userId, boardId, versionId);
  },
});
