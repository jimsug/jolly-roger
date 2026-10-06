import { Random } from "meteor/random";
import type { OnConnectEnd, OnConnectStart, XYPosition } from "@xyflow/react";
import { useReactFlow, useStore, useStoreApi } from "@xyflow/react";
import type React from "react";
import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { snapAngle } from "../../lib/whiteboard/connectors";
import type { LineStyle } from "../../lib/whiteboard/lineStyle";
import type { WhiteboardEdgeInput } from "../../methods/upsertWhiteboardEdges";
import type { Done } from "../components/whiteboard/boardWrites";
import type { Tool } from "../components/whiteboard/tools";
import { CLICK_SLOP } from "../components/whiteboard/touch";
import useLatest from "./useLatest";
import type { Endpoint, LineEnds } from "./useLineEnds";
import type {
  WhiteboardFlowEdge,
  WhiteboardFlowNode,
} from "./useWhiteboardSync";

export interface Connecting {
  // The end that stays put: where a new line started, or the far end of a
  // line whose end is being moved.
  fixed: Endpoint;
  current: XYPosition;
  target?: Endpoint;
  // Set when moving an existing line's end rather than drawing a new line.
  edgeId?: string;
  end?: "source" | "target";
  // Where the press was, on screen, so a grip that's only clicked stays put.
  pressedAt?: { x: number; y: number };
}

// The line tool and the grips: a line being drawn or an end being moved,
// what an end would attach to, lines from handles and click-to-connect.
// The canvas's pointer handlers call in here; the writes are useLineEnds'.
export default function useLineTool({
  readOnly,
  tool,
  nodes,
  wrapperRef,
  lastPointer,
  lineStyle,
  ends,
  flowPoint,
  nodeCenter,
  updateEdge,
  showLockRefused,
}: {
  readOnly: boolean;
  tool: Tool;
  nodes: WhiteboardFlowNode[];
  wrapperRef: RefObject<HTMLDivElement | null>;
  // Where the pointer last was on screen while over the board itself.
  lastPointer: RefObject<{ x: number; y: number } | undefined>;
  lineStyle: LineStyle;
  ends: LineEnds;
  flowPoint: (event: React.PointerEvent | PointerEvent) => XYPosition;
  nodeCenter: (id: string) => XYPosition | undefined;
  updateEdge: (input: WhiteboardEdgeInput, onDone?: Done) => void;
  showLockRefused: () => void;
}) {
  const flow = useReactFlow<WhiteboardFlowNode, WhiteboardFlowEdge>();
  const storeApi = useStoreApi<WhiteboardFlowNode, WhiteboardFlowEdge>();
  const { resolveEndpoint, endpointPosition, createLine, moveLineEnd } = ends;
  // The node a click-to-connect line starts from, and where the pointer is
  // while it waits for the next click.
  const clickConnectFrom = useRef<string | undefined>(undefined);
  const [clickConnectPointer, setClickConnectPointer] = useState<XYPosition>();
  // What a line end would attach to: under the pointer with the line tool
  // before pressing, or under a free end being dragged.
  const [attachPreview, setAttachPreview] = useState<string | undefined>();
  const [connecting, setConnecting] = useState<Connecting>();

  // A press with the line tool starts a line from whatever is at `point`.
  const startLine = useCallback(
    (point: XYPosition) => {
      setAttachPreview(undefined);
      setConnecting({
        fixed: resolveEndpoint(point, new Set()),
        current: point,
      });
    },
    [resolveEndpoint],
  );

  // Where the end being drawn or moved would go if let go at `point`.
  const targetFor = useCallback(
    (current: Connecting, point: XYPosition, shiftKey: boolean): Endpoint => {
      const exclude = new Set<string>();
      // Moving an end can't attach it to the line's other end. A new line
      // can end on the node it started from; releasing there cancels it.
      if (current.edgeId && "node" in current.fixed) {
        exclude.add(current.fixed.node);
      }
      if (current.edgeId && current.end) {
        const moving = flow.getEdge(current.edgeId)?.[current.end];
        // A free end being moved mustn't find itself; an attached end can be
        // dropped back where it was.
        if (moving && flow.getNode(moving)?.type === "point") {
          exclude.add(moving);
        }
      }
      const target = resolveEndpoint(point, exclude);
      const origin = endpointPosition(current.fixed);
      if (!("node" in target) && shiftKey && origin) {
        return { ...target, point: snapAngle(origin, point) };
      }
      return target;
    },
    [flow, resolveEndpoint, endpointPosition],
  );

  // With the line tool, what a line started here would attach to, from the
  // pointer's last position; kept up to date as the view or the board
  // changes under a still pointer.
  const refreshAttachPreview = useCallback(() => {
    if (tool !== "connector") return;
    const at = lastPointer.current;
    let id: string | undefined;
    if (!readOnly && !connecting && at) {
      const under = resolveEndpoint(flow.screenToFlowPosition(at), new Set());
      id = "node" in under ? under.node : undefined;
    }
    setAttachPreview((current) => (current === id ? current : id));
  }, [readOnly, tool, connecting, flow, resolveEndpoint, lastPointer]);
  // Objects moving under a still pointer change what's under it.
  useEffect(() => {
    refreshAttachPreview();
  }, [nodes, refreshAttachPreview]);
  // The view moving under it does too; React Flow's onMove is registered
  // once, so it reads the latest.
  const refreshAttachPreviewRef = useLatest(refreshAttachPreview);
  const onViewportMove = useCallback(() => {
    refreshAttachPreviewRef.current();
  }, [refreshAttachPreviewRef]);

  // Shows `id` (or nothing) as what a free end being dragged would attach to.
  const previewAttach = useCallback((id: string | undefined) => {
    setAttachPreview((current) => (current === id ? current : id));
  }, []);
  const clearAttachPreview = useCallback(() => setAttachPreview(undefined), []);

  // The pointer moving over the board: keeps a click-to-connect line on it,
  // and the end being drawn or moved.
  const trackClickConnect = useCallback((point: XYPosition) => {
    if (clickConnectFrom.current) setClickConnectPointer(point);
  }, []);
  const dragLine = useCallback(
    (point: XYPosition, shiftKey: boolean) => {
      if (!connecting) return;
      const target = targetFor(connecting, point, shiftKey);
      setConnecting({
        ...connecting,
        current: "node" in target ? point : target.point,
        target,
      });
    },
    [connecting, targetFor],
  );

  // The pointer let go: the line is made or its end moved, unless the grip
  // was only clicked, the line ends where it started, or it has no length.
  const endLine = useCallback(
    (event: React.PointerEvent) => {
      if (!connecting) return;
      const { fixed, edgeId, end } = connecting;
      // Worked out from where the pointer was let go, which can be a move
      // ahead of the last rendered preview.
      const target = targetFor(connecting, flowPoint(event), event.shiftKey);
      setConnecting(undefined);
      if (edgeId && end) {
        const { pressedAt } = connecting;
        const clicked =
          pressedAt &&
          Math.hypot(event.clientX - pressedAt.x, event.clientY - pressedAt.y) <
            CLICK_SLOP;
        if (!clicked) moveLineEnd(edgeId, end, target);
        return;
      }
      if ("node" in target && "node" in fixed) {
        if (target.node !== fixed.node) createLine(fixed, target);
        return;
      }
      // A free end needs the line to have some length, or it was a click.
      const from = endpointPosition(fixed);
      const to = endpointPosition(target);
      if (
        !from ||
        !to ||
        Math.hypot(to.x - from.x, to.y - from.y) * flow.getZoom() < 6
      ) {
        return;
      }
      createLine(fixed, target);
    },
    [
      connecting,
      flow,
      flowPoint,
      targetFor,
      moveLineEnd,
      createLine,
      endpointPosition,
    ],
  );
  const cancelLine = useCallback(() => setConnecting(undefined), []);

  // A line from a handle joins whatever the pointer ends on (or right by),
  // going by the same rules as the line tool, not by whichever handle React
  // Flow would snap to: cards in a frame sit closer together than its
  // snapping distance, so a handle's own end of the gap would otherwise land
  // on the neighbouring card.
  const connectFromHandle = useCallback(
    (from: string, event: MouseEvent | TouchEvent) => {
      const pointer =
        "changedTouches" in event ? event.changedTouches[0] : event;
      if (!pointer) return;
      const point = flow.screenToFlowPosition({
        x: pointer.clientX,
        y: pointer.clientY,
      });
      // Ending on (or right by) the node it started from, rather than on
      // something lying on it or next to it: a slip, not a line.
      const target = resolveEndpoint(point, new Set());
      if (!("node" in target) || target.node === from) return;
      updateEdge({
        _id: Random.id(),
        source: from,
        target: target.node,
        ...lineStyle,
      });
    },
    [flow, resolveEndpoint, updateEdge, lineStyle],
  );

  // A line dragged out of a handle ends where it's let go.
  const onConnectEnd: OnConnectEnd = useCallback(
    (event, state) => {
      if (state.fromNode) connectFromHandle(state.fromNode.id, event);
    },
    [connectFromHandle],
  );

  // A handle clicked rather than dragged starts a line that ends at the next
  // handle clicked (React Flow's click-to-connect). Until then a dashed line
  // runs from the handle to the pointer, and Escape lets go of it.
  const clickConnectStart = useStore((s) => s.connectionClickStartHandle);
  const onClickConnectStart: OnConnectStart = useCallback(
    (event, { nodeId }) => {
      clickConnectFrom.current = nodeId ?? undefined;
      const pointer =
        "changedTouches" in event ? event.changedTouches[0] : event;
      setClickConnectPointer(
        pointer
          ? flow.screenToFlowPosition({
              x: pointer.clientX,
              y: pointer.clientY,
            })
          : undefined,
      );
    },
    [flow],
  );
  const onClickConnectEnd: OnConnectEnd = useCallback(
    (event) => {
      const from = clickConnectFrom.current;
      clickConnectFrom.current = undefined;
      setClickConnectPointer(undefined);
      if (from) connectFromHandle(from, event);
    },
    [connectFromHandle],
  );
  const cancelClickConnect = useCallback(() => {
    clickConnectFrom.current = undefined;
    setClickConnectPointer(undefined);
    if (storeApi.getState().connectionClickStartHandle) {
      storeApi.setState({ connectionClickStartHandle: null });
    }
  }, [storeApi]);
  // The middle of the handle a click-to-connect line starts from.
  let clickConnectOrigin: XYPosition | undefined;
  if (clickConnectStart) {
    const node = flow.getInternalNode(clickConnectStart.nodeId);
    const handle = node?.internals.handleBounds?.[clickConnectStart.type]?.find(
      (h) => h.id === clickConnectStart.id,
    );
    if (node && handle) {
      clickConnectOrigin = {
        x: node.internals.positionAbsolute.x + handle.x + handle.width / 2,
        y: node.internals.positionAbsolute.y + handle.y + handle.height / 2,
      };
    }
  }

  // A press on a selected line's grip picks up that end.
  const beginEndpointDrag = useCallback(
    (edgeId: string, end: "source" | "target", event: React.PointerEvent) => {
      if (readOnly) return;
      const line = flow.getEdge(edgeId);
      if (!line) return;
      // An end on a locked node stays on it
      if (flow.getNode(line[end])?.data.doc.locked) {
        showLockRefused();
        return;
      }
      wrapperRef.current?.setPointerCapture(event.pointerId);
      setConnecting({
        fixed: { node: end === "source" ? line.target : line.source },
        current: flowPoint(event),
        edgeId,
        end,
        pressedAt: { x: event.clientX, y: event.clientY },
      });
    },
    [readOnly, flow, flowPoint, showLockRefused, wrapperRef],
  );

  // The line being drawn, or the end being moved. A new line shows what both
  // its ends are on; moving an end shows just where that end will go.
  const lineAttached =
    connecting?.target && "node" in connecting.target
      ? connecting.target.node
      : undefined;
  const lineFrom = connecting && endpointPosition(connecting.fixed);
  const lineTo = lineAttached ? nodeCenter(lineAttached) : connecting?.current;
  const lineOrigin =
    connecting && !connecting.edgeId && "node" in connecting.fixed
      ? connecting.fixed.node
      : undefined;

  return {
    connecting,
    attachPreview,
    clickConnectStart,
    clickConnectOrigin,
    clickConnectPointer,
    lineAttached,
    lineFrom,
    lineTo,
    lineOrigin,
    startLine,
    dragLine,
    endLine,
    cancelLine,
    trackClickConnect,
    refreshAttachPreview,
    onViewportMove,
    previewAttach,
    clearAttachPreview,
    onConnectEnd,
    onClickConnectStart,
    onClickConnectEnd,
    cancelClickConnect,
    beginEndpointDrag,
  };
}

export type LineTool = ReturnType<typeof useLineTool>;
