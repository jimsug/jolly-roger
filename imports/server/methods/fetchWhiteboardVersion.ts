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

  // Not unblocked: a connection's chunk fetches run one after another, so
  // it can't have many multi-megabyte chunks in memory at once.
  run({ boardId, versionId, index }) {
    check(this.userId, String);
    return fetchVersion(this.userId, boardId, versionId, index);
  },
});
