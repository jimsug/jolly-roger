import type {
  WhiteboardArrowHead,
  WhiteboardPathStyle,
} from "../../../lib/models/WhiteboardEdges";

const arrow = (x: number, y: number, flip: boolean) =>
  flip ? `M${x} ${y} l4 -3 v6 z` : `M${x} ${y} l-4 -3 v6 z`;

// Small drawings of a line's path and arrowheads for the style controls.
export const PathStyleIcon = ({ kind }: { kind: WhiteboardPathStyle }) => {
  const d = {
    curved: "M2 13 C 8 13, 8 3, 14 3",
    straight: "M2 13 L14 3",
    elbow: "M2 13 H8 V3 H14",
  }[kind];
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
};

export const ArrowHeadIcon = ({ kind }: { kind: WhiteboardArrowHead }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
    <path d="M3 8 H13" stroke="currentColor" strokeWidth="1.6" />
    {kind !== "none" && <path d={arrow(15, 8, false)} fill="currentColor" />}
    {kind === "both" && <path d={arrow(1, 8, true)} fill="currentColor" />}
  </svg>
);

export const DashedIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
    <path
      d="M2 8 H14"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeDasharray="3 2"
    />
  </svg>
);
