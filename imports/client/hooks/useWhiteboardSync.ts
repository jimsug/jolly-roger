import { EJSON } from "meteor/ejson";
import { useTracker } from "meteor/react-meteor-data";
import type { Edge, Node, XYPosition } from "@xyflow/react";
import { MarkerType } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  LineStyleField,
  WhiteboardEdgeType,
} from "../../lib/models/WhiteboardEdges";
import WhiteboardEdges from "../../lib/models/WhiteboardEdges";
import type {
  WhiteboardColor,
  WhiteboardNodeType,
} from "../../lib/models/WhiteboardNodes";
import WhiteboardNodes from "../../lib/models/WhiteboardNodes";
import {
  ancestorsOf,
  arrangeUnits,
  sortParentsFirst,
  withoutParentLoops,
} from "../../lib/whiteboard/arrange";
import {
  COLLAPSED_FRAME_HEIGHT,
  foldedInto,
  foldLines,
} from "../../lib/whiteboard/collapse";
import { MAX_FRAME_DEPTH } from "../../lib/whiteboard/limits";
import colors from "../components/whiteboard/colors";

export type WhiteboardFlowNode = Node<
  {
    doc: WhiteboardNodeType;
    erasing?: boolean;
    // A frame drawn folded to its header, hiding what's in it.
    collapsed?: boolean;
    // A frame collapsed for everyone, counting a change this viewer has
    // just made, whether or not it's drawn folded for them.
    collapsedForAll?: boolean;
  },
  WhiteboardNodeType["type"]
>;

export type WhiteboardFlowEdge = Edge<
  // folded: drawn to a collapsed frame in place of one or both of its ends.
  { doc: WhiteboardEdgeType; folded?: boolean },
  "whiteboard"
>;

// A local change we've sent but the server hasn't echoed back yet. While it's
// outstanding we show the local value; there are no client-side method stubs
// to do this for us.
interface PendingChange {
  position?: XYPosition;
  parent?: string | null;
  width?: number;
  height?: number;
  at: number;
}

// The same for a line: its ends and look. A null label or colour clears it.
type PendingEdgeChange = Partial<
  Pick<
    WhiteboardEdgeType,
    "source" | "target" | Exclude<LineStyleField, "color">
  >
> & { label?: string | null; color?: WhiteboardColor | null; at: number };

const PENDING_TIMEOUT = 10_000;

// A frame this viewer has just collapsed or expanded, shown that way until
// the server echoes it or PENDING_TIMEOUT passes.
interface PendingCollapse {
  value: boolean;
  at: number;
}

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

interface Glide {
  from: XYPosition;
  to: XYPosition;
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

// Whether a node shown at one size is now to be another.
const resizedFrom = (
  prev: { width?: number; height?: number },
  width: number | undefined,
  height: number | undefined,
) =>
  (prev.width !== undefined &&
    width !== undefined &&
    !near(prev.width, width)) ||
  (prev.height !== undefined &&
    height !== undefined &&
    !near(prev.height, height));

// Unset, false and empty all mean "not set" for a line's fields.
const plain = (value: unknown) =>
  value === undefined || value === null || value === false || value === ""
    ? null
    : value;

function edgeSatisfied(doc: WhiteboardEdgeType, p: PendingEdgeChange) {
  return (Object.keys(p) as (keyof PendingEdgeChange)[]).every(
    (key) =>
      key === "at" ||
      plain(doc[key as keyof WhiteboardEdgeType]) === plain(p[key]),
  );
}

function pendingSatisfied(doc: WhiteboardNodeType, p: PendingChange) {
  if (p.position && !samePosition(doc.position, p.position)) return false;
  if (p.parent !== undefined && (doc.parent ?? null) !== p.parent) {
    return false;
  }
  if (p.width !== undefined && !near(doc.width, p.width)) return false;
  if (p.height !== undefined && !near(doc.height, p.height)) return false;
  return true;
}

// A saved line with a pending change applied.
function withPendingEdge(
  saved: WhiteboardEdgeType,
  change: PendingEdgeChange,
): WhiteboardEdgeType {
  const { at: _at, label, color, ...rest } = change;
  return {
    ...saved,
    ...rest,
    ...(label !== undefined ? { label: label ?? undefined } : {}),
    ...(color !== undefined ? { color: color ?? undefined } : {}),
  };
}

// What screen readers call lines, by kind.
export interface LineLabels {
  line: string;
  feeder: string;
}

// A saved line as React Flow draws it, between `ends` when a collapsed frame
// stands in for one of its own.
function flowEdge(
  e: WhiteboardEdgeType,
  selected: boolean,
  lineColors: { text: string; muted: string },
  labels: LineLabels,
  ends?: { source: string; target: string; folded: boolean },
): WhiteboardFlowEdge {
  const color = e.auto
    ? lineColors.muted
    : ((e.color && colors.stroke[e.color]) ?? lineColors.text);
  const marker = {
    type: MarkerType.ArrowClosed,
    width: e.auto ? 14 : 18,
    height: e.auto ? 14 : 18,
    color,
  };
  const arrowHead = e.arrowHead ?? "end";
  return {
    id: e._id,
    source: ends?.source ?? e.source,
    target: ends?.target ?? e.target,
    type: "whiteboard",
    data: ends?.folded ? { doc: e, folded: true } : { doc: e },
    markerEnd: arrowHead === "none" ? undefined : marker,
    markerStart: arrowHead === "both" ? marker : undefined,
    selected,
    ariaLabel: e.auto ? labels.feeder : labels.line,
  };
}

// React Flow lets a node that can be selected or dragged take the pointer
// anywhere in its box, and an ink segment's box can cover the cards it was
// drawn round. Only its painted stroke takes the pointer (see InkNode).
const INK_STYLE = { pointerEvents: "none" } as const;

const sameItems = <T>(a: T[], b: T[]) =>
  a.length === b.length && a.every((item, i) => item === b[i]);

const sameFolds = (a: Map<string, string>, b: Map<string, string>) =>
  a.size === b.size && [...a].every(([id, frame]) => b.get(id) === frame);

const NO_FOLDS = new Map<string, string>();
const NO_LINES: ReadonlySet<string> = new Set();

// Minimongo hands back a fresh copy of every document whenever anything on
// the board changes. This keeps the previous copy of each one that hasn't
// changed, so what's built from them (the nodes and lines React Flow is
// given, and each node's own memos, such as an ink stroke's outline) only
// changes where something did.
function useUnchangedDocs<T extends { _id: string }>(docs: T[]): T[] {
  const previous = useRef(new Map<string, T>());
  return useMemo(() => {
    const stable = docs.map((doc) => {
      const old = previous.current.get(doc._id);
      return old && EJSON.equals(old, doc) ? old : doc;
    });
    previous.current = new Map(stable.map((doc) => [doc._id, doc]));
    return stable;
  }, [docs]);
}

// What each node is inside, for ancestorsOf.
const parentsOf = (nodes: Node[]) =>
  new Map(nodes.map((n) => [n.id, { parent: n.parentId }]));

// React Flow lifts a child to at least its parent's z + 1, so frames are pushed
// well below everything else (nested ones a step above their parent), shapes
// sit above any frame, cards above shapes, and annotations above cards. A
// filled shape can then mark out a group of cards without covering them, and
// the cards inside an outline still take clicks and line ends.
const FRAME_Z = -1000;
const SHAPE_Z = -1;
const ANNOTATION_Z = 1;
// A line's free ends stack with cards, so lines ending in them don't draw over
// stickies and text. Their grips are drawn above everything anyway.
const POINT_Z = 0;
// How far React Flow lifts a selected node above where it would stack.
const SELECTED_NODE_Z = 1000;

function withStacking(nodes: WhiteboardFlowNode[]): WhiteboardFlowNode[] {
  const parents = parentsOf(nodes);
  const zIndexOf = (node: WhiteboardFlowNode) => {
    if (node.type === "frame") {
      return FRAME_Z + ancestorsOf(parents, node.id).length;
    }
    if (node.type === "point") return POINT_Z;
    if (node.type === "shape") return SHAPE_Z;
    return node.type === "puzzle" ? undefined : ANNOTATION_Z;
  };
  return nodes.map((node) => {
    const zIndex = zIndexOf(node);
    return node.zIndex === zIndex ? node : { ...node, zIndex };
  });
}

// React Flow's lift would put a selected shape over the cards it sits under,
// so a selected shape is passed to it that much lower, to land where it was.
// Each copy is kept while its node is unchanged, so React Flow sees the same
// object.
const keptDown = new WeakMap<WhiteboardFlowNode, WhiteboardFlowNode>();
export function keepSelectedShapeDown(node: WhiteboardFlowNode) {
  if (node.type !== "shape" || !node.selected) return node;
  let copy = keptDown.get(node);
  if (!copy) {
    copy = { ...node, zIndex: SHAPE_Z - SELECTED_NODE_Z };
    keptDown.set(node, copy);
  }
  return copy;
}

// The selection as units that align and distribute as one (see
// arrangeUnits), with each unit's nodes. Locked nodes are left out.
export function selectionUnits(
  nodes: WhiteboardFlowNode[],
  edges: WhiteboardFlowEdge[],
): Map<string, WhiteboardFlowNode[]> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const units = arrangeUnits(
    nodes.map((n) => ({
      id: n.id,
      type: n.type ?? "",
      parent: n.parentId,
      selected: n.selected && !n.data.doc.locked,
      stroke: n.data.doc.stroke,
    })),
    edges,
  );
  return new Map(
    [...units].map(([key, ids]) => [
      key,
      ids.map((id) => byId.get(id)).filter((n): n is WhiteboardFlowNode => !!n),
    ]),
  );
}

export default function useWhiteboardSync({
  boardId,
  livePuzzleIds,
  showFeederArrows,
  remoteDrags,
  erasingStrokes,
  lineColors,
  lineLabels,
  override,
  peeked,
  busy,
  hideInk,
}: {
  boardId: string;
  livePuzzleIds: Set<string>;
  showFeederArrows: boolean;
  // Whether this viewer has hidden ink. Ink is then kept as hidden nodes
  // (with no points, see whiteboardInk), so a frame resized, fitted or tidied
  // still accounts for what's in it.
  hideInk: boolean;
  remoteDrags: Map<string, RemoteDrag>;
  erasingStrokes: Set<string>;
  // Collapsed frames this viewer has opened for themselves.
  peeked: Set<string>;
  // Nodes this viewer is dragging, resizing or typing in. A frame someone
  // else collapses stays open here while anything inside it is busy.
  busy: Set<string>;
  // Theme colours for lines with no colour of their own, and feeder arrows.
  lineColors: { text: string; muted: string };
  lineLabels: LineLabels;
  // Shown instead of the board, as an earlier version of it is previewed.
  override?: { nodes: WhiteboardNodeType[]; edges: WhiteboardEdgeType[] };
}) {
  // The board is still tracked while an override shows, so the hooks run the
  // same either way and coming back to it needs no fresh read.
  const trackedNodes = useTracker(
    () => WhiteboardNodes.find({ board: boardId }).fetch(),
    [boardId],
  );
  const trackedEdges = useTracker(
    () => WhiteboardEdges.find({ board: boardId }).fetch(),
    [boardId],
  );
  const nodeDocs = useUnchangedDocs(override?.nodes ?? trackedNodes);
  const edgeDocs = useUnchangedDocs(override?.edges ?? trackedEdges);
  // What's on the board: anything not taken off it, and a card only while its
  // puzzle is still in the hunt.
  const shownDocs = useMemo(
    () =>
      nodeDocs.filter(
        (doc) =>
          !doc.hidden &&
          (doc.type !== "puzzle" ||
            (!!doc.puzzle && livePuzzleIds.has(doc.puzzle))),
      ),
    [nodeDocs, livePuzzleIds],
  );

  const [nodes, setNodes] = useState<WhiteboardFlowNode[]>([]);
  const [edges, setEdges] = useState<WhiteboardFlowEdge[]>([]);
  const pending = useRef(new Map<string, PendingChange>());
  const pendingCollapse = useRef(new Map<string, PendingCollapse>());
  const pendingEdges = useRef(new Map<string, PendingEdgeChange>());
  // Each node a collapsed frame hides, mapped to the frame drawn in its
  // place (see foldedInto). Worked out with the nodes, since pending changes
  // count, and kept the same object until it changes, for the lines.
  const [folded, setFolded] = useState(NO_FOLDS);
  // The lines drawn, or that would be if every collapsed frame were open, by
  // id: the ones the board's search can find.
  const [shownLines, setShownLines] = useState(NO_LINES);
  // Bumped to force a rebuild from the server state, e.g. after a failed
  // write.
  const [generation, setGeneration] = useState(0);
  const glides = useRef(new Map<string, Glide>());
  const glideFrame = useRef<number | undefined>(undefined);
  // The nodes as last rendered, for stepping glides between renders.
  const nodesRef = useRef(nodes);

  // generation forces a rebuild from the server's state after a failed write.
  useEffect(() => {
    const now = Date.now();
    // Local changes the server has caught up with, or that have waited too
    // long, give way to what it has.
    shownDocs.forEach((doc) => {
      const change = pending.current.get(doc._id);
      if (
        change &&
        (pendingSatisfied(doc, change) || now - change.at > PENDING_TIMEOUT)
      ) {
        pending.current.delete(doc._id);
      }
      const collapse = pendingCollapse.current.get(doc._id);
      if (
        collapse &&
        (!!doc.collapsed === collapse.value ||
          now - collapse.at > PENDING_TIMEOUT)
      ) {
        pendingCollapse.current.delete(doc._id);
      }
    });

    // What collapsed frames hide. A frame stays open for this viewer while
    // they've peeked into it, or anything in it is busy or has a change on
    // its way to the server.
    const foldNodes = shownDocs.map((doc) => {
      const change = pending.current.get(doc._id);
      const collapse = pendingCollapse.current.get(doc._id);
      return {
        _id: doc._id,
        parent:
          change?.parent !== undefined
            ? (change.parent ?? undefined)
            : doc.parent,
        collapsed: doc.type === "frame" && (collapse?.value ?? !!doc.collapsed),
      };
    });
    const foldById = new Map(foldNodes.map((n) => [n._id, n]));
    const open = new Set(peeked);
    [...busy, ...pending.current.keys()].forEach((id) => {
      ancestorsOf(foldById, id).forEach((frame) => open.add(frame));
    });
    const nextFolded = foldedInto(foldNodes, open);
    setFolded((current) =>
      sameFolds(current, nextFolded) ? current : nextFolded,
    );

    setNodes((previous) => {
      const prevById = new Map(previous.map((n) => [n.id, n]));
      // A free end only shows while its line does: a line attached to a
      // hidden card or frame takes its free end with it, as does one inside a
      // collapsed frame.
      const pointIds = new Set(
        shownDocs.filter((d) => d.type === "point").map((d) => d._id),
      );
      const shownIds = new Set(shownDocs.map((d) => d._id));
      const pointsInUse = new Set(
        foldLines(
          edgeDocs.filter(
            (e) =>
              !e.hidden && shownIds.has(e.source) && shownIds.has(e.target),
          ),
          nextFolded,
        ).flatMap((e) => [e.source, e.target].filter((id) => pointIds.has(id))),
      );
      // Whatever was changed most recently draws on top of others at the
      // same level, the same for everyone.
      const stamps = new Map(
        shownDocs.map((d) => [d._id, +(d.updatedAt ?? d.createdAt ?? 0)]),
      );
      const visible = shownDocs
        .filter(
          (d) =>
            !nextFolded.has(d._id) &&
            (d.type !== "point" || pointsInUse.has(d._id)),
        )
        .toSorted(
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
        for (let depth = 0; node && depth < MAX_FRAME_DEPTH; depth++) {
          x += node.position.x;
          y += node.position.y;
          node = node.parentId ? prevById.get(node.parentId) : undefined;
        }
        return { x, y };
      };
      const resizing = new Set(
        previous.filter((n) => n.resizing).map((n) => n.id),
      );

      // Nodes that have just snapped to a size from elsewhere.
      const snapped = new Set<string>();
      const built = visible.map((doc): WhiteboardFlowNode => {
        const change = pending.current.get(doc._id);
        const prev = prevById.get(doc._id);
        const collapsedForAll =
          doc.type === "frame" ? !!foldById.get(doc._id)?.collapsed : undefined;
        // Folded to its header, with its stored size kept for when it opens.
        const collapsed = !!collapsedForAll && !open.has(doc._id);
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
        let height = collapsed
          ? COLLAPSED_FRAME_HEIGHT
          : (change?.height ?? doc.height);
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
          // Folding or opening a frame, and a size change from elsewhere
          // (someone else's resize, Fit to contents, a frame growing, or
          // undoing one of those), snap: a size that changes on every
          // animation frame has React Flow's ResizeObserver report a loop.
          !!prev.data.collapsed === collapsed &&
          !resizedFrom(prev, width, height) &&
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
          if (samePosition(from, position)) {
            glides.current.delete(doc._id);
          } else {
            const glide = glides.current.get(doc._id);
            if (
              !glide ||
              glide.parentId !== parentId ||
              !samePosition(glide.to, position)
            ) {
              glides.current.set(doc._id, { from, to: position, parentId });
            }
            position = from;
          }
        } else {
          glides.current.delete(doc._id);
          if (!change && prev && resizedFrom(prev, width, height)) {
            snapped.add(doc._id);
          }
        }

        const erasing = !!doc.stroke && erasingStrokes.has(doc.stroke);
        const hidden = doc.type === "ink" && (hideInk || !doc.points);
        // A node that hasn't changed is handed back as it was, so React Flow
        // skips it. One that's gliding is built afresh even so, since a new
        // node is what starts its glide moving (see the effect on nodes).
        if (
          !glides.current.has(doc._id) &&
          prev?.data.doc === doc &&
          prev.data.erasing === erasing &&
          prev.data.collapsed === collapsed &&
          prev.data.collapsedForAll === collapsedForAll &&
          prev.parentId === parentId &&
          prev.position.x === position.x &&
          prev.position.y === position.y &&
          prev.width === width &&
          prev.height === height &&
          !!prev.hidden === hidden
        ) {
          return prev;
        }
        return {
          id: doc._id,
          type: doc.type,
          position,
          parentId,
          data: { doc, erasing, collapsed, collapsedForAll },
          width,
          height,
          hidden,
          // Something hidden can't stay selected, or Delete would take it.
          selected: !hidden && (prev?.selected ?? false),
          dragging: prev?.dragging,
          resizing: prev?.resizing,
          measured: prev?.measured,
          // Dragging, selecting, connecting and deleting are left to the
          // canvas, which turns them off for read-only boards and while a
          // drawing tool is in use; a per-node true would override that. A
          // locked node can't be dragged, which also keeps it out of
          // arrow-key nudges.
          draggable: doc.locked ? false : undefined,
          style: doc.type === "ink" ? INK_STYLE : undefined,
        };
      });
      // What's directly in a frame that has snapped to a new size snaps with
      // it, so contents kept still by a resize from the top or left don't
      // jump and glide back. A node with a glide was built afresh above, so
      // it can be changed in place.
      if (snapped.size > 0) {
        built.forEach((n) => {
          const glide =
            n.parentId && snapped.has(n.parentId)
              ? glides.current.get(n.id)
              : undefined;
          if (!glide) return;
          glides.current.delete(n.id);
          n.position = glide.to;
        });
      }
      const next = withStacking(sortParentsFirst(withoutParentLoops(built)));
      return sameItems(next, previous) ? previous : next;
    });
  }, [
    shownDocs,
    edgeDocs,
    remoteDrags,
    erasingStrokes,
    peeked,
    busy,
    hideInk,
    generation,
  ]);

  // Steps any glides along, a frame at a time, until they've all arrived. A
  // node someone picks up, or changes locally, stops gliding.
  const stepGlides = useCallback(() => {
    glideFrame.current = undefined;
    const now = performance.now();
    const current = new Map(nodesRef.current.map((n) => [n.id, n]));
    const steps = new Map<string, XYPosition & { glide: Glide }>();
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
      steps.set(id, {
        x: glide.from.x + (glide.to.x - glide.from.x) * t,
        y: glide.from.y + (glide.to.y - glide.from.y) * t,
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
          return { ...n, position: { x: step.x, y: step.y } };
        }),
      );
    }
    if (glides.current.size > 0) {
      glideFrame.current = requestAnimationFrame(() => stepGlidesRef.current());
    }
  }, []);
  const stepGlidesRef = useRef(stepGlides);

  // New glides are registered while the nodes are built.
  useEffect(() => {
    nodesRef.current = nodes;
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

  // The colours and labels lines were last drawn with, to tell when they
  // change.
  const edgeLook = useRef<
    { colors: { text: string; muted: string }; labels: LineLabels } | undefined
  >(undefined);

  // generation forces a rebuild from the server's state after a failed write.
  useEffect(() => {
    const now = Date.now();
    const sameLook =
      edgeLook.current?.colors === lineColors &&
      edgeLook.current.labels === lineLabels;
    edgeLook.current = { colors: lineColors, labels: lineLabels };
    const nodeIds = new Set(shownDocs.map((d) => d._id));
    const drawn = edgeDocs
      .map((saved): WhiteboardEdgeType => {
        const change = pendingEdges.current.get(saved._id);
        if (!change) return saved;
        if (edgeSatisfied(saved, change) || now - change.at > PENDING_TIMEOUT) {
          pendingEdges.current.delete(saved._id);
          return saved;
        }
        return withPendingEdge(saved, change);
      })
      .filter(
        (e: WhiteboardEdgeType) =>
          !e.hidden &&
          nodeIds.has(e.source) &&
          nodeIds.has(e.target) &&
          (showFeederArrows || !e.auto),
      );
    setShownLines((current) =>
      current.size === drawn.length && drawn.every((e) => current.has(e._id))
        ? current
        : new Set(drawn.map((e) => e._id)),
    );
    setEdges((previous) => {
      const prevById = new Map(previous.map((e) => [e.id, e]));
      // Ends inside a collapsed frame go to the frame; a line within one
      // isn't drawn.
      const next = foldLines(drawn, folded).map((ends) => {
        const e = ends.line;
        const prev = prevById.get(e._id);
        // A line that hasn't changed is handed back as it was, so React
        // Flow skips it.
        return sameLook &&
          prev?.data?.doc === e &&
          prev.source === ends.source &&
          prev.target === ends.target &&
          !!prev.data.folded === ends.folded
          ? prev
          : flowEdge(e, !!prev?.selected, lineColors, lineLabels, ends);
      });
      return sameItems(next, previous) ? previous : next;
    });
  }, [
    edgeDocs,
    shownDocs,
    folded,
    showFeederArrows,
    lineColors,
    lineLabels,
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
    ids.forEach((id) => {
      pending.current.delete(id);
      pendingCollapse.current.delete(id);
    });
    setGeneration((g) => g + 1);
  }, []);

  // Shows frames collapsed or expanded straight away, until the server
  // echoes it or says no (clearPending).
  const markCollapsed = useCallback((ids: string[], value: boolean) => {
    const at = Date.now();
    ids.forEach((id) => pendingCollapse.current.set(id, { value, at }));
    setGeneration((g) => g + 1);
  }, []);

  // A line change shows straight away (in the same render as whatever made
  // it), until the server echoes it or says no.
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
                lineColors,
                lineLabels,
                e.data.folded
                  ? { source: e.source, target: e.target, folded: true }
                  : undefined,
              )
            : e,
        ),
      );
    },
    [lineColors, lineLabels],
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
    folded,
    shownLines,
    markPending,
    clearPending,
    markCollapsed,
    markEdgePending,
    clearEdgePending,
  };
}
