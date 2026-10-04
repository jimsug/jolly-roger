import { check, Match } from "meteor/check";
import {
  WhiteboardArrowHeads,
  WhiteboardPathStyles,
} from "../../lib/models/WhiteboardEdges";
import { WhiteboardColors } from "../../lib/models/WhiteboardNodes";
import upsertWhiteboardEdges from "../../methods/upsertWhiteboardEdges";
import { upsertEdges } from "../whiteboardEdits";
import defineMethod from "./defineMethod";

const EdgeInputPattern = {
  _id: String,
  source: Match.Optional(String),
  target: Match.Optional(String),
  label: Match.Optional(Match.OneOf(String, null)),
  pathStyle: Match.Optional(Match.OneOf(...WhiteboardPathStyles)),
  arrowHead: Match.Optional(Match.OneOf(...WhiteboardArrowHeads)),
  color: Match.Optional(Match.OneOf(...WhiteboardColors)),
  dashed: Match.Optional(Boolean),
  hidden: Match.Optional(Boolean),
};

defineMethod(upsertWhiteboardEdges, {
  validate(arg) {
    check(arg, { boardId: String, edges: [EdgeInputPattern] });
    return arg;
  },

  async run({ boardId, edges }) {
    check(this.userId, String);
    await upsertEdges(this.userId, boardId, edges);
  },
});
