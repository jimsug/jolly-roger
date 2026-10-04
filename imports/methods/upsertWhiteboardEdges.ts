import type {
  WhiteboardArrowHead,
  WhiteboardPathStyle,
} from "../lib/models/WhiteboardEdges";
import type { WhiteboardColor } from "../lib/models/WhiteboardNodes";
import TypedMethod from "./TypedMethod";

export type WhiteboardEdgeInput = {
  _id: string;
  source?: string;
  target?: string;
  label?: string | null;
  pathStyle?: WhiteboardPathStyle;
  arrowHead?: WhiteboardArrowHead;
  color?: WhiteboardColor;
  dashed?: boolean;
  // Only false, which puts back a feeder arrow someone deleted. Nothing else
  // can be hidden or unhidden from here.
  hidden?: boolean;
};

export default new TypedMethod<
  { boardId: string; edges: WhiteboardEdgeInput[] },
  void
>("Whiteboards.methods.upsertEdges");
