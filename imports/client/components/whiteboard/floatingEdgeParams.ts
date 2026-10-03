import type { InternalNode, XYPosition } from "@xyflow/react";
import { Position } from "@xyflow/react";
import { centerOf } from "../../../lib/whiteboard/connectors";
import type { Rect } from "../../../lib/whiteboard/layout";

// The size a node is drawn at; its measured size can lag a render behind a
// change from elsewhere.
export function boxOf(node: InternalNode): Rect {
  return {
    ...node.internals.positionAbsolute,
    width: node.width ?? node.measured.width ?? 0,
    height: node.height ?? node.measured.height ?? 0,
  };
}

const area = (box: Rect) => box.width * box.height;

const strictlyInside = (box: Rect, point: XYPosition) =>
  point.x > box.x &&
  point.y > box.y &&
  point.x < box.x + box.width &&
  point.y < box.y + box.height;

// Where a ray from the box's centre towards `toward` crosses its border.
function exitPoint(box: Rect, toward: XYPosition): XYPosition {
  const w = box.width / 2;
  const h = box.height / 2;
  const c = centerOf(box);
  if (w === 0 || h === 0) return c;
  const xx = (toward.x - c.x) / (2 * w) - (toward.y - c.y) / (2 * h);
  const yy = (toward.x - c.x) / (2 * w) + (toward.y - c.y) / (2 * h);
  const a = 1 / (Math.abs(xx) + Math.abs(yy) || 1);
  return { x: w * (a * xx + a * yy) + c.x, y: h * (-a * xx + a * yy) + c.y };
}

// The point on the box's border nearest a point inside it.
function nearestBorderPoint(box: Rect, inside: XYPosition): XYPosition {
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

function sideOf(box: Rect, point: XYPosition, other: XYPosition): Position {
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
  const sourceRect = boxOf(source);
  const targetRect = boxOf(target);
  const sourceCenter = centerOf(sourceRect);
  const targetCenter = centerOf(targetRect);
  const sourceFree = source.type === "point";
  const targetFree = target.type === "point";

  // When each box covers the other's centre, the bigger one is the outer.
  const sourceOuter = !sourceFree && strictlyInside(sourceRect, targetCenter);
  const targetOuter = !targetFree && strictlyInside(targetRect, sourceCenter);

  let sourcePoint: XYPosition;
  let targetPoint: XYPosition;
  if (sourceOuter && (!targetOuter || area(sourceRect) >= area(targetRect))) {
    sourcePoint = nearestBorderPoint(sourceRect, targetCenter);
    targetPoint = targetFree
      ? targetCenter
      : exitPoint(targetRect, sourcePoint);
  } else if (targetOuter) {
    targetPoint = nearestBorderPoint(targetRect, sourceCenter);
    sourcePoint = sourceFree
      ? sourceCenter
      : exitPoint(sourceRect, targetPoint);
  } else {
    sourcePoint = sourceFree
      ? sourceCenter
      : exitPoint(sourceRect, targetCenter);
    targetPoint = targetFree
      ? targetCenter
      : exitPoint(targetRect, sourceCenter);
  }

  return {
    sourceX: sourcePoint.x,
    sourceY: sourcePoint.y,
    targetX: targetPoint.x,
    targetY: targetPoint.y,
    sourcePosition: sideOf(
      sourceFree ? { ...sourcePoint, width: 0, height: 0 } : sourceRect,
      sourcePoint,
      targetPoint,
    ),
    targetPosition: sideOf(
      targetFree ? { ...targetPoint, width: 0, height: 0 } : targetRect,
      targetPoint,
      sourcePoint,
    ),
  };
}
