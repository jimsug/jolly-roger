import { useTracker } from "meteor/react-meteor-data";
import type { Node, XYPosition } from "@xyflow/react";
import { MarkerType } from "@xyflow/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { WhiteboardEdgeType as WhiteboardEdgeDoc } from "../../../lib/models/WhiteboardEdges";
import WhiteboardEdges from "../../../lib/models/WhiteboardEdges";
import type { WhiteboardNodeType } from "../../../lib/models/WhiteboardNodes";
import WhiteboardNodes from "../../../lib/models/WhiteboardNodes";
import { arrangeUnits } from "../../../lib/whiteboard/arrange";
import { STROKE_COLOURS } from "./colours";
import type { WhiteboardEdgeType } from "./WhiteboardEdge";

export type WhiteboardFlowNode = Node<
  { doc: WhiteboardNodeType; erasing?: boolean },
  WhiteboardNodeType["type"]
>;

// A local change we've sent but the server hasn't echoed back yet. While it's
// outstanding we show the local value; there are no client-side method stubs
// to do this for us.
export interface PendingChange {
  position?: XYPosition;
  parent?: string | null;
  width?: number;
  height?: number;
  at: number;
}

const PENDING_TIMEOUT = 10_000;

const near = (a: number | undefined, b: number | undefined) =>
  a !== undefined && b !== undefined && Math.abs(a - b) < 0.01;

function pendingSatisfied(doc: WhiteboardNodeType, p: PendingChange) {
  if (
    p.position &&
    !(near(doc.position.x, p.position.x) && near(doc.position.y, p.position.y))
  ) {
    return false;
  }
  if (p.parent !== undefined && (doc.parent ?? null) !== p.parent) {
    return false;
  }
  if (p.width !== undefined && !near(doc.width, p.width)) return false;
  if (p.height !== undefined && !near(doc.height, p.height)) return false;
  return true;
}

// React Flow needs parents before their children.
export function sortParentsFirst<T extends Node>(nodes: T[]): T[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const depth = (node: T) => {
    let d = 0;
    let parent = node.parentId && byId.get(node.parentId);
    while (parent && d < 64) {
      d += 1;
      parent = parent.parentId && byId.get(parent.parentId);
    }
    return d;
  };
  return nodes
    .map((n, i) => ({ n, i, d: depth(n) }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .map(({ n }) => n);
}

// React Flow lifts a child to at least its parent's z + 1, so frames are pushed
// well below everything else (nested ones a step above their parent), cards
// sit above any frame, and annotations sit above cards.
const FRAME_Z = -1000;
const ANNOTATION_Z = 1;
// A line's free ends stack with cards, so lines ending in them don't draw over
// stickies and text. Their grips are drawn above everything anyway.
const POINT_Z = 0;

function withStacking(nodes: WhiteboardFlowNode[]): WhiteboardFlowNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return nodes.map((node) => {
    if (node.type === "frame") {
      let depth = 0;
      let parent = node.parentId && byId.get(node.parentId);
      while (parent && depth < 64) {
        depth += 1;
        parent = parent.parentId && byId.get(parent.parentId);
      }
      return { ...node, zIndex: FRAME_Z + depth };
    }
    if (node.type === "point") return { ...node, zIndex: POINT_Z };
    return node.type === "puzzle" ? node : { ...node, zIndex: ANNOTATION_Z };
  });
}

// The selection as units that align and distribute as one (see
// arrangeUnits), with each unit's nodes.
export function selectionUnits(
  nodes: WhiteboardFlowNode[],
  edges: WhiteboardEdgeType[],
): Map<string, WhiteboardFlowNode[]> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const units = arrangeUnits(
    nodes.map((n) => ({
      id: n.id,
      type: n.type ?? "",
      parent: n.parentId,
      selected: n.selected,
      stroke: n.data.doc.stroke,
    })),
    edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      selected: e.selected,
    })),
  );
  return new Map(
    [...units].map(([key, ids]) => [
      key,
      ids.map((id) => byId.get(id)).filter((n): n is WhiteboardFlowNode => !!n),
    ]),
  );
}

export function useWhiteboardSync({
  boardId,
  livePuzzleIds,
  readOnly,
  showFeederArrows,
  remoteDrags,
  erasingStrokes,
  lineColours,
}: {
  boardId: string;
  livePuzzleIds: Set<string>;
  readOnly: boolean;
  showFeederArrows: boolean;
  remoteDrags: Map<string, XYPosition>;
  erasingStrokes: Set<string>;
  // Theme colours for lines with no colour of their own, and feeder arrows.
  lineColours: { text: string; muted: string };
}) {
  const nodeDocs = useTracker(
    () => WhiteboardNodes.find({ board: boardId }).fetch(),
    [boardId],
  );
  const edgeDocs = useTracker(
    () => WhiteboardEdges.find({ board: boardId }).fetch(),
    [boardId],
  );

  const [nodes, setNodes] = useState<WhiteboardFlowNode[]>([]);
  const [edges, setEdges] = useState<WhiteboardEdgeType[]>([]);
  const pending = useRef(new Map<string, PendingChange>());
  // Bumped to force a rebuild from the server state, e.g. after a failed
  // write.
  const [generation, setGeneration] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: generation forces a rebuild from server state after a failed write
  useEffect(() => {
    const now = Date.now();
    setNodes((previous) => {
      const prevById = new Map(previous.map((n) => [n.id, n]));
      const candidates = nodeDocs.filter(
        (doc) =>
          !doc.hidden &&
          (doc.type !== "puzzle" ||
            (!!doc.puzzle && livePuzzleIds.has(doc.puzzle))),
      );
      // A free end only shows while its line does: a line attached to a
      // hidden card or frame takes its free end with it.
      const pointIds = new Set(
        candidates.filter((d) => d.type === "point").map((d) => d._id),
      );
      const candidateIds = new Set(candidates.map((d) => d._id));
      const endShown = (id: string) => candidateIds.has(id);
      const pointsInUse = new Set(
        edgeDocs.flatMap((e) =>
          !e.hidden && endShown(e.source) && endShown(e.target)
            ? [e.source, e.target].filter((id) => pointIds.has(id))
            : [],
        ),
      );
      const visible = candidates.filter(
        (d) => d.type !== "point" || pointsInUse.has(d._id),
      );
      const visibleIds = new Set(visible.map((d) => d._id));

      const built = visible.map((doc): WhiteboardFlowNode => {
        let change = pending.current.get(doc._id);
        if (
          change &&
          (pendingSatisfied(doc, change) || now - change.at > PENDING_TIMEOUT)
        ) {
          pending.current.delete(doc._id);
          change = undefined;
        }
        const prev = prevById.get(doc._id);
        const rawParent =
          change?.parent !== undefined
            ? (change.parent ?? undefined)
            : doc.parent;
        const parentId =
          rawParent && visibleIds.has(rawParent) ? rawParent : undefined;
        const remote = change ? undefined : remoteDrags.get(doc._id);

        let position = change?.position ?? remote ?? doc.position;
        if (prev?.dragging) position = prev.position;

        return {
          id: doc._id,
          type: doc.type,
          position,
          parentId,
          data: {
            doc,
            erasing: !!doc.stroke && erasingStrokes.has(doc.stroke),
          },
          width: change?.width ?? doc.width,
          height: change?.height ?? doc.height,
          selected: prev?.selected ?? false,
          dragging: prev?.dragging,
          measured: prev?.measured,
          // Dragging, selecting and connecting are left to the canvas, which
          // turns them off for read-only boards and while a drawing tool is
          // in use; a per-node true would override that.
          deletable: !readOnly,
          ...(doc.type === "ink" || doc.type === "point"
            ? { connectable: false }
            : {}),
          // Moves that come from someone else glide rather than jump. The
          // canvas turns this off while we're dragging or resizing ourselves.
          className: "jr-glide",
        };
      });
      return withStacking(sortParentsFirst(built));
    });
  }, [
    nodeDocs,
    edgeDocs,
    livePuzzleIds,
    readOnly,
    remoteDrags,
    erasingStrokes,
    generation,
  ]);

  useEffect(() => {
    setEdges((previous) => {
      const selected = new Set(
        previous.filter((e) => e.selected).map((e) => e.id),
      );
      const nodeIds = new Set(
        nodeDocs
          .filter(
            (d) =>
              !d.hidden &&
              (d.type !== "puzzle" ||
                (!!d.puzzle && livePuzzleIds.has(d.puzzle))),
          )
          .map((d) => d._id),
      );
      return edgeDocs
        .filter(
          (e: WhiteboardEdgeDoc) =>
            !e.hidden &&
            nodeIds.has(e.source) &&
            nodeIds.has(e.target) &&
            (showFeederArrows || !e.auto),
        )
        .map((e): WhiteboardEdgeType => {
          const colour = e.auto
            ? lineColours.muted
            : ((e.colour && STROKE_COLOURS[e.colour]) ?? lineColours.text);
          const marker = {
            type: MarkerType.ArrowClosed,
            width: e.auto ? 14 : 18,
            height: e.auto ? 14 : 18,
            color: colour,
          };
          const arrowHead = e.arrowHead ?? "end";
          return {
            id: e._id,
            source: e.source,
            target: e.target,
            type: "whiteboard",
            data: { doc: e },
            markerEnd: arrowHead === "none" ? undefined : marker,
            markerStart: arrowHead === "both" ? marker : undefined,
            selected: selected.has(e._id),
            deletable: !readOnly,
          };
        });
    });
  }, [
    edgeDocs,
    nodeDocs,
    livePuzzleIds,
    showFeederArrows,
    readOnly,
    lineColours,
  ]);

  const markPending = useCallback(
    (id: string, change: Omit<PendingChange, "at">) => {
      const existing = pending.current.get(id);
      pending.current.set(id, { ...existing, ...change, at: Date.now() });
    },
    [],
  );

  const clearPending = useCallback((ids: string[]) => {
    ids.forEach((id) => pending.current.delete(id));
    setGeneration((g) => g + 1);
  }, []);

  return {
    nodes,
    setNodes,
    edges,
    setEdges,
    nodeDocs,
    markPending,
    clearPending,
  };
}
