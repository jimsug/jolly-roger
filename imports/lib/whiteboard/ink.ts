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
};

// Samples closer than this to the last kept point add nothing visible.
const MIN_POINT_DISTANCE = 0.5;
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

// SVG path for a stroke's filled outline.
export function inkPath(
  points: InkPoint[],
  strokeWidth: WhiteboardStrokeWidth,
  complete: boolean,
): string {
  if (points.length === 0) return "";
  const outline = getStroke(points, {
    size: STROKE_SIZES[strokeWidth],
    thinning: 0.5,
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

// Distance from a point to the nearest sample in a stroke. Good enough for
// hit-testing the eraser, since samples are at most a few units apart.
export function distanceToInk(
  points: InkPoint[],
  x: number,
  y: number,
): number {
  let best = Number.POSITIVE_INFINITY;
  points.forEach(([px, py]) => {
    best = Math.min(best, Math.hypot(px - x, py - y));
  });
  return best;
}
