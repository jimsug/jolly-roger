import type { XYPosition } from "@xyflow/react";
import type { WhiteboardStrokeWidth } from "../../../lib/models/WhiteboardNodes";
import { CARD_HEIGHT, CARD_WIDTH } from "../../../lib/whiteboard/layout";

// The canvas's tools, which key picks each, and what the placing tools put
// on the board.

export type PlaceTool = "sticky" | "text" | "frame" | "shape";
export type Tool =
  | "select"
  | "pen"
  | "eraser"
  | "connector"
  | "comment"
  | PlaceTool;

export const isPlaceTool = (tool: Tool): tool is PlaceTool =>
  tool === "sticky" || tool === "text" || tool === "frame" || tool === "shape";

// The key that picks each tool, and the pen widths' keys.
export const TOOL_KEYS: Record<Tool, string> = {
  select: "V",
  pen: "P",
  eraser: "E",
  connector: "L",
  sticky: "S",
  text: "T",
  frame: "F",
  shape: "R",
  comment: "C",
};
export const TOOLS_BY_KEY = new Map(
  (Object.entries(TOOL_KEYS) as [Tool, string][]).map(([tool, key]) => [
    key.toLowerCase(),
    tool,
  ]),
);
export const PEN_WIDTH_KEYS = new Map<string, WhiteboardStrokeWidth>([
  ["1", "thin"],
  ["2", "medium"],
  ["3", "thick"],
  ["4", "marker"],
]);

// Size when placed with a click; dragging out a box sets the size instead.
export const DEFAULT_SIZES: Record<
  PlaceTool,
  { width: number; height: number }
> = {
  sticky: { width: 200, height: 160 },
  text: { width: 240, height: 48 },
  frame: { width: 2 * CARD_WIDTH + 64, height: 2 * CARD_HEIGHT + 104 },
  shape: { width: 160, height: 120 },
};

// How far a duplicate lands from what it copies, right and down. Several
// images added at once are spread out by the same.
export const DUPLICATE_OFFSET = { x: 24, y: 24 };

// A box of `size` with its middle at `at`, at whole board units.
export const centeredRect = (
  at: XYPosition,
  size: { width: number; height: number },
) => ({
  x: Math.round(at.x - size.width / 2),
  y: Math.round(at.y - size.height / 2),
  ...size,
});
