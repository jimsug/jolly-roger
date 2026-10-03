import { check, Match } from "meteor/check";
import {
  WhiteboardColors,
  WhiteboardNodeKinds,
  WhiteboardStrokeWidths,
} from "../../lib/models/WhiteboardNodes";
import type { WhiteboardNodeInput } from "../../methods/upsertWhiteboardNodes";
import upsertWhiteboardNodes from "../../methods/upsertWhiteboardNodes";
import { upsertNodes } from "../whiteboardEdits";
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
  text: Match.Optional(Match.OneOf(String, null)),
  label: Match.Optional(Match.OneOf(String, null)),
  colour: Match.Optional(Match.OneOf(...WhiteboardColors)),
  points: Match.Optional([[Number]]),
  strokeWidth: Match.Optional(Match.OneOf(...WhiteboardStrokeWidths)),
  stroke: Match.Optional(String),
};

defineMethod(upsertWhiteboardNodes, {
  validate(arg) {
    check(arg, { boardId: String, nodes: [NodeInputPattern] });
    // Ink point arity is checked when the nodes are applied.
    return arg as { boardId: string; nodes: WhiteboardNodeInput[] };
  },

  async run({ boardId, nodes }) {
    check(this.userId, String);
    await upsertNodes(this.userId, boardId, nodes);
  },
});
