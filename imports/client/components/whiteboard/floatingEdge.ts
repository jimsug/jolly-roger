import type { InternalNode, XYPosition } from "@xyflow/react";
import { Position } from "@xyflow/react";

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

// The size a node is drawn at; its measured size can lag a render behind a
// change from elsewhere.
function boxOf(node: InternalNode): Box {
  return {
    ...node.internals.positionAbsolute,
    width: node.width ?? node.measured.width ?? 0,
    height: node.height ?? node.measured.height ?? 0,
  };
}

const centreOf = (box: Box) => ({
  x: box.x + box.width / 2,
  y: box.y + box.height / 2,
});

const strictlyInside = (box: Box, point: XYPosition) =>
  point.x > box.x &&
  point.y > box.y &&
  point.x < box.x + box.width &&
  point.y < box.y + box.height;

// Where a ray from the box's centre towards `toward` crosses its border.
function exitPoint(box: Box, toward: XYPosition): XYPosition {
  const w = box.width / 2;
  const h = box.height / 2;
  const c = centreOf(box);
  if (w === 0 || h === 0) return c;
  const xx = (toward.x - c.x) / (2 * w) - (toward.y - c.y) / (2 * h);
  const yy = (toward.x - c.x) / (2 * w) + (toward.y - c.y) / (2 * h);
  const a = 1 / (Math.abs(xx) + Math.abs(yy) || 1);
  return { x: w * (a * xx + a * yy) + c.x, y: h * (-a * xx + a * yy) + c.y };
}

// The point on the box's border nearest a point inside it.
function nearestBorderPoint(box: Box, inside: XYPosition): XYPosition {
  const distances = [
    { d: inside.x - box.x, p: { x: box.x, y: inside.y } },
    {
      d: box.x + box.width - inside.x,
      p: { x: box.x + box.width, y: inside.y },
    },
    { d: inside.y - box.y, p: { x: inside.x, y: box.y } },
    {
      d: box.y + box.height - inside.y,
      p: { x: inside.x, y: box.y + box.height },
    },
  ];
  return distances.reduce((best, c) => (c.d < best.d ? c : best)).p;
}

function sideOf(box: Box, point: XYPosition, other: XYPosition): Position {
  if (box.width === 0 || box.height === 0 || strictlyInside(box, point)) {
    // A free end (or a point inside its node): face the other end.
    const dx = other.x - point.x;
    const dy = other.y - point.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
      return dx >= 0 ? Position.Right : Position.Left;
    }
    return dy >= 0 ? Position.Bottom : Position.Top;
  }
  if (Math.round(point.x) <= Math.round(box.x + 1)) return Position.Left;
  if (Math.round(point.x) >= Math.round(box.x + box.width - 1)) {
    return Position.Right;
  }
  if (Math.round(point.y) <= Math.round(box.y + 1)) return Position.Top;
  return Position.Bottom;
}

// Arrows that leave and arrive at whichever side faces the other end, rather
// than at fixed handles. A line's free end is a point, so the line goes right
// to its centre. When one end sits inside the other (a frame's border to
// something in the frame), the outer end attaches at the border nearest the
// inner one rather than on the far side.
export default function floatingEdgeParams(
  source: InternalNode,
  target: InternalNode,
) {
  const sourceBox = boxOf(source);
  const targetBox = boxOf(target);
  const sourceCentre = centreOf(sourceBox);
  const targetCentre = centreOf(targetBox);
  const sourceFree = source.type === "point";
  const targetFree = target.type === "point";

  // When each box covers the other's centre, the bigger one is the outer.
  const area = (box: Box) => box.width * box.height;
  const sourceOuter = !sourceFree && strictlyInside(sourceBox, targetCentre);
  const targetOuter = !targetFree && strictlyInside(targetBox, sourceCentre);

  let sourcePoint: XYPosition;
  let targetPoint: XYPosition;
  if (sourceOuter && (!targetOuter || area(sourceBox) >= area(targetBox))) {
    sourcePoint = nearestBorderPoint(sourceBox, targetCentre);
    targetPoint = targetFree ? targetCentre : exitPoint(targetBox, sourcePoint);
  } else if (targetOuter) {
    targetPoint = nearestBorderPoint(targetBox, sourceCentre);
    sourcePoint = sourceFree ? sourceCentre : exitPoint(sourceBox, targetPoint);
  } else {
    sourcePoint = sourceFree
      ? sourceCentre
      : exitPoint(sourceBox, targetCentre);
    targetPoint = targetFree
      ? targetCentre
      : exitPoint(targetBox, sourceCentre);
  }

  return {
    sourceX: sourcePoint.x,
    sourceY: sourcePoint.y,
    targetX: targetPoint.x,
    targetY: targetPoint.y,
    sourcePosition: sideOf(
      sourceFree ? { ...sourcePoint, width: 0, height: 0 } : sourceBox,
      sourcePoint,
      targetPoint,
    ),
    targetPosition: sideOf(
      targetFree ? { ...targetPoint, width: 0, height: 0 } : targetBox,
      targetPoint,
      sourcePoint,
    ),
  };
}
