import type { WhiteboardColor } from "../../../lib/models/WhiteboardNodes";

// How each of the board's colours is drawn.
const colors = {
  // Pastel fills for stickies and frames. Stickies keep dark text on these in
  // both themes, like paper.
  fill: {
    yellow: "#fff3a3",
    orange: "#ffd8a8",
    red: "#ffc9c9",
    pink: "#fcc2d7",
    purple: "#e5dbff",
    blue: "#d0ebff",
    green: "#d3f9d8",
    gray: "#e9ecef",
    black: "#495057",
  } satisfies Record<WhiteboardColor, string>,

  // Strong colours for ink, text and lines. "black" means the theme's text
  // colour, so it stays visible in dark mode.
  stroke: {
    yellow: "#f59f00",
    orange: "#f76707",
    red: "#e03131",
    pink: "#d6336c",
    purple: "#7048e8",
    blue: "#1c7ed6",
    green: "#2f9e44",
    gray: "#868e96",
    black: undefined,
  } satisfies Record<WhiteboardColor, string | undefined>,
};

export default colors;
