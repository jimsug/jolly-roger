import { check, Match } from "meteor/check";
import exportWhiteboard from "../../methods/exportWhiteboard";
import { exportBoard } from "../whiteboardVersions";
import defineMethod from "./defineMethod";

defineMethod(exportWhiteboard, {
  validate(arg) {
    check(arg, {
      boardId: String,
      index: Match.Integer,
      hash: Match.Optional(String),
    });
    return arg;
  },

  // Not unblocked: a connection's export calls run one after another, so it
  // can't compress a big board several times at once, and its later chunks
  // come from the export its first call made.
  run({ boardId, index, hash }) {
    check(this.userId, String);
    return exportBoard(this.userId, boardId, index, hash, this.connection);
  },
});
