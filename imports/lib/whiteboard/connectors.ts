export interface XY {
  x: number;
  y: number;
}

export interface Box extends XY {
  width: number;
  height: number;
}

// Rotates `point` about `origin` to the nearest multiple of `step` degrees,
// keeping its distance, for drawing lines at tidy angles.
export function snapAngle(origin: XY, point: XY, step = 15): XY {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return { ...point };
  const radians = (step * Math.PI) / 180;
  const angle = Math.round(Math.atan2(dy, dx) / radians) * radians;
  return {
    x: origin.x + Math.cos(angle) * length,
    y: origin.y + Math.sin(angle) * length,
  };
}

export function contains(box: Box, point: XY): boolean {
  return (
    point.x >= box.x &&
    point.y >= box.y &&
    point.x <= box.x + box.width &&
    point.y <= box.y + box.height
  );
}

// Whether a point inside a box is within `tolerance` of its edge. Lines only
// attach to frames by their border, so drawing inside a frame stays free.
export function nearBorder(box: Box, point: XY, tolerance: number): boolean {
  if (!contains(box, point)) return false;
  return (
    point.x - box.x <= tolerance ||
    point.y - box.y <= tolerance ||
    box.x + box.width - point.x <= tolerance ||
    box.y + box.height - point.y <= tolerance
  );
}

export interface AttachHit {
  // On the box itself (for a frame, on its border) rather than just outside.
  inside: boolean;
  // How far outside the box the point is; 0 when inside.
  distance: number;
}

// Whether a line end at `point` would attach to `box`: anywhere on it, or
// within `margin` of its edge, so aiming at an edge still catches it. Frames
// only take lines by their border (within `margin` either side), so a line
// drawn inside one stays free.
export function attachHit(
  box: Box,
  point: XY,
  margin: number,
  frame: boolean,
): AttachHit | undefined {
  const dx = Math.max(box.x - point.x, 0, point.x - (box.x + box.width));
  const dy = Math.max(box.y - point.y, 0, point.y - (box.y + box.height));
  const distance = Math.hypot(dx, dy);
  if (distance > margin) return undefined;
  if (distance > 0) return { inside: false, distance };
  if (frame && !nearBorder(box, point, margin)) return undefined;
  return { inside: true, distance: 0 };
}

// Orders candidate attachments, best first: something the point is actually
// on beats a near miss; then the topmost, or for near misses the closest.
export function compareAttachHits(
  a: AttachHit & { z: number; order: number },
  b: AttachHit & { z: number; order: number },
): number {
  if (a.inside !== b.inside) return a.inside ? -1 : 1;
  if (!a.inside && a.distance !== b.distance) return a.distance - b.distance;
  return b.z - a.z || b.order - a.order;
}
