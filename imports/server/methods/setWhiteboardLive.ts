import { check, Match } from "meteor/check";
import { Meteor } from "meteor/meteor";
import {
  WhiteboardColours,
  WhiteboardStrokeWidths,
} from "../../lib/models/WhiteboardNodes";
import type { WhiteboardLiveState } from "../../methods/setWhiteboardLive";
import setWhiteboardLive from "../../methods/setWhiteboardLive";
import { setLive } from "../whiteboardLive";
import defineMethod from "./defineMethod";

defineMethod(setWhiteboardLive, {
  validate(arg) {
    check(arg, {
      boardId: String,
      cursor: Match.OneOf(null, { x: Number, y: Number }),
      drag: Match.OneOf(null, [{ node: String, x: Number, y: Number }]),
      stroke: Match.OneOf(null, {
        id: String,
        colour: Match.OneOf(...WhiteboardColours),
        strokeWidth: Match.OneOf(...WhiteboardStrokeWidths),
        points: [[Number]],
      }),
    });
    // Point arity is checked in setLive.
    return arg as { boardId: string } & WhiteboardLiveState;
  },

  async run({ boardId, cursor, drag, stroke }) {
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
    });
  },
});
