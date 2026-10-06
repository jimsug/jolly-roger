import { useReactFlow, useStoreApi } from "@xyflow/react";
import type React from "react";
import type { RefObject } from "react";
import { useCallback, useEffect, useRef } from "react";
import { MAX_ZOOM, MIN_ZOOM } from "../../lib/whiteboard/links";
import { OVERLAYS } from "../components/whiteboard/canvasChrome";
import type { Tool } from "../components/whiteboard/tools";
import { LongPress } from "../components/whiteboard/touch";
import type {
  WhiteboardFlowEdge,
  WhiteboardFlowNode,
} from "./useWhiteboardSync";

interface ScreenPoint {
  x: number;
  y: number;
}

// Fingers on the board: a finger held on a node, which selects it after a
// while, and two fingers panning and zooming while the tool in use takes
// one finger for itself (see fingerPans), which React Flow won't do then.
export default function useTouchGestures({
  wrapperRef,
  tool,
  readOnly,
  fingerPans,
  onBoard,
  dropFingerAction,
  onLongPress,
}: {
  wrapperRef: RefObject<HTMLDivElement | null>;
  tool: Tool;
  readOnly: boolean;
  // Whether one finger on the empty board pans it, which React Flow does.
  fingerPans: boolean;
  // Whether a pointer event happened on the board itself.
  onBoard: (event: React.PointerEvent) => boolean;
  // Drops whatever one finger had started when a second turns it into a
  // pinch.
  dropFingerAction: () => void;
  // A finger held on a node for long enough.
  onLongPress: (nodeId: string) => void;
}) {
  const flow = useReactFlow<WhiteboardFlowNode, WhiteboardFlowEdge>();
  const storeApi = useStoreApi<WhiteboardFlowNode, WhiteboardFlowEdge>();
  // Fingers on the board and where each last was on screen.
  const touches = useRef(new Map<number, ScreenPoint>());
  // Two fingers panning and zooming the board, from where they started.
  const pinch = useRef<
    | {
        ids: [number, number];
        viewport: { x: number; y: number; zoom: number };
        mid: ScreenPoint;
        distance: number;
      }
    | undefined
  >(undefined);
  // Fingers that have been part of a pinch, which do nothing more until
  // they're lifted.
  const spentTouches = useRef(new Set<number>());
  const longPress = useRef(new LongPress());
  useEffect(() => {
    const pending = longPress.current;
    return () => pending.cancel();
  }, []);

  // The board point that was between the two fingers stays between them,
  // and the zoom follows how far apart they are.
  const startPinch = useCallback(() => {
    const [first, second] = [...touches.current.entries()];
    const box = storeApi.getState().domNode?.getBoundingClientRect();
    if (!first || !second || !box) return;
    const [firstId, a] = first;
    const [secondId, b] = second;
    pinch.current = {
      ids: [firstId, secondId],
      viewport: flow.getViewport(),
      mid: { x: (a.x + b.x) / 2 - box.left, y: (a.y + b.y) / 2 - box.top },
      distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
    };
    spentTouches.current.add(firstId);
    spentTouches.current.add(secondId);
    dropFingerAction();
    try {
      wrapperRef.current?.setPointerCapture(secondId);
    } catch {
      // A finger already lifted can't be captured; its pointerup has gone.
    }
  }, [storeApi, flow, dropFingerAction, wrapperRef]);
  const movePinch = useCallback(() => {
    const current = pinch.current;
    const box = storeApi.getState().domNode?.getBoundingClientRect();
    if (!current || !box) return;
    const a = touches.current.get(current.ids[0]);
    const b = touches.current.get(current.ids[1]);
    if (!a || !b) return;
    const { viewport, mid, distance } = current;
    const zoom = Math.min(
      MAX_ZOOM,
      Math.max(
        MIN_ZOOM,
        (viewport.zoom * Math.max(1, Math.hypot(a.x - b.x, a.y - b.y))) /
          distance,
      ),
    );
    const boardX = (mid.x - viewport.x) / viewport.zoom;
    const boardY = (mid.y - viewport.y) / viewport.zoom;
    void flow.setViewport({
      x: (a.x + b.x) / 2 - box.left - boardX * zoom,
      y: (a.y + b.y) / 2 - box.top - boardY * zoom,
      zoom,
    });
  }, [storeApi, flow]);

  // A finger put down. Says whether it's a second finger, which means a
  // pinch rather than a tap, a long press or a stroke: React Flow pans and
  // zooms unless the tool has the first finger, when the canvas does.
  const fingerDown = useCallback(
    (event: React.PointerEvent) => {
      // A first finger starts afresh, whatever was missed of the last
      // gesture.
      if (event.isPrimary) {
        touches.current.clear();
        spentTouches.current.clear();
        pinch.current = undefined;
      }
      touches.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
      if (touches.current.size > 1) {
        longPress.current.cancel();
        if (
          !fingerPans &&
          touches.current.size === 2 &&
          !pinch.current &&
          onBoard(event)
        ) {
          event.preventDefault();
          event.stopPropagation();
          startPinch();
        }
        return true;
      }
      if (
        tool === "select" &&
        !readOnly &&
        event.button === 0 &&
        // An ink stroke's press lands on its SVG path, not an HTMLElement
        event.target instanceof Element
      ) {
        const node = event.target.closest<HTMLElement>(".react-flow__node");
        const id = node?.dataset.id;
        if (
          id &&
          onBoard(event) &&
          !event.target.closest(
            `${OVERLAYS}, .react-flow__handle, .react-flow__resize-control, input, textarea, [contenteditable="true"]`,
          )
        ) {
          longPress.current.start(
            event.pointerId,
            { x: event.clientX, y: event.clientY },
            () => onLongPress(id),
          );
        }
      }
      return false;
    },
    [fingerPans, onBoard, startPinch, tool, readOnly, onLongPress],
  );

  // A finger moving, now at `at`: moves the pinch it's part of, or the long
  // press it's holding. Says whether that's all the move does.
  const fingerMove = useCallback(
    (event: React.PointerEvent, at: ScreenPoint) => {
      if (
        event.pointerType !== "touch" ||
        !touches.current.has(event.pointerId)
      ) {
        return false;
      }
      touches.current.set(event.pointerId, at);
      if (pinch.current?.ids.includes(event.pointerId)) {
        movePinch();
        return true;
      }
      if (spentTouches.current.has(event.pointerId)) return true;
      longPress.current.move(event.pointerId, at);
      return false;
    },
    [movePinch],
  );

  // A finger lifted or cancelled, which ends a pinch it was part of. Says
  // whether it had been part of one, when it has nothing more to do.
  const liftFinger = useCallback((event: React.PointerEvent) => {
    if (event.pointerType !== "touch") return false;
    touches.current.delete(event.pointerId);
    longPress.current.end(event.pointerId);
    if (pinch.current?.ids.includes(event.pointerId)) {
      pinch.current = undefined;
    }
    return spentTouches.current.delete(event.pointerId);
  }, []);

  const cancelLongPress = useCallback(() => longPress.current.cancel(), []);
  const longPressWaiting = useCallback(() => longPress.current.waiting, []);

  return {
    fingerDown,
    fingerMove,
    liftFinger,
    cancelLongPress,
    longPressWaiting,
  };
}
