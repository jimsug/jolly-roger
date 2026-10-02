import type {
  WhiteboardArrowHead,
  WhiteboardPathStyle,
} from "../lib/models/WhiteboardEdges";
import type { WhiteboardColour } from "../lib/models/WhiteboardNodes";
import TypedMethod from "./TypedMethod";

export type WhiteboardEdgeInput = {
  _id: string;
  source?: string;
  target?: string;
  label?: string | null;
  pathStyle?: WhiteboardPathStyle;
  arrowHead?: WhiteboardArrowHead;
  colour?: WhiteboardColour;
  dashed?: boolean;
};

export default new TypedMethod<
  { boardId: string; edges: WhiteboardEdgeInput[] },
  void
>("Whiteboards.methods.upsertEdges");
