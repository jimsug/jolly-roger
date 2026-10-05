import { check, Match } from "meteor/check";
import {
  WhiteboardColors,
  WhiteboardNodeKinds,
  WhiteboardStrokeWidths,
} from "../../lib/models/WhiteboardNodes";
import upsertWhiteboardNodes from "../../methods/upsertWhiteboardNodes";
import { InkPointPattern, upsertNodes } from "../whiteboardEdits";
import defineMethod from "./defineMethod";

const NodeInputPattern = {
  _id: String,
  type: Match.Optional(Match.OneOf(...WhiteboardNodeKinds)),
  puzzle: Match.Optional(String),
  position: Match.Optional({ x: Number, y: Number }),
  parent: Match.Optional(Match.OneOf(String, null)),
  width: Match.Optional(Number),
  height: Match.Optional(Number),
  hidden: Match.Optional(Boolean),
  collapsed: Match.Optional(Boolean),
  locked: Match.Optional(Boolean),
  text: Match.Optional(Match.OneOf(String, null)),
  label: Match.Optional(Match.OneOf(String, null)),
  color: Match.Optional(Match.OneOf(...WhiteboardColors, null)),
  points: Match.Optional([InkPointPattern]),
  strokeWidth: Match.Optional(Match.OneOf(...WhiteboardStrokeWidths)),
  stroke: Match.Optional(String),
  image: Match.Optional({ url: String, width: Number, height: Number }),
};

defineMethod(upsertWhiteboardNodes, {
  validate(arg) {
    check(arg, { boardId: String, nodes: [NodeInputPattern] });
    return arg;
  },

  async run({ boardId, nodes }) {
    check(this.userId, String);
    await upsertNodes(this.userId, boardId, nodes);
  },
});
