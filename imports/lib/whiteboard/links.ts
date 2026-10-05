import type { WhiteboardNodeType } from "../models/WhiteboardNodes";
import { MAX_COORDINATE } from "./limits";

// The board's zoom range, which a linked view is held to.
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 2;

// A view of the board: the point at the centre of the screen, and the zoom.
export interface BoardView {
  x: number;
  y: number;
  zoom: number;
}

// Reads a ?v=x,y,zoom link. Anything that isn't three numbers on the board
// at a zoom it allows is ignored.
export function parseBoardView(value: string): BoardView | undefined {
  const parts = value.split(",");
  if (parts.length !== 3 || parts.some((p) => p.trim() === "")) {
    return undefined;
  }
  const [xs, ys, zs] = parts;
  if (xs === undefined || ys === undefined || zs === undefined) {
    return undefined;
  }
  const x = Number(xs);
  const y = Number(ys);
  const zoom = Number(zs);
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(zoom) ||
    Math.abs(x) > MAX_COORDINATE ||
    Math.abs(y) > MAX_COORDINATE ||
    zoom < MIN_ZOOM ||
    zoom > MAX_ZOOM
  ) {
    return undefined;
  }
  return { x, y, zoom };
}

// Writes a view for a ?v= link, to the nearest board unit and hundredth of
// a zoom step.
export function formatBoardView({ x, y, zoom }: BoardView): string {
  const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
  return [Math.round(x), Math.round(y), Math.round(clamped * 100) / 100].join(
    ",",
  );
}

// Somewhere on the board a link asks to show: a puzzle's card, any node, or
// a view.
export type BoardTarget =
  | { kind: "puzzle"; id: string }
  | { kind: "node"; id: string }
  | ({ kind: "view" } & BoardView);

// The query parameters that name a target, all dropped once it's shown.
export const BOARD_TARGET_PARAMS = ["puzzle", "node", "v"] as const;

// The target a board link's parameters name, if any: a puzzle first, then a
// node, then a view. A ?v= that doesn't parse names nothing.
export function boardTargetFromParams({
  puzzle,
  node,
  v,
}: Partial<Record<(typeof BOARD_TARGET_PARAMS)[number], string>>):
  | BoardTarget
  | undefined {
  if (puzzle) return { kind: "puzzle", id: puzzle };
  if (node) return { kind: "node", id: node };
  const parsed = v ? parseBoardView(v) : undefined;
  return parsed && { kind: "view", ...parsed };
}

// Tells one target from another, so the same link followed twice is shown
// twice.
export function boardTargetKey(target: BoardTarget | undefined): string {
  if (!target) return "";
  return target.kind === "view"
    ? `view:${target.x},${target.y},${target.zoom}`
    : `${target.kind}:${target.id}`;
}

// The query for a "Copy link to here": a card by its puzzle, a frame, sticky
// note, text box or image by its id, and otherwise the view.
export function boardLinkQuery(
  node: Pick<WhiteboardNodeType, "_id" | "type" | "puzzle"> | undefined,
  view: BoardView,
): string {
  if (node?.type === "puzzle" && node.puzzle) {
    return `puzzle=${encodeURIComponent(node.puzzle)}`;
  }
  if (
    node &&
    (node.type === "frame" ||
      node.type === "sticky" ||
      node.type === "text" ||
      node.type === "image")
  ) {
    return `node=${encodeURIComponent(node._id)}`;
  }
  return `v=${formatBoardView(view)}`;
}
