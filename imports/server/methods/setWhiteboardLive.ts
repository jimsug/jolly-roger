import { check, Match } from "meteor/check";
import { Meteor } from "meteor/meteor";
import {
  WhiteboardColors,
  WhiteboardStrokeWidths,
} from "../../lib/models/WhiteboardNodes";
import setWhiteboardLive from "../../methods/setWhiteboardLive";
import { InkPointPattern } from "../whiteboardEdits";
import { setLive } from "../whiteboardLive";
import defineMethod from "./defineMethod";

defineMethod(setWhiteboardLive, {
  validate(arg) {
    check(arg, {
      boardId: String,
      cursor: Match.OneOf(null, { x: Number, y: Number }),
      drag: Match.OneOf(null, [
        {
          node: String,
          x: Number,
          y: Number,
          parent: Match.Optional(Match.OneOf(null, String)),
        },
      ]),
      stroke: Match.OneOf(null, {
        color: Match.OneOf(...WhiteboardColors),
        strokeWidth: Match.OneOf(...WhiteboardStrokeWidths),
        points: [InkPointPattern],
      }),
      selection: Match.Optional(Match.OneOf(null, [String])),
      editing: Match.Optional(Match.OneOf(null, String)),
    });
    return arg;
  },

  async run({ boardId, cursor, drag, stroke, selection, editing }) {
    check(this.userId, String);
    if (!this.connection) {
      throw new Meteor.Error(400, "Live updates need a connection");
    }
    // Pointer traffic shouldn't queue behind real edits.
    this.unblock();
    await setLive(this.userId, this.connection, boardId, {
      cursor,
      drag,
      stroke,
      selection,
      editing,
    });
  },
});
