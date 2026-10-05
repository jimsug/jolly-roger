import type {
  LineStyleField,
  WhiteboardEdgeType,
} from "../models/WhiteboardEdges";
import {
  WhiteboardArrowHeads,
  WhiteboardPathStyles,
} from "../models/WhiteboardEdges";
import { WhiteboardColors } from "../models/WhiteboardNodes";

// A line's style with every field set, as the line tool draws new lines
export type LineStyle = Required<Pick<WhiteboardEdgeType, LineStyleField>>;

// The fork's whiteboard saved the colour under this key.
const FORK_COLOR_KEY = "colour";

const oneOf = <T extends string>(
  value: unknown,
  options: readonly T[],
  fallback: T,
): T => (options.includes(value as T) ? (value as T) : fallback);

// The line tool's style as a browser saved it, whichever build saved it:
// only the style's fields, each from the fallback unless what's saved is a
// value the style can take. The fork's `colour` is read as `color`.
export function lineStyleFrom(saved: unknown, fallback: LineStyle): LineStyle {
  const s = (saved && typeof saved === "object" ? saved : {}) as Record<
    string,
    unknown
  >;
  return {
    pathStyle: oneOf(s.pathStyle, WhiteboardPathStyles, fallback.pathStyle),
    arrowHead: oneOf(s.arrowHead, WhiteboardArrowHeads, fallback.arrowHead),
    color: oneOf(
      s.color ?? s[FORK_COLOR_KEY],
      WhiteboardColors,
      fallback.color,
    ),
    dashed: typeof s.dashed === "boolean" ? s.dashed : fallback.dashed,
  };
}
