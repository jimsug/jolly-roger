import { getStroke } from "perfect-freehand";
import type { z } from "zod";
import type {
  WhiteboardInkPoint,
  WhiteboardStrokeWidth,
} from "../models/WhiteboardNodes";
import type { Point, Rect } from "./layout";
import { MAX_INK_POINTS } from "./limits";

export type InkPoint = z.infer<typeof WhiteboardInkPoint>;

export const STROKE_SIZES: Record<WhiteboardStrokeWidth, number> = {
  thin: 3,
  medium: 6,
  thick: 12,
  marker: 24,
};

// How opaque a highlighter stroke is drawn, so what's under it shows.
export const MARKER_OPACITY = 0.4;

// Samples closer than this to the last kept point add nothing visible.
const MIN_POINT_DISTANCE = 0.5;
// How far from the stroke as stored a point can be and still be dropped when
// the stroke is saved (see simplifyInk).
export const INK_SIMPLIFY_TOLERANCE = 0.5;
// The most a stroke is drawn between samples. Longer gaps, as simplifying
// leaves along straight runs, are filled in before the outline is worked
// out, so smoothing treats a simplified stroke as it did the drawn one.
const RENDER_SPACING = 4;
// The most points filling in adds to one stroke. Past that the spacing
// widens, so a stroke whose samples are very far apart (anything up to the
// coordinate limit is allowed) still draws in bounded time.
export const MAX_FILLED_POINTS = 2000;
// Each new segment repeats this many points from the end of the previous one
// so the joins overlap.
export const SEGMENT_OVERLAP = 2;

const RATE_OF_PRESSURE_CHANGE = 0.275;

export const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

// Velocity-based pressure for input devices that don't report any, using the
// same formula perfect-freehand applies internally. Computed once at capture
// time and stored, so a stroke renders identically everywhere and however it
// was split. It moves part of the way from the previous point's pressure
// (already between 0 and 1) towards 1 - speed, so it stays in that range.
export function simulatedPressure(
  previous: InkPoint | undefined,
  x: number,
  y: number,
  size: number,
): number {
  if (!previous) return 0.5;
  const distance = Math.hypot(x - previous[0], y - previous[1]);
  const speed = Math.min(1, distance / size);
  return (
    previous[2] + (1 - speed - previous[2]) * (speed * RATE_OF_PRESSURE_CHANGE)
  );
}

function roundPoint([x, y, pressure]: InkPoint): InkPoint {
  return [round1(x), round1(y), round2(Math.min(1, Math.max(0, pressure)))];
}

// Builds a stroke from pointer samples, dropping near-duplicates and handing
// back a finished segment whenever the current one fills up. There's no limit
// on how long a stroke can be, only on how many points each segment holds.
export class InkSegmenter {
  private current: InkPoint[] = [];

  // Returns a full segment when this point completes one.
  push(point: InkPoint): InkPoint[] | undefined {
    const last = this.current.at(-1);
    if (
      last &&
      Math.hypot(point[0] - last[0], point[1] - last[1]) < MIN_POINT_DISTANCE
    ) {
      return undefined;
    }
    this.current.push(roundPoint(point));
    if (this.current.length < MAX_INK_POINTS) return undefined;
    const full = this.current;
    this.current = full.slice(-SEGMENT_OVERLAP);
    return full;
  }

  get points(): InkPoint[] {
    return this.current;
  }

  // The last partial segment. Undefined if it holds nothing new beyond the
  // overlap carried over from a finished segment.
  finish(hasCommittedSegments: boolean): InkPoint[] | undefined {
    const rest = this.current;
    this.current = [];
    if (rest.length === 0) return undefined;
    if (hasCommittedSegments && rest.length <= SEGMENT_OVERLAP) {
      return undefined;
    }
    return rest;
  }
}

// Bounding box with room for the stroke's thickness, so nothing is clipped.
export function inkBounds(points: InkPoint[], size: number): Rect {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs) - size;
  const minY = Math.min(...ys) - size;
  return {
    x: round1(minX),
    y: round1(minY),
    width: round1(Math.max(...xs) + size - minX),
    height: round1(Math.max(...ys) + size - minY),
  };
}

export function relativeTo(points: InkPoint[], origin: Point): InkPoint[] {
  return points.map(([x, y, p]) => [
    round1(x - origin.x),
    round1(y - origin.y),
    p,
  ]);
}

function average(a: number, b: number) {
  return (a + b) / 2;
}

// Distance from (x, y) to the segment from a to b.
function distanceToSegment(
  x: number,
  y: number,
  a: InkPoint,
  b: InkPoint,
): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.min(
          1,
          Math.max(0, ((x - a[0]) * dx + (y - a[1]) * dy) / lengthSquared),
        );
  return Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy));
}

// Ramer-Douglas-Peucker: keeps the first and last points, and between any
// two kept points keeps the one furthest from the segment joining them if
// it's more than tolerance away, until none is. Every dropped point is then
// within tolerance of the simplified stroke. Kept points are unchanged,
// pressure included, and two or more points never become fewer than two.
// Measured to the segment rather than the whole line, so a stroke that
// doubles back keeps its turn.
export function simplifyInk(
  points: InkPoint[],
  tolerance = INK_SIMPLIFY_TOLERANCE,
): InkPoint[] {
  if (points.length <= 2) return points;
  const keep = points.map((_, i) => i === 0 || i === points.length - 1);
  const spans: [number, number][] = [[0, points.length - 1]];
  for (let span = spans.pop(); span; span = spans.pop()) {
    const [first, last] = span;
    const a = points[first]!;
    const b = points[last]!;
    let furthest = -1;
    let distance = tolerance;
    for (let i = first + 1; i < last; i++) {
      const p = points[i]!;
      const d = distanceToSegment(p[0], p[1], a, b);
      if (d > distance) {
        furthest = i;
        distance = d;
      }
    }
    if (furthest !== -1) {
      keep[furthest] = true;
      spans.push([first, furthest], [furthest, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

// How many points the ink among nodes holds, as the per-board budget counts
// them.
export const inkPointCount = (
  nodes: readonly { type?: string; points?: readonly unknown[] }[],
) =>
  nodes.reduce(
    (total, n) => total + (n.type === "ink" ? (n.points?.length ?? 0) : 0),
    0,
  );

// A stroke with points added along any gap longer than RENDER_SPACING, or
// wider spacing if that would add more than MAX_FILLED_POINTS, with pressure
// shading evenly between the samples either side.
export function filledIn(points: InkPoint[]): InkPoint[] {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += Math.hypot(
      points[i]![0] - points[i - 1]![0],
      points[i]![1] - points[i - 1]![1],
    );
  }
  const spacing = Math.max(RENDER_SPACING, length / MAX_FILLED_POINTS);
  const filled: InkPoint[] = [];
  points.forEach((p, i) => {
    const previous = points[i - 1];
    if (previous) {
      const steps = Math.ceil(
        Math.hypot(p[0] - previous[0], p[1] - previous[1]) / spacing,
      );
      for (let step = 1; step < steps; step++) {
        const t = step / steps;
        filled.push([
          previous[0] + (p[0] - previous[0]) * t,
          previous[1] + (p[1] - previous[1]) * t,
          previous[2] + (p[2] - previous[2]) * t,
        ]);
      }
    }
    filled.push(p);
  });
  return filled;
}

// SVG path for a stroke's filled outline.
export function inkPath(
  points: InkPoint[],
  strokeWidth: WhiteboardStrokeWidth,
  complete: boolean,
): string {
  if (points.length === 0) return "";
  const outline = getStroke(filledIn(points), {
    size: STROKE_SIZES[strokeWidth],
    // A highlighter is the same width all the way along, whatever the
    // pressure.
    thinning: strokeWidth === "marker" ? 0 : 0.5,
    smoothing: 0.5,
    streamline: 0.4,
    simulatePressure: false,
    last: complete,
    start: { cap: true, taper: 0 },
    end: { cap: true, taper: 0 },
  });
  if (outline.length < 4) return "";

  const a = outline[0]!;
  const b = outline[1]!;
  const c = outline[2]!;
  let path = `M${a[0].toFixed(2)},${a[1].toFixed(2)} Q${b[0].toFixed(2)},${b[1].toFixed(2)} ${average(b[0], c[0]).toFixed(2)},${average(b[1], c[1]).toFixed(2)} T`;
  for (let i = 2; i < outline.length - 1; i++) {
    const p = outline[i]!;
    const q = outline[i + 1]!;
    path += `${average(p[0], q[0]).toFixed(2)},${average(p[1], q[1]).toFixed(2)} `;
  }
  return `${path}Z`;
}

// Distance from a point to the nearest part of a stroke, between samples as
// well as at them, since a saved stroke can have long straight runs with
// no samples along them.
export function distanceToInk(
  points: InkPoint[],
  x: number,
  y: number,
): number {
  if (points.length === 1) {
    return Math.hypot(points[0]![0] - x, points[0]![1] - y);
  }
  let best = Number.POSITIVE_INFINITY;
  for (let i = 1; i < points.length; i++) {
    best = Math.min(best, distanceToSegment(x, y, points[i - 1]!, points[i]!));
  }
  return best;
}
