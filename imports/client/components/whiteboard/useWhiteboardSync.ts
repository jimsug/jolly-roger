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

// The same for a line: its ends and look.
export type PendingEdgeChange = Partial<
  Pick<
    WhiteboardEdgeDoc,
    "source" | "target" | "pathStyle" | "arrowHead" | "colour" | "dashed"
  >
> & { label?: string | null; at: number };

const PENDING_TIMEOUT = 10_000;

// Someone else's live drag, in the coordinates of the frame the node was in
// when they sent it.
export interface RemoteDrag {
  x: number;
  y: number;
  parent?: string;
}

// How long a move made by someone else (or by the server) takes to glide into
// place. Positions glide, not just the node on screen, so lines go with them.
const GLIDE_MS = 120;

interface GlideBox extends XYPosition {
  width?: number;
  height?: number;
}

interface Glide {
  from: GlideBox;
  to: GlideBox;
  // When it started moving on screen: its first animation frame, since on a
  // busy board that can come well after the change arrived.
  start?: number;
  // The frame the positions are measured in.
  parentId: string | undefined;
}

const samePosition = (a: XYPosition, b: XYPosition) =>
  Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;

const near = (a: number | undefined, b: number | undefined) =>
  a !== undefined && b !== undefined && Math.abs(a - b) < 0.01;

// Unset, false and empty all mean "not set" for a line's fields.
const plain = (value: unknown) =>
  value === undefined || value === null || value === false || value === ""
    ? null
    : value;

function edgeSatisfied(doc: WhiteboardEdgeDoc, p: PendingEdgeChange) {
  return (Object.keys(p) as (keyof PendingEdgeChange)[]).every(
    (key) =>
      key === "at" ||
      plain(doc[key as keyof WhiteboardEdgeDoc]) === plain(p[key]),
  );
}

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

// A saved line with a pending change applied.
function withPendingEdge(
  saved: WhiteboardEdgeDoc,
  change: PendingEdgeChange,
): WhiteboardEdgeDoc {
  const { at: _at, label, ...rest } = change;
  return {
    ...saved,
    ...rest,
    ...(label !== undefined ? { label: label ?? undefined } : {}),
  };
}

// A saved line as React Flow draws it.
function flowEdge(
  e: WhiteboardEdgeDoc,
  selected: boolean,
  colours: { text: string; muted: string },
  readOnly: boolean,
): WhiteboardEdgeType {
  const colour = e.auto
    ? colours.muted
    : ((e.colour && STROKE_COLOURS[e.colour]) ?? colours.text);
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
    selected,
    deletable: !readOnly,
  };
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
  remoteDrags: Map<string, RemoteDrag>;
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
  const pendingEdges = useRef(new Map<string, PendingEdgeChange>());
  // Bumped to force a rebuild from the server state, e.g. after a failed
  // write.
  const [generation, setGeneration] = useState(0);
  const glides = useRef(new Map<string, Glide>());
  const glideFrame = useRef<number | undefined>(undefined);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

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
      // Whatever was changed most recently draws on top of others at the
      // same level, the same for everyone.
      const stamps = new Map(
        candidates.map((d) => [d._id, +(d.updatedAt ?? d.createdAt ?? 0)]),
      );
      const visible = candidates
        .filter((d) => d.type !== "point" || pointsInUse.has(d._id))
        .sort(
          (a, b) =>
            stamps.get(a._id)! - stamps.get(b._id)! ||
            (a._id < b._id ? -1 : a._id > b._id ? 1 : 0),
        );
      const visibleIds = new Set(visible.map((d) => d._id));

      // Where a node was on the board (rather than in its frame).
      const boardPosition = (id: string | undefined) => {
        let x = 0;
        let y = 0;
        let node = id ? prevById.get(id) : undefined;
        for (let depth = 0; node && depth < 64; depth++) {
          x += node.position.x;
          y += node.position.y;
          node = node.parentId ? prevById.get(node.parentId) : undefined;
        }
        return { x, y };
      };
      const resizing = new Set(
        previous.filter((n) => n.resizing).map((n) => n.id),
      );

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
        // A live drag only counts while the node is still in the frame the
        // drag was measured in; once it has been dropped somewhere else the
        // saved position takes over.
        const live = change ? undefined : remoteDrags.get(doc._id);
        const remote =
          live && (live.parent ?? undefined) === (rawParent ?? undefined)
            ? { x: live.x, y: live.y }
            : undefined;

        let position = change?.position ?? remote ?? doc.position;
        let width = change?.width ?? doc.width;
        let height = change?.height ?? doc.height;
        const sameParent = prev?.parentId === parentId;
        if (prev?.dragging) {
          position = prev.position;
        } else if (prev?.resizing) {
          // Mid-resize, the box on screen is ours until it's saved.
          position = prev.position;
          width = prev.width;
          height = prev.height;
        } else if (
          prev?.parentId &&
          sameParent &&
          resizing.has(prev.parentId)
        ) {
          // React Flow keeps a resizing frame's children still on screen by
          // moving them; those positions are ours until the resize is saved.
          position = prev.position;
        } else if (
          !change &&
          prev &&
          (sameParent || !parentId || prevById.has(parentId))
        ) {
          // A change from elsewhere glides from where the node is now, in
          // its new frame's coordinates if it has changed frame.
          const from = sameParent
            ? prev.position
            : (() => {
                const old = boardPosition(prev.parentId);
                const here = boardPosition(parentId);
                return {
                  x: old.x + prev.position.x - here.x,
                  y: old.y + prev.position.y - here.y,
                };
              })();
          const resized =
            (prev.width !== undefined &&
              width !== undefined &&
              !near(prev.width, width)) ||
            (prev.height !== undefined &&
              height !== undefined &&
              !near(prev.height, height));
          if (samePosition(from, position) && !resized) {
            glides.current.delete(doc._id);
          } else {
            const glide = glides.current.get(doc._id);
            if (
              !glide ||
              glide.parentId !== parentId ||
              !samePosition(glide.to, position) ||
              glide.to.width !== width ||
              glide.to.height !== height
            ) {
              glides.current.set(doc._id, {
                from: { ...from, width: prev.width, height: prev.height },
                to: { ...position, width, height },
                parentId,
              });
            }
            position = from;
            if (resized) {
              width = prev.width;
              height = prev.height;
            }
          }
        } else {
          glides.current.delete(doc._id);
        }

        return {
          id: doc._id,
          type: doc.type,
          position,
          parentId,
          data: {
            doc,
            erasing: !!doc.stroke && erasingStrokes.has(doc.stroke),
          },
          width,
          height,
          selected: prev?.selected ?? false,
          dragging: prev?.dragging,
          resizing: prev?.resizing,
          measured: prev?.measured,
          // Dragging, selecting and connecting are left to the canvas, which
          // turns them off for read-only boards and while a drawing tool is
          // in use; a per-node true would override that.
          deletable: !readOnly,
          ...(doc.type === "ink" || doc.type === "point"
            ? { connectable: false }
            : {}),
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

  // Steps any glides along, a frame at a time, until they've all arrived. A
  // node someone picks up, or changes locally, stops gliding.
  const stepGlides = useCallback(() => {
    glideFrame.current = undefined;
    const now = performance.now();
    const current = new Map(nodesRef.current.map((n) => [n.id, n]));
    const steps = new Map<string, GlideBox & { glide: Glide }>();
    glides.current.forEach((glide, id) => {
      const node = current.get(id);
      if (
        !node ||
        node.dragging ||
        node.resizing ||
        node.parentId !== glide.parentId ||
        pending.current.has(id)
      ) {
        glides.current.delete(id);
        return;
      }
      // Starting a frame back means the first frame already moves.
      glide.start ??= now - 1000 / 60;
      const t = Math.min(1, (now - glide.start) / GLIDE_MS);
      const between = (a: number | undefined, b: number | undefined) =>
        a !== undefined && b !== undefined ? a + (b - a) * t : b;
      steps.set(id, {
        x: between(glide.from.x, glide.to.x)!,
        y: between(glide.from.y, glide.to.y)!,
        width: between(glide.from.width, glide.to.width),
        height: between(glide.from.height, glide.to.height),
        glide,
      });
      if (t >= 1) glides.current.delete(id);
    });
    if (steps.size > 0) {
      setNodes((nds) =>
        nds.map((n) => {
          const step = steps.get(n.id);
          // By the time this applies the node may have been rebuilt, into
          // another frame (where these coordinates mean nothing) or with a
          // newer glide starting from where it was; either way, leave it.
          const latest = glides.current.get(n.id);
          if (
            !step ||
            n.dragging ||
            n.resizing ||
            n.parentId !== step.glide.parentId ||
            (latest && latest !== step.glide)
          ) {
            return n;
          }
          return {
            ...n,
            position: { x: step.x, y: step.y },
            ...(step.width !== undefined ? { width: step.width } : {}),
            ...(step.height !== undefined ? { height: step.height } : {}),
          };
        }),
      );
    }
    if (glides.current.size > 0) {
      glideFrame.current = requestAnimationFrame(() => stepGlidesRef.current());
    }
  }, []);
  const stepGlidesRef = useRef(stepGlides);
  stepGlidesRef.current = stepGlides;

  // biome-ignore lint/correctness/useExhaustiveDependencies(nodes): new glides are registered while building nodes
  useEffect(() => {
    if (glides.current.size > 0 && glideFrame.current === undefined) {
      glideFrame.current = requestAnimationFrame(() => stepGlidesRef.current());
    }
  }, [nodes]);

  useEffect(
    () => () => {
      if (glideFrame.current !== undefined) {
        cancelAnimationFrame(glideFrame.current);
        glideFrame.current = undefined;
      }
    },
    [],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: generation forces a rebuild from server state after a failed write
  useEffect(() => {
    const now = Date.now();
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
        .map((saved): WhiteboardEdgeDoc => {
          const change = pendingEdges.current.get(saved._id);
          if (!change) return saved;
          if (
            edgeSatisfied(saved, change) ||
            now - change.at > PENDING_TIMEOUT
          ) {
            pendingEdges.current.delete(saved._id);
            return saved;
          }
          return withPendingEdge(saved, change);
        })
        .filter(
          (e: WhiteboardEdgeDoc) =>
            !e.hidden &&
            nodeIds.has(e.source) &&
            nodeIds.has(e.target) &&
            (showFeederArrows || !e.auto),
        )
        .map((e) => flowEdge(e, selected.has(e._id), lineColours, readOnly));
    });
  }, [
    edgeDocs,
    nodeDocs,
    livePuzzleIds,
    showFeederArrows,
    readOnly,
    lineColours,
    generation,
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

  // A line change shows straight away (in the same render as whatever made
  // it), until the server echoes it or says no.
  const drawing = useRef({ lineColours, readOnly });
  drawing.current = { lineColours, readOnly };
  const markEdgePending = useCallback(
    (id: string, change: Omit<PendingEdgeChange, "at">) => {
      const merged = {
        ...pendingEdges.current.get(id),
        ...change,
        at: Date.now(),
      };
      pendingEdges.current.set(id, merged);
      setEdges((eds) =>
        eds.map((e) =>
          e.id === id && e.data
            ? flowEdge(
                withPendingEdge(e.data.doc, merged),
                !!e.selected,
                drawing.current.lineColours,
                drawing.current.readOnly,
              )
            : e,
        ),
      );
    },
    [],
  );

  const clearEdgePending = useCallback((ids: string[]) => {
    ids.forEach((id) => pendingEdges.current.delete(id));
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
    markEdgePending,
    clearEdgePending,
  };
}
