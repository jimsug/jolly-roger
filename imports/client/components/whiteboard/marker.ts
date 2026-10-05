import type { DefaultTheme } from "styled-components";
import type { WhiteboardStrokeWidth } from "../../../lib/models/WhiteboardNodes";
import { MARKER_OPACITY } from "../../../lib/whiteboard/ink";

// On a saved highlighter stroke's SVG. A node is drawn on a layer of its own,
// where a blend would only meet the node's own empty background, so the
// canvas blends the whole node that holds one with the board under it.
export const MARKER_CLASS = "jr-ink-marker";

// Multiply darkens what's under a highlighter on a light board and screen
// lightens it on a dark one, so what's under it shows through either way.
export const markerBlend = (theme: DefaultTheme): "screen" | "multiply" =>
  theme.basicMode === "dark" ? "screen" : "multiply";

// The fill opacity of a stroke's path: a highlighter's is translucent.
export const strokeOpacity = (width: WhiteboardStrokeWidth) =>
  width === "marker" ? MARKER_OPACITY : undefined;
