import { check, Match } from "meteor/check";
import fetchWhiteboardVersion from "../../methods/fetchWhiteboardVersion";
import { fetchVersion } from "../whiteboardVersions";
import defineMethod from "./defineMethod";

defineMethod(fetchWhiteboardVersion, {
  validate(arg) {
    check(arg, {
      boardId: String,
      versionId: String,
      index: Match.Integer,
    });
    return arg;
  },

  run({ boardId, versionId, index }) {
    check(this.userId, String);
    // A chunk can be several megabytes, which shouldn't hold up the caller's
    // other calls.
    this.unblock();
    return fetchVersion(this.userId, boardId, versionId, index);
  },
});
