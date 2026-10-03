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

export interface AttachHit {
  // On the thing itself rather than near it. A frame is never "on": lines
  // attach to its border, which counts as near.
  inside: boolean;
  // How far the point is from the thing (for a frame, from its border); 0
  // when inside.
  distance: number;
}

// Whether a line end at `point` would attach to `box`: anywhere on it, or
// within `margin` of its edge, so aiming at an edge still catches it. Frames
// only take lines by their border (within `margin` either side), so a line
// drawn well inside one stays free.
export function attachHit(
  box: Box,
  point: XY,
  margin: number,
  frame: boolean,
): AttachHit | undefined {
  const dx = Math.max(box.x - point.x, 0, point.x - (box.x + box.width));
  const dy = Math.max(box.y - point.y, 0, point.y - (box.y + box.height));
  const outside = Math.hypot(dx, dy);
  if (outside > margin) return undefined;
  if (!frame) {
    return outside > 0
      ? { inside: false, distance: outside }
      : { inside: true, distance: 0 };
  }
  const toBorder =
    outside > 0
      ? outside
      : Math.min(
          point.x - box.x,
          point.y - box.y,
          box.x + box.width - point.x,
          box.y + box.height - point.y,
        );
  return toBorder <= margin ? { inside: false, distance: toBorder } : undefined;
}

// Orders candidate attachments, best first: something the point is on beats
// anything it's only near; then the topmost of those it's on, or the closest
// of those it's near (frame borders included), then the topmost.
export function compareAttachHits(
  a: AttachHit & { z: number; order: number },
  b: AttachHit & { z: number; order: number },
): number {
  if (a.inside !== b.inside) return a.inside ? -1 : 1;
  if (!a.inside && a.distance !== b.distance) return a.distance - b.distance;
  return b.z - a.z || b.order - a.order;
}
