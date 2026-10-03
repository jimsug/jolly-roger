import type {
  LineStyleField,
  WhiteboardEdgeType,
} from "../models/WhiteboardEdges";

// A line's style with every field set, as the line tool draws new lines
export type LineStyle = Required<Pick<WhiteboardEdgeType, LineStyleField>>;
