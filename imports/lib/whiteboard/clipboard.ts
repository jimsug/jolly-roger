import { z } from "zod";
import type { WhiteboardEdgeType } from "../models/WhiteboardEdges";
import {
  WhiteboardArrowHeads,
  WhiteboardPathStyles,
} from "../models/WhiteboardEdges";
import type { WhiteboardNodeType } from "../models/WhiteboardNodes";
import {
  WhiteboardColors,
  WhiteboardInkPoint,
  WhiteboardNodeKinds,
  WhiteboardStrokeWidths,
} from "../models/WhiteboardNodes";
import { centerOf } from "./connectors";
import type { Point, Rect, Size } from "./layout";
import { POINT_SIZE } from "./layout";
import {
  MAX_COORDINATE,
  MAX_DIMENSION,
  MAX_EDGES_PER_BOARD,
  MAX_FRAME_DEPTH,
  MAX_INK_POINTS,
  MAX_LABEL_LENGTH,
  MAX_NODES_PER_BOARD,
  MAX_TEXT_LENGTH,
} from "./limits";

// Copy and paste on the whiteboard. What's copied goes on the clipboard as
// plain text: CLIP_PREFIX, then the copy as JSON. Every node's position is on
// the board, not relative to its frame, and a node's parent, if it has one,
// is another node in the copy. Puzzle cards are never copied (a puzzle has
// one card), nor are comments. An image is copied by its address, so a paste
// shows the same upload.

// Anything starting with this is meant to be a copy from a board, of some
// version.
const CLIP_MARKER = "jolly-roger-whiteboard/";
const CLIP_VERSION = 1;
export const CLIP_PREFIX = `${CLIP_MARKER}${CLIP_VERSION}\n`;

const coordinate = z.number().min(-MAX_COORDINATE).max(MAX_COORDINATE);
const dimension = z.number().positive().max(MAX_DIMENSION);

const ClipNode = z.object({
  id: z.string().min(1),
  type: z.enum(WhiteboardNodeKinds).exclude(["puzzle"]),
  parent: z.string().min(1).optional(),
  x: coordinate,
  y: coordinate,
  width: dimension.optional(),
  height: dimension.optional(),
  text: z.string().max(MAX_TEXT_LENGTH).optional(),
  label: z.string().max(MAX_LABEL_LENGTH).optional(),
  color: z.enum(WhiteboardColors).optional(),
  points: WhiteboardInkPoint.array().min(1).max(MAX_INK_POINTS).optional(),
  strokeWidth: z.enum(WhiteboardStrokeWidths).optional(),
  stroke: z.string().min(1).optional(),
  collapsed: z.boolean().optional(),
  image: z
    .object({
      url: z.string().min(1),
      width: dimension,
      height: dimension,
    })
    .optional(),
});
type ClipNode = z.infer<typeof ClipNode>;

const ClipEdge = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  label: z.string().max(MAX_LABEL_LENGTH).optional(),
  pathStyle: z.enum(WhiteboardPathStyles).optional(),
  arrowHead: z.enum(WhiteboardArrowHeads).optional(),
  color: z.enum(WhiteboardColors).optional(),
  dashed: z.boolean().optional(),
});
type ClipEdge = z.infer<typeof ClipEdge>;

const BoardClip = z.object({
  nodes: ClipNode.array().max(MAX_NODES_PER_BOARD),
  edges: ClipEdge.array().max(MAX_EDGES_PER_BOARD),
});
export type BoardClip = z.infer<typeof BoardClip>;

// What's copied as it is, from a node or a line.
const NODE_FIELDS = [
  "width",
  "height",
  "text",
  "label",
  "color",
  "points",
  "strokeWidth",
  "image",
] as const;
const EDGE_FIELDS = [
  "label",
  "pathStyle",
  "arrowHead",
  "color",
  "dashed",
] as const;

// Copies each of keys from `from` to `to`, skipping any that are undefined.
function setFields<T extends object>(
  to: Partial<T>,
  from: Partial<T>,
  keys: readonly (keyof T)[],
) {
  keys.forEach((key) => {
    if (from[key] !== undefined) to[key] = from[key];
  });
}

function addTo<T>(map: Map<string, T[]>, key: string, item: T) {
  const list = map.get(key);
  if (list) {
    list.push(item);
  } else {
    map.set(key, [item]);
  }
}

type SourceNode = Pick<
  WhiteboardNodeType,
  | "_id"
  | "type"
  | "parent"
  | "position"
  | "width"
  | "height"
  | "hidden"
  | "text"
  | "label"
  | "color"
  | "points"
  | "strokeWidth"
  | "stroke"
  | "collapsed"
  | "image"
>;
type SourceEdge = Pick<
  WhiteboardEdgeType,
  | "_id"
  | "source"
  | "target"
  | "label"
  | "hidden"
  | "auto"
  | "pathStyle"
  | "arrowHead"
  | "color"
  | "dashed"
>;

// What a selection copies, out of every node and line on the board:
// - the selected nodes, everything inside a selected frame, and every
//   segment of a selected ink stroke
// - the hand-drawn lines with both ends among those, or free, as long as
//   one end is among them or the line itself is selected
// - the free ends those lines use, and no others
// Puzzle cards are left out, and counted in cards. labelOf gives a frame's
// label as shown, since a round's frame shows its tag's name.
export function copySelection<N extends SourceNode>(
  nodes: readonly N[],
  edges: readonly SourceEdge[],
  selected: { nodes: Iterable<string>; edges: Iterable<string> },
  labelOf: (frame: N) => string | undefined = (frame) => frame.label,
): { clip: BoardClip; cards: number } {
  const byId = new Map(
    nodes.filter((n) => !n.hidden).map((n) => [n._id, n] as const),
  );
  const children = new Map<string, N[]>();
  const strokes = new Map<string, N[]>();
  byId.forEach((n) => {
    if (n.parent) addTo(children, n.parent, n);
    if (n.stroke) addTo(strokes, n.stroke, n);
  });

  // The selection, with what's in its frames and the rest of its strokes.
  const reached = new Set<string>();
  const queue = [...selected.nodes].filter((id) => byId.has(id));
  while (queue.length > 0) {
    const id = queue.pop();
    const node = id === undefined ? undefined : byId.get(id);
    if (!node || reached.has(node._id)) continue;
    reached.add(node._id);
    if (node.type === "frame") {
      queue.push(...(children.get(node._id) ?? []).map((n) => n._id));
    }
    if (node.stroke) {
      queue.push(...(strokes.get(node.stroke) ?? []).map((n) => n._id));
    }
  }

  let cards = 0;
  const copied = new Set<string>();
  reached.forEach((id) => {
    const type = byId.get(id)?.type;
    if (type === "puzzle") {
      cards += 1;
    } else if (type !== "point") {
      copied.add(id);
    }
  });

  const isFreeEnd = (id: string) => byId.get(id)?.type === "point";
  const selectedEdges = new Set(selected.edges);
  const lines = edges.filter(
    (e) =>
      !e.auto &&
      !e.hidden &&
      [e.source, e.target].every((end) => copied.has(end) || isFreeEnd(end)) &&
      (reached.has(e.source) ||
        reached.has(e.target) ||
        selectedEdges.has(e._id)),
  );
  lines.forEach((e) => {
    [e.source, e.target].forEach((end) => {
      if (isFreeEnd(end)) copied.add(end);
    });
  });

  const absoluteOf = (node: N): Point => {
    let { x, y } = node.position;
    let parent = node.parent ? byId.get(node.parent) : undefined;
    for (let i = 0; parent && i < MAX_FRAME_DEPTH; i++) {
      x += parent.position.x;
      y += parent.position.y;
      parent = parent.parent ? byId.get(parent.parent) : undefined;
    }
    return { x, y };
  };

  const clipNodes = [...copied].flatMap((id): ClipNode[] => {
    const node = byId.get(id);
    if (!node || node.type === "puzzle") return [];
    const copy: ClipNode = { id, type: node.type, ...absoluteOf(node) };
    if (node.parent && copied.has(node.parent)) copy.parent = node.parent;
    if (node.type !== "point" && node.width !== undefined) {
      copy.width = node.width;
    }
    if (node.type !== "point" && node.height !== undefined) {
      copy.height = node.height;
    }
    if (node.type === "frame") {
      const label = labelOf(node);
      if (label !== undefined) copy.label = label;
      if (node.collapsed) copy.collapsed = true;
    }
    if (node.text !== undefined) copy.text = node.text;
    if (node.color !== undefined) copy.color = node.color;
    if (node.points !== undefined) copy.points = node.points;
    if (node.strokeWidth !== undefined) copy.strokeWidth = node.strokeWidth;
    if (node.stroke !== undefined) copy.stroke = node.stroke;
    if (node.image !== undefined) {
      const { url, width, height } = node.image;
      copy.image = { url, width, height };
    }
    return [copy];
  });

  const clipEdges = lines.map((e) => {
    const edge: ClipEdge = { source: e.source, target: e.target };
    setFields(edge, e, EDGE_FIELDS);
    return edge;
  });

  return {
    clip: { nodes: clipNodes, edges: clipEdges },
    cards,
  };
}

export const clipText = (clip: BoardClip) =>
  `${CLIP_PREFIX}${JSON.stringify(clip)}`;

// Whether text is a copy from a board, readable or not.
export const looksLikeClip = (text: string) => text.startsWith(CLIP_MARKER);

// Whether every reference in a clip is to something in it: parents are
// frames, with no loops, and lines join two different nodes.
function holdsTogether(clip: BoardClip): boolean {
  const byId = new Map(clip.nodes.map((n) => [n.id, n]));
  if (byId.size !== clip.nodes.length) return false;
  const nodesOk = clip.nodes.every((node) => {
    if (node.type === "ink" && (!node.points || !node.strokeWidth)) {
      return false;
    }
    if (
      node.type === "image"
        ? !node.image || node.width === undefined || node.height === undefined
        : node.image !== undefined
    ) {
      return false;
    }
    let parent = node.parent;
    for (let depth = 0; parent !== undefined; depth++) {
      const frame = byId.get(parent);
      if (frame?.type !== "frame" || depth >= MAX_FRAME_DEPTH) return false;
      parent = frame.parent;
    }
    return true;
  });
  return (
    nodesOk &&
    clip.edges.every(
      (e) => e.source !== e.target && byId.has(e.source) && byId.has(e.target),
    )
  );
}

// The copy in text taken off the clipboard, or undefined if it isn't one
// this version can read.
export function readClip(text: string): BoardClip | undefined {
  if (!text.startsWith(CLIP_PREFIX)) return undefined;
  let json: unknown;
  try {
    json = JSON.parse(text.slice(CLIP_PREFIX.length));
  } catch {
    return undefined;
  }
  const parsed = BoardClip.safeParse(json);
  if (!parsed.success || !holdsTogether(parsed.data)) return undefined;
  return parsed.data;
}

// Ordinary text pasted onto the board, as a copy of one node at 0, 0: a
// single web address becomes a text box with the link, anything else a
// sticky note, trimmed and cut to the longest note there can be. Blank text
// is nothing.
export function clipFromText(
  text: string,
  sizes: { sticky: Size; text: Size },
): BoardClip | undefined {
  const trimmed = text.trim().slice(0, MAX_TEXT_LENGTH).trim();
  if (!trimmed) return undefined;
  const link = isWebAddress(trimmed);
  const size = link ? sizes.text : sizes.sticky;
  return {
    nodes: [
      {
        id: "pasted",
        type: link ? "text" : "sticky",
        x: 0,
        y: 0,
        ...size,
        text: trimmed,
        ...(link ? {} : { color: "yellow" }),
      },
    ],
    edges: [],
  };
}

function isWebAddress(text: string): boolean {
  if (/\s/.test(text)) return false;
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

const sizeOf = (node: ClipNode): Size =>
  node.type === "point"
    ? { width: POINT_SIZE, height: POINT_SIZE }
    : { width: node.width ?? 0, height: node.height ?? 0 };

// The box round everything in a clip, on the board.
export function clipBounds(clip: BoardClip): Rect | undefined {
  if (clip.nodes.length === 0) return undefined;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  clip.nodes.forEach((node) => {
    const { width, height } = sizeOf(node);
    left = Math.min(left, node.x);
    top = Math.min(top, node.y);
    right = Math.max(right, node.x + width);
    bottom = Math.max(bottom, node.y + height);
  });
  return { x: left, y: top, width: right - left, height: bottom - top };
}

// How far to move a clip so the middle of it lands on a point, in whole
// units, so what's in it keeps its exact layout.
export function offsetToCentre(clip: BoardClip, centre: Point): Point {
  const bounds = clipBounds(clip);
  if (!bounds) return { x: 0, y: 0 };
  const middle = centerOf(bounds);
  return {
    x: Math.round(centre.x - middle.x),
    y: Math.round(centre.y - middle.y),
  };
}

// The frame already on the board that something landing with its middle at
// a point goes into, with the frame's box on the board, or undefined for the
// top level.
type PlaceAt = (point: Point) => { id: string; rect: Rect } | undefined;

// What a paste sends, in the shape of the node and line inputs.
interface PastedNode {
  _id: string;
  type: ClipNode["type"];
  position: Point;
  parent: string | null;
  width?: number;
  height?: number;
  text?: string;
  label?: string;
  color?: ClipNode["color"];
  points?: [number, number, number][];
  strokeWidth?: ClipNode["strokeWidth"];
  stroke?: string;
  collapsed?: boolean;
  image?: ClipNode["image"];
}
interface PastedEdge extends ClipEdge {
  _id: string;
}

// The nodes and lines that paste a clip moved by offset, all with fresh ids
// from newId. Anything at the top of the clip goes where placeAt puts its
// middle; an ink stroke goes as one, by the middle of the whole stroke. Free
// ends no line uses are left out.
export function pasteClip(
  clip: BoardClip,
  offset: Point,
  placeAt: PlaceAt,
  newId: () => string,
): { nodes: PastedNode[]; edges: PastedEdge[] } {
  const used = new Set(clip.edges.flatMap((e) => [e.source, e.target]));
  const nodes = clip.nodes.filter((n) => n.type !== "point" || used.has(n.id));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const ids = new Map(nodes.map((n) => [n.id, newId()]));
  const strokeIds = new Map<string, string>();
  nodes.forEach((n) => {
    if (n.stroke && !strokeIds.has(n.stroke)) {
      strokeIds.set(n.stroke, newId());
    }
  });

  // The top of the clip in units that land together: a stroke's segments,
  // or one node.
  const units = new Map<string, ClipNode[]>();
  nodes.forEach((n) => {
    if (n.parent && byId.has(n.parent)) return;
    const key = n.type === "ink" && n.stroke ? `stroke:${n.stroke}` : n.id;
    units.set(key, [...(units.get(key) ?? []), n]);
  });
  const landing = new Map<string, ReturnType<PlaceAt>>();
  units.forEach((members) => {
    const bounds = clipBounds({ nodes: members, edges: [] });
    const frame = bounds
      ? placeAt(
          centerOf({
            ...bounds,
            x: bounds.x + offset.x,
            y: bounds.y + offset.y,
          }),
        )
      : undefined;
    members.forEach((n) => landing.set(n.id, frame));
  });

  const pastedNodes = nodes.map((n): PastedNode => {
    const inClip = n.parent ? byId.get(n.parent) : undefined;
    const frame = inClip ? undefined : landing.get(n.id);
    const position = inClip
      ? { x: n.x - inClip.x, y: n.y - inClip.y }
      : {
          x: n.x + offset.x - (frame?.rect.x ?? 0),
          y: n.y + offset.y - (frame?.rect.y ?? 0),
        };
    const parent = inClip ? ids.get(inClip.id) : frame?.id;
    const pasted: PastedNode = {
      _id: ids.get(n.id) ?? newId(),
      type: n.type,
      position,
      parent: parent ?? null,
    };
    setFields(pasted, n, NODE_FIELDS);
    if (n.stroke !== undefined) pasted.stroke = strokeIds.get(n.stroke);
    if (n.collapsed) pasted.collapsed = true;
    return pasted;
  });

  const pastedEdges = clip.edges.flatMap((e): PastedEdge[] => {
    const source = ids.get(e.source);
    const target = ids.get(e.target);
    if (!source || !target) return [];
    return [{ ...e, _id: newId(), source, target }];
  });

  return { nodes: pastedNodes, edges: pastedEdges };
}
