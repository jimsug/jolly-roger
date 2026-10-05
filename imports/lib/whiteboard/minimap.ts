import type {
  WhiteboardColor,
  WhiteboardNodeType,
} from "../models/WhiteboardNodes";
import type { Solvedness } from "../solvedness";

export interface MiniMapPalette {
  // A strong colour for each state, so cards stand out at mini map size.
  solvedness: Record<Solvedness, string>;
  // The board's colours, as #rrggbb, for frames.
  frames: Record<WhiteboardColor, string>;
}

// A frame's colour on the mini map, faint enough that the cards inside show.
const FRAME_ALPHA = "40";
const PLAIN_FRAME = "rgb(128 128 128 / 15%)";
const OTHER = "rgb(128 128 128 / 45%)";

// How a node shows on the mini map: a card in its solvedness colour, a frame
// or a shape in its own colour (both mark out regions, so they're faint),
// free line ends not at all (they're too small to see) and everything else
// in grey.
export function miniMapColor(
  doc: Pick<WhiteboardNodeType, "type" | "puzzle" | "color">,
  palette: MiniMapPalette,
  solvednessOf: (puzzleId: string) => Solvedness | undefined,
): string {
  switch (doc.type) {
    case "point":
      return "transparent";
    case "puzzle": {
      const solvedness = doc.puzzle ? solvednessOf(doc.puzzle) : undefined;
      return solvedness ? palette.solvedness[solvedness] : OTHER;
    }
    case "frame":
    case "shape":
      return doc.color
        ? `${palette.frames[doc.color]}${FRAME_ALPHA}`
        : PLAIN_FRAME;
    default:
      return OTHER;
  }
}
