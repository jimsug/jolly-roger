import { Random } from "meteor/random";
import type { XYPosition } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";
import { useCallback } from "react";
import type { AttachHit } from "../../lib/whiteboard/connectors";
import {
  attachHit,
  centerOf,
  compareAttachHits,
} from "../../lib/whiteboard/connectors";
import { round1 } from "../../lib/whiteboard/ink";
import type { Rect } from "../../lib/whiteboard/layout";
import { POINT_SIZE } from "../../lib/whiteboard/layout";
import type { LineStyle } from "../../lib/whiteboard/lineStyle";
import deleteWhiteboardNodes from "../../methods/deleteWhiteboardNodes";
import type { WhiteboardEdgeInput } from "../../methods/upsertWhiteboardEdges";
import type { WhiteboardNodeInput } from "../../methods/upsertWhiteboardNodes";
import type { Commit, Done } from "../components/whiteboard/boardWrites";
import type {
  WhiteboardFlowEdge,
  WhiteboardFlowNode,
} from "./useWhiteboardSync";

// One end of a line: attached to a node, or free at a point (inside a frame,
// if it's drawn in one).
export type Endpoint =
  | { node: string }
  | { point: XYPosition; parent?: string };

// How close (in screen pixels) a line end has to be to something to attach to
// it: just outside its edge, or either side of a frame's border.
const ATTACH_MARGIN = 8;
const FRAME_ATTACH_MARGIN = 12;

// Where a line's ends go: what an end attaches to, how a free end is placed
// as a point node, and the writes that make a line or move one of its ends.
export default function useLineEnds({
  boardId,
  lineStyle,
  absoluteRect,
  liveRect,
  frameAt,
  nodeCenter,
  markPending,
  showMoves,
  updateNodes,
  updateEdge,
  commit,
}: {
  boardId: string;
  // The look a new line takes.
  lineStyle: LineStyle;
  absoluteRect: (id: string) => Rect | undefined;
  liveRect: (node: WhiteboardFlowNode) => Rect;
  frameAt: (
    point: XYPosition,
    exclude: (id: string) => boolean,
  ) => string | undefined;
  nodeCenter: (id: string) => XYPosition | undefined;
  // Holds a change until the server has it, and shows it on the board.
  markPending: (
    id: string,
    change: { position?: XYPosition; parent?: string | null },
  ) => void;
  // Shows moved nodes in their new places straight away.
  showMoves: (
    moves: Map<string, { position: XYPosition; parent?: string }>,
  ) => void;
  updateNodes: (inputs: WhiteboardNodeInput[], onDone?: Done) => void;
  updateEdge: (input: WhiteboardEdgeInput, onDone?: Done) => void;
  commit: Commit;
}) {
  const flow = useReactFlow<WhiteboardFlowNode, WhiteboardFlowEdge>();

  // What a line end dropped here attaches to: the topmost thing under it, or
  // failing that the nearest thing just beside it (frames only by their
  // border; never ink), or nothing.
  const resolveEndpoint = useCallback(
    (point: XYPosition, exclude: Set<string>): Endpoint => {
      const zoom = flow.getZoom();
      let best:
        | (AttachHit & { id: string; z: number; order: number })
        | undefined;
      flow.getNodes().forEach((n, order) => {
        if (n.type === "point" || n.type === "ink" || exclude.has(n.id)) return;
        const rect = absoluteRect(n.id);
        if (!rect) return;
        const frame = n.type === "frame";
        const hit = attachHit(
          rect,
          point,
          (frame ? FRAME_ATTACH_MARGIN : ATTACH_MARGIN) / zoom,
          frame,
        );
        if (!hit) return;
        const candidate = {
          ...hit,
          id: n.id,
          z: flow.getInternalNode(n.id)?.internals.z ?? 0,
          order,
        };
        if (!best || compareAttachHits(candidate, best) < 0) best = candidate;
      });
      if (best) return { node: best.id };
      return { point, parent: frameAt(point, (id) => exclude.has(id)) };
    },
    [flow, absoluteRect, frameAt],
  );

  // Where a line's free end dropped (or being dragged) onto something
  // attaches.
  const droppedEnd = useCallback(
    (node: WhiteboardFlowNode) => {
      if (node.type !== "point") return undefined;
      const line = flow
        .getEdges()
        .find((e) => e.source === node.id || e.target === node.id);
      if (!line) return undefined;
      const end = line.source === node.id ? "source" : "target";
      const other = end === "source" ? line.target : line.source;
      const endpoint = resolveEndpoint(
        centerOf(liveRect(node)),
        new Set([node.id, other]),
      );
      if (!("node" in endpoint)) return undefined;
      return { line: line.id, end, onto: endpoint.node } as const;
    },
    [flow, liveRect, resolveEndpoint],
  );

  // Attaches a line's free end that's been dropped onto something; returns
  // whether it did.
  const attachDroppedEnd = useCallback(
    (node: WhiteboardFlowNode) => {
      const dropped = droppedEnd(node);
      if (!dropped) return false;
      // The free end stays where it was dropped (under the thing it's now
      // attached to) until the server removes it.
      markPending(node.id, {
        position: node.position,
        parent: node.parentId ?? null,
      });
      updateEdge({ _id: dropped.line, [dropped.end]: dropped.onto });
      return true;
    },
    [droppedEnd, markPending, updateEdge],
  );

  const endpointPosition = useCallback(
    (endpoint: Endpoint) =>
      "node" in endpoint ? nodeCenter(endpoint.node) : endpoint.point,
    [nodeCenter],
  );

  // A free end, as a point node positioned in its parent's coordinates.
  const pointPlacement = useCallback(
    (endpoint: { point: XYPosition; parent?: string }) => {
      const parentRect = endpoint.parent
        ? absoluteRect(endpoint.parent)
        : undefined;
      return {
        position: {
          x: round1(endpoint.point.x - POINT_SIZE / 2 - (parentRect?.x ?? 0)),
          y: round1(endpoint.point.y - POINT_SIZE / 2 - (parentRect?.y ?? 0)),
        },
        parent: endpoint.parent ?? null,
      };
    },
    [absoluteRect],
  );

  const createLine = useCallback(
    (from: Endpoint, to: Endpoint) => {
      const points: WhiteboardNodeInput[] = [];
      const idFor = (endpoint: Endpoint) => {
        if ("node" in endpoint) return endpoint.node;
        const _id = Random.id();
        points.push({ _id, type: "point", ...pointPlacement(endpoint) });
        return _id;
      };
      const edge: WhiteboardEdgeInput = {
        _id: Random.id(),
        source: idFor(from),
        target: idFor(to),
        ...lineStyle,
      };
      commit(
        { upsertNodes: points, upsertEdges: [edge] },
        {
          rollback: () => {
            if (points.length === 0) return;
            deleteWhiteboardNodes.call({
              boardId,
              nodeIds: points.map((p) => p._id),
            });
          },
        },
      );
    },
    [boardId, lineStyle, pointPlacement, commit],
  );

  // Moves one end of an existing line: onto something, or to a free spot.
  const moveLineEnd = useCallback(
    (edgeId: string, end: "source" | "target", endpoint: Endpoint) => {
      const line = flow.getEdge(edgeId);
      if (!line) return;
      const currentId = line[end];
      const otherId = end === "source" ? line.target : line.source;
      if ("node" in endpoint) {
        if (endpoint.node === currentId || endpoint.node === otherId) return;
        updateEdge({ _id: edgeId, [end]: endpoint.node });
        return;
      }
      if (flow.getNode(currentId)?.type === "point") {
        const placement = pointPlacement(endpoint);
        markPending(currentId, placement);
        showMoves(
          new Map([
            [
              currentId,
              {
                position: placement.position,
                parent: placement.parent ?? undefined,
              },
            ],
          ]),
        );
        updateNodes([{ _id: currentId, ...placement }]);
        return;
      }
      const _id = Random.id();
      const point: WhiteboardNodeInput = {
        _id,
        type: "point",
        ...pointPlacement(endpoint),
      };
      const moved: WhiteboardEdgeInput = { _id: edgeId, [end]: _id };
      commit(
        { upsertNodes: [point], upsertEdges: [moved] },
        {
          rollback: () =>
            deleteWhiteboardNodes.call({ boardId, nodeIds: [_id] }),
        },
      );
    },
    [
      boardId,
      flow,
      markPending,
      pointPlacement,
      showMoves,
      updateEdge,
      updateNodes,
      commit,
    ],
  );

  return {
    resolveEndpoint,
    droppedEnd,
    attachDroppedEnd,
    endpointPosition,
    createLine,
    moveLineEnd,
  };
}

export type LineEnds = ReturnType<typeof useLineEnds>;
