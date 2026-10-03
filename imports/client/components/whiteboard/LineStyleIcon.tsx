import type React from "react";
import type {
  WhiteboardArrowHead,
  WhiteboardPathStyle,
} from "../../../lib/models/WhiteboardEdges";

const arrow = (x: number, y: number, flip: boolean) =>
  flip ? `M${x} ${y} l4 -3 v6 z` : `M${x} ${y} l-4 -3 v6 z`;

const line = <path d="M3 8 H13" stroke="currentColor" strokeWidth="1.6" />;

// Small drawings of a line's path, arrowheads and dashes for the style
// controls.
const SHAPES: Record<
  WhiteboardPathStyle | WhiteboardArrowHead | "dashed",
  React.ReactNode
> = {
  curved: (
    <path
      d="M2 13 C 8 13, 8 3, 14 3"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    />
  ),
  straight: (
    <path d="M2 13 L14 3" fill="none" stroke="currentColor" strokeWidth="1.6" />
  ),
  elbow: (
    <path
      d="M2 13 H8 V3 H14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    />
  ),
  none: line,
  end: (
    <>
      {line}
      <path d={arrow(15, 8, false)} fill="currentColor" />
    </>
  ),
  both: (
    <>
      {line}
      <path d={arrow(15, 8, false)} fill="currentColor" />
      <path d={arrow(1, 8, true)} fill="currentColor" />
    </>
  ),
  dashed: (
    <path
      d="M2 8 H14"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeDasharray="3 2"
    />
  ),
};

const LineStyleIcon = ({
  kind,
}: {
  kind: WhiteboardPathStyle | WhiteboardArrowHead | "dashed";
}) => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
    {SHAPES[kind]}
  </svg>
);

export default LineStyleIcon;
