import type { WhiteboardColour } from "../../../lib/models/WhiteboardNodes";

// Pastel fills for stickies and frames. Stickies keep dark text on these in
// both themes, like paper.
export const FILL_COLOURS: Record<WhiteboardColour, string> = {
  yellow: "#fff3a3",
  orange: "#ffd8a8",
  red: "#ffc9c9",
  pink: "#fcc2d7",
  purple: "#e5dbff",
  blue: "#d0ebff",
  green: "#d3f9d8",
  grey: "#e9ecef",
  black: "#495057",
};

// Strong colours for ink and text. "black" means the theme's text colour, so
// it stays visible in dark mode.
export const STROKE_COLOURS: Record<WhiteboardColour, string | undefined> = {
  yellow: "#f59f00",
  orange: "#f76707",
  red: "#e03131",
  pink: "#d6336c",
  purple: "#7048e8",
  blue: "#1c7ed6",
  green: "#2f9e44",
  grey: "#868e96",
  black: undefined,
};
