import type { XYPosition } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";
import type React from "react";
import type { RefObject } from "react";
import { useCallback } from "react";
import { centerOf, contains } from "../../lib/whiteboard/connectors";
import { MAX_FRAME_DEPTH } from "../../lib/whiteboard/limits";
import type {
  WhiteboardFlowEdge,
  WhiteboardFlowNode,
} from "./useWhiteboardSync";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FrameRect {
  id: string;
  rect: Rect;
}

// Where things are on the board: a node's box as React Flow laid it out
// (or from its own position, mid-drag), which frame is under a point, what
// is inside what, where a box belongs, and a point on screen as a point on
// the board.
export default function useBoardGeometry(
  wrapperRef: RefObject<HTMLDivElement | null>,
) {
  const flow = useReactFlow<WhiteboardFlowNode, WhiteboardFlowEdge>();

  // A node's box on the board as React Flow last laid it out. boxOf takes
  // the laid-out node itself, and liveRect goes by the node's own position.
  const absoluteRect = useCallback(
    (id: string): Rect | undefined => {
      const internal = flow.getInternalNode(id);
      if (!internal) return undefined;
      return {
        ...internal.internals.positionAbsolute,
        width: internal.measured.width ?? internal.width ?? 0,
        height: internal.measured.height ?? internal.height ?? 0,
      };
    },
    [flow],
  );

  // A node's box on the board from its own position, which during a drag is
  // ahead of what React Flow last rendered.
  const liveRect = useCallback(
    (node: WhiteboardFlowNode): Rect => {
      const parent = node.parentId ? absoluteRect(node.parentId) : undefined;
      return {
        x: (parent?.x ?? 0) + node.position.x,
        y: (parent?.y ?? 0) + node.position.y,
        width: node.measured?.width ?? node.width ?? 0,
        height: node.measured?.height ?? node.height ?? 0,
      };
    },
    [absoluteRect],
  );

  const isWithin = useCallback(
    (id: string, ancestorId: string) => {
      let current: string | undefined = id;
      for (let i = 0; current && i < MAX_FRAME_DEPTH; i++) {
        if (current === ancestorId) return true;
        current = flow.getInternalNode(current)?.parentId;
      }
      return false;
    },
    [flow],
  );

  // Every frame's box on the board. Worked out once when placing many nodes
  // at a time, rather than once per node. A collapsed frame is left out, so
  // nothing lands in it unseen: it's only its header on screen.
  const frameRects = useCallback(
    (): FrameRect[] =>
      flow.getNodes().flatMap((n) => {
        if (n.type !== "frame" || n.data.collapsed) return [];
        const rect = absoluteRect(n.id);
        return rect ? [{ id: n.id, rect }] : [];
      }),
    [flow, absoluteRect],
  );

  // The frame (if any) under a point, preferring the innermost.
  const frameAt = useCallback(
    (
      point: XYPosition,
      exclude: (id: string) => boolean,
      frames: FrameRect[] = frameRects(),
    ) => {
      let best: { id: string; area: number } | undefined;
      frames.forEach(({ id, rect }) => {
        if (exclude(id) || !contains(rect, point)) return;
        const area = rect.width * rect.height;
        if (!best || area < best.area) best = { id, area };
      });
      return best?.id;
    },
    [frameRects],
  );

  // Where a node whose box is now `rect` belongs: in the innermost frame
  // under its centre (never itself, anything inside it, or anything in
  // `moving`), positioned relative to that frame.
  const placementFor = useCallback(
    (id: string, rect: Rect, moving: Set<string>, frames?: FrameRect[]) => {
      const parent = frameAt(
        centerOf(rect),
        (frame) => moving.has(frame) || isWithin(frame, id),
        frames,
      );
      const parentRect = parent ? absoluteRect(parent) : undefined;
      return {
        parent,
        position: {
          x: rect.x - (parentRect?.x ?? 0),
          y: rect.y - (parentRect?.y ?? 0),
        },
      };
    },
    [frameAt, isWithin, absoluteRect],
  );

  const nodeCenter = useCallback(
    (id: string) => {
      const rect = absoluteRect(id);
      return rect && centerOf(rect);
    },
    [absoluteRect],
  );

  // The board point in the middle of the screen.
  const paneCenter = useCallback(() => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return flow.screenToFlowPosition({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
  }, [flow, wrapperRef]);

  const flowPoint = useCallback(
    (event: React.PointerEvent | PointerEvent) =>
      flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
    [flow],
  );

  // Whether a pointer event happened on the board itself. React passes on
  // events from dialogs drawn elsewhere on the page (the comment panel's
  // delete dialog) as though they were inside it.
  const onBoard = useCallback(
    (event: React.PointerEvent) =>
      event.target instanceof globalThis.Node &&
      !!wrapperRef.current?.contains(event.target),
    [wrapperRef],
  );

  return {
    absoluteRect,
    liveRect,
    isWithin,
    frameRects,
    frameAt,
    placementFor,
    nodeCenter,
    paneCenter,
    flowPoint,
    onBoard,
  };
}
