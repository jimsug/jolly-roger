import { Meteor } from "meteor/meteor";
import { Random } from "meteor/random";
import { useTracker } from "meteor/react-meteor-data";
import { faArrowPointer } from "@fortawesome/free-solid-svg-icons/faArrowPointer";
import { faCircleCheck } from "@fortawesome/free-solid-svg-icons/faCircleCheck";
import { faComment } from "@fortawesome/free-solid-svg-icons/faComment";
import { faDiagramProject } from "@fortawesome/free-solid-svg-icons/faDiagramProject";
import { faEraser } from "@fortawesome/free-solid-svg-icons/faEraser";
import { faEyeSlash } from "@fortawesome/free-solid-svg-icons/faEyeSlash";
import { faFont } from "@fortawesome/free-solid-svg-icons/faFont";
import { faNoteSticky } from "@fortawesome/free-solid-svg-icons/faNoteSticky";
import { faObjectGroup } from "@fortawesome/free-solid-svg-icons/faObjectGroup";
import { faPen } from "@fortawesome/free-solid-svg-icons/faPen";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type {
  Connection,
  NodeChange,
  OnBeforeDelete,
  OnMoveEnd,
  OnNodeDrag,
  Viewport,
  XYPosition,
} from "@xyflow/react";
import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  ConnectionMode,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  ViewportPortal,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import Form from "react-bootstrap/Form";
import styled, { css, useTheme } from "styled-components";
import Flags from "../../../Flags";
import Puzzles from "../../../lib/models/Puzzles";
import type {
  WhiteboardColour,
  WhiteboardStrokeWidth,
} from "../../../lib/models/WhiteboardNodes";
import WhiteboardNodes, {
  WhiteboardStrokeWidths,
} from "../../../lib/models/WhiteboardNodes";
import WhiteboardPresence from "../../../lib/models/WhiteboardPresence";
import puzzlesForHunt from "../../../lib/publications/puzzlesForHunt";
import tagsForHunt from "../../../lib/publications/tagsForHunt";
import whiteboardContents from "../../../lib/publications/whiteboardContents";
import whiteboardPresence from "../../../lib/publications/whiteboardPresence";
import type {
  AlignMode,
  ArrangeItem,
  DistributeAxis,
} from "../../../lib/whiteboard/arrange";
import {
  alignItems,
  companionsOf,
  distributeItems,
} from "../../../lib/whiteboard/arrange";
import type { CommentAnchor } from "../../../lib/whiteboard/comments";
import { commentPosition, isUnread } from "../../../lib/whiteboard/comments";
import type { AttachHit } from "../../../lib/whiteboard/connectors";
import {
  attachHit,
  compareAttachHits,
  contains,
  snapAngle,
} from "../../../lib/whiteboard/connectors";
import type { InkPoint } from "../../../lib/whiteboard/ink";
import {
  distanceToInk,
  InkSegmenter,
  inkBounds,
  inkPath,
  relativeTo,
  STROKE_SIZES,
  simulatedPressure,
} from "../../../lib/whiteboard/ink";
import { CARD_HEIGHT, CARD_WIDTH } from "../../../lib/whiteboard/layout";
import { MAX_BATCH, POINT_SIZE } from "../../../lib/whiteboard/limits";
import deleteWhiteboardEdges from "../../../methods/deleteWhiteboardEdges";
import deleteWhiteboardNodes from "../../../methods/deleteWhiteboardNodes";
import type { WhiteboardEdgeInput } from "../../../methods/upsertWhiteboardEdges";
import upsertWhiteboardEdges from "../../../methods/upsertWhiteboardEdges";
import type { WhiteboardNodeInput } from "../../../methods/upsertWhiteboardNodes";
import upsertWhiteboardNodes from "../../../methods/upsertWhiteboardNodes";
import usePuzzlePeople from "../../hooks/usePuzzlePeople";
import useTypedSubscribe from "../../hooks/useTypedSubscribe";
import useWhiteboardLive from "../../hooks/useWhiteboardLive";
import ArrangeIcon from "./ArrangeIcon";
import ColourPicker from "./ColourPicker";
import type { CommentPin } from "./CommentLayer";
import CommentLayer from "./CommentLayer";
import CommentPanel from "./CommentPanel";
import CursorLayer from "./CursorLayer";
import { FILL_COLOURS, STROKE_COLOURS } from "./colours";
import describeCommentTarget from "./commentTarget";
import FrameLabelLayer from "./FrameLabelLayer";
import FrameNode from "./FrameNode";
import InkNode from "./InkNode";
import type { LineStyle } from "./LineStyleControls";
import LineStyleControls, { DEFAULT_LINE_STYLE } from "./LineStyleControls";
import { ArrowHeadIcon } from "./LineStyleIcon";
import { readLocal, writeLocal } from "./localStore";
import PointNode from "./PointNode";
import PuzzleCardNode from "./PuzzleCardNode";
import StickyNode from "./StickyNode";
import TextNode from "./TextNode";
import useComments, { useSeenComments } from "./useComments";
import type { WhiteboardFlowNode } from "./useWhiteboardSync";
import {
  selectionUnits,
  sortParentsFirst,
  useWhiteboardSync,
} from "./useWhiteboardSync";
import type { WhiteboardActions } from "./WhiteboardContext";
import { PeopleContext, WhiteboardContext } from "./WhiteboardContext";
import type { WhiteboardEdgeType } from "./WhiteboardEdge";
import WhiteboardEdge from "./WhiteboardEdge";

const nodeTypes = {
  puzzle: PuzzleCardNode,
  frame: FrameNode,
  sticky: StickyNode,
  text: TextNode,
  ink: InkNode,
  point: PointNode,
};
const edgeTypes = { whiteboard: WhiteboardEdge };

type PlaceTool = "sticky" | "text" | "frame";
type Tool = "select" | "pen" | "eraser" | "connector" | "comment" | PlaceTool;

// One end of a line: attached to a node, or free at a point (inside a frame,
// if it's drawn in one).
type Endpoint = { node: string } | { point: XYPosition; parent?: string };

interface Connecting {
  // The end that stays put: where a new line started, or the far end of a
  // line whose end is being moved.
  fixed: Endpoint;
  current: XYPosition;
  target?: Endpoint;
  // Set when moving an existing line's end rather than drawing a new line.
  edgeId?: string;
  end?: "source" | "target";
}

const isPlaceTool = (tool: Tool): tool is PlaceTool =>
  tool === "sticky" || tool === "text" || tool === "frame";

// Size when placed with a click; dragging out a box sets the size instead.
const DEFAULT_SIZES: Record<PlaceTool, { width: number; height: number }> = {
  sticky: { width: 200, height: 160 },
  text: { width: 240, height: 48 },
  frame: { width: 2 * CARD_WIDTH + 64, height: 2 * CARD_HEIGHT + 104 },
};
const MIN_SIZES: Record<PlaceTool, { width: number; height: number }> = {
  sticky: { width: 80, height: 60 },
  text: { width: 60, height: 32 },
  frame: { width: CARD_HEIGHT, height: CARD_HEIGHT },
};
// A press that moves less than this (in screen pixels) is a click.
const CLICK_SLOP = 4;
// How close (in screen pixels) a line end has to be to something to attach to
// it: just outside its edge, or either side of a frame's border.
const ATTACH_MARGIN = 8;
const FRAME_ATTACH_MARGIN = 12;

const CanvasWrapper = styled.div<{ $tool: Tool }>`
  /* stylelint-disable selector-class-pattern -- React Flow's class names */
  position: relative;
  width: 100%;
  height: 100%;
  cursor: ${({ $tool }) => ($tool === "select" ? "auto" : "crosshair")};

  /* While drawing, nothing on the board can be picked up, so nothing should
     look like it can. */
  ${({ $tool }) =>
    $tool !== "select" &&
    css`
      .react-flow__pane,
      .react-flow__node,
      .react-flow__node * {
        cursor: crosshair;
      }
    `}

  .react-flow__node.jr-glide {
    transition: transform 120ms linear;
  }

  &.jr-interacting .react-flow__node {
    transition: none;
  }

  /* Line labels, grips and attribution sit above everything, so a grip on
     the edge of the thing a line is attached to can still be grabbed. */
  .react-flow__edgelabel-renderer {
    z-index: 1002;
  }

  /* Only the painted ink is clickable, not its bounding box. */
  .react-flow__node-ink {
    pointer-events: none;
  }

  .react-flow__handle {
    opacity: 0;
    width: 10px;
    height: 10px;
  }

  .react-flow__node:hover .react-flow__handle,
  .react-flow__node.selected .react-flow__handle,
  .react-flow__handle.connectingfrom,
  .react-flow__handle.connectingto {
    opacity: 1;
  }

  /* Stickies, cards and text have their own selection styling. */
  .react-flow__node.selected,
  .react-flow__node:focus,
  .react-flow__node:focus-visible {
    outline: none;
  }
`;

const ToolBox = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  padding: 6px;
  border-radius: 8px;
  background: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.border};
  box-shadow: 0 2px 6px rgb(0 0 0 / 12%);
`;

const SidePanel = styled.div`
  width: 260px;
  max-height: 60vh;
  overflow-y: auto;
  padding: 8px;
  border-radius: 8px;
  background: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.border};
  box-shadow: 0 2px 6px rgb(0 0 0 / 12%);
  font-size: 13px;
`;

const HiddenRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;

  span {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const ReadOnlyNote = styled.span`
  padding: 0 4px;
  font-size: 13px;
`;

const PlaceGhost = styled.div<{ $tool: PlaceTool }>`
  position: absolute;
  left: 0;
  top: 0;
  pointer-events: none;
  border: 2px dashed ${({ theme }) => theme.colors.primary};
  border-radius: ${({ $tool }) => ($tool === "frame" ? "10px" : "2px")};
  background: ${({ $tool }) =>
    $tool === "sticky" ? `${FILL_COLOURS.yellow}99` : "transparent"};
`;

const LocalStroke = styled.svg`
  position: absolute;
  left: 0;
  top: 0;
  overflow: visible;
  pointer-events: none;
`;

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

// TypedMethod logs failures; a rejected edit just falls back to whatever the
// server has.
const ignoreResult = () => {};

interface Drawing {
  stroke: string;
  colour: WhiteboardColour;
  strokeWidth: WhiteboardStrokeWidth;
  segmenter: InkSegmenter;
  committed: number;
  parent?: string;
}

// How long a pin pulses after the board pans to it.
const PULSE_MS = 2200;

interface CanvasProps {
  boardId: string;
  huntId: string;
  // The board's backing puzzle, whose chat holds the comments.
  puzzleId: string;
  readOnly: boolean;
  focusRef?: React.MutableRefObject<
    ((threadId: string) => boolean) | undefined
  >;
  // A comment to show once the board has loaded (from a ?comment= link).
  initialComment?: string;
  onInitialCommentShown?: () => void;
}

const CanvasInner = ({
  boardId,
  huntId,
  puzzleId,
  readOnly,
  focusRef,
  initialComment,
  onInitialCommentShown,
}: CanvasProps) => {
  const theme = useTheme();
  const flow = useReactFlow<WhiteboardFlowNode, WhiteboardEdgeType>();
  const wrapperRef = useRef<HTMLDivElement>(null);

  const contentsLoading = useTypedSubscribe(whiteboardContents, { boardId });
  const puzzlesLoading = useTypedSubscribe(puzzlesForHunt, { huntId });
  useTypedSubscribe(tagsForHunt, { huntId });
  const people = usePuzzlePeople(huntId);

  const liveEnabled = useTracker(
    () => !Flags.active("disable.whiteboard_live"),
    [],
  );
  useTypedSubscribe(liveEnabled ? whiteboardPresence : undefined, {
    boardId,
  });
  const presence = useTracker(
    () =>
      liveEnabled ? WhiteboardPresence.find({ board: boardId }).fetch() : [],
    [boardId, liveEnabled],
  );
  const live = useWhiteboardLive(boardId, liveEnabled && !readOnly);

  // Cursor moves change presence constantly; only rebuild nodes when what
  // people are dragging actually changes.
  const dragsKey = JSON.stringify(
    presence.flatMap((p) => p.drag ?? []).map((d) => [d.node, d.x, d.y]),
  );
  const remoteDrags = useMemo(
    () =>
      new Map(
        (JSON.parse(dragsKey) as [string, number, number][]).map(
          ([node, x, y]) => [node, { x, y }],
        ),
      ),
    [dragsKey],
  );

  const livePuzzles = useTracker(
    () =>
      Puzzles.find(
        { hunt: huntId, kind: { $ne: "whiteboard" } },
        { fields: { _id: 1, title: 1 } },
      ).fetch(),
    [huntId],
  );
  const livePuzzleIds = useMemo(
    () => new Set(livePuzzles.map((p) => p._id)),
    [livePuzzles],
  );

  const viewportKey = `whiteboard:viewport:${boardId}`;
  const savedViewport = useMemo(
    () => readLocal<Viewport>(viewportKey),
    [viewportKey],
  );
  const [showFeederArrows, setShowFeederArrows] = useState<boolean>(
    () => readLocal<boolean>("whiteboard:feederArrows") ?? true,
  );
  const [tool, setTool] = useState<Tool>("select");
  const [penColour, setPenColour] = useState<WhiteboardColour>(
    () => readLocal<WhiteboardColour>("whiteboard:penColour") ?? "black",
  );
  const [penWidth, setPenWidth] = useState<WhiteboardStrokeWidth>(
    () => readLocal<WhiteboardStrokeWidth>("whiteboard:penWidth") ?? "medium",
  );
  const [showHidden, setShowHidden] = useState(false);
  const [showResolved, setShowResolved] = useState<boolean>(
    () => readLocal<boolean>("whiteboard:showResolvedComments") ?? false,
  );
  const [openThread, setOpenThread] = useState<string | null>(null);
  const [draft, setDraft] = useState<CommentAnchor | null>(null);
  const [pulse, setPulse] = useState<string | undefined>();
  const pulseTimer = useRef<number | undefined>(undefined);
  const commentPress = useRef<XYPosition | undefined>(undefined);
  // A comment just sent, to open once it comes back from the server.
  const sentDraft = useRef<{ anchor: CommentAnchor; at: number } | undefined>(
    undefined,
  );
  // Where a sticky, text box or frame will go: the press point and the
  // current pointer while placing, or just the pointer while hovering.
  const [placing, setPlacing] = useState<{
    start: XYPosition;
    current: XYPosition;
  } | null>(null);
  const [hover, setHover] = useState<XYPosition | null>(null);
  // What a line end would attach to: under the pointer with the line tool
  // before pressing, or under a free end being dragged.
  const [attachPreview, setAttachPreview] = useState<string | undefined>();
  const [connecting, setConnecting] = useState<Connecting | null>(null);
  const [lineStyle, setLineStyle] = useState<LineStyle>(() => ({
    ...DEFAULT_LINE_STYLE,
    ...readLocal<Partial<LineStyle>>("whiteboard:lineStyle"),
  }));
  // Nodes carried along by a node being moved (free line ends, the rest of an
  // ink stroke), saved when the move ends.
  const companions = useRef(new Set<string>());
  const dragActive = useRef(false);
  // Nodes moved with the arrow keys, saved shortly after the last press.
  const nudged = useRef(new Set<string>());
  const nudgeTimer = useRef<number | undefined>(undefined);
  // Attaches a line's free end that's been dropped onto something; returns
  // whether it did. Set once the endpoint helpers below exist.
  const attachDroppedEndRef = useRef<(node: WhiteboardFlowNode) => boolean>(
    () => false,
  );
  // What a free end being dragged would attach to if dropped now.
  const droppedEndTargetRef = useRef<
    (node: WhiteboardFlowNode) => string | undefined
  >(() => undefined);
  const beginEndpointDragRef = useRef<
    (
      edgeId: string,
      end: "source" | "target",
      event: React.PointerEvent,
    ) => void
  >(() => {});
  const lineColours = useMemo(
    () => ({ text: theme.colors.text, muted: theme.colors.textSecondary }),
    [theme],
  );
  const [interacting, setInteracting] = useState(false);
  const [editOnAppear, setEditOnAppear] = useState<string | undefined>();
  const [erasingStrokes, setErasingStrokes] = useState<Set<string>>(new Set());
  const [drawingPoints, setDrawingPoints] = useState<InkPoint[]>([]);
  const drawing = useRef<Drawing | undefined>(undefined);
  const myStrokes = useRef<string[]>([]);
  const spaceHeld = useRef(false);

  const {
    nodes,
    setNodes,
    edges,
    setEdges,
    nodeDocs,
    markPending,
    clearPending,
  } = useWhiteboardSync({
    boardId,
    livePuzzleIds,
    readOnly,
    showFeederArrows,
    remoteDrags,
    erasingStrokes,
    lineColours,
  });

  const updateNodes = useCallback(
    (inputs: WhiteboardNodeInput[]) => {
      if (inputs.length === 0) return;
      chunks(inputs, MAX_BATCH).forEach((batch) => {
        upsertWhiteboardNodes.call({ boardId, nodes: batch }, (error) => {
          if (error) clearPending(batch.map((n) => n._id));
        });
      });
    },
    [boardId, clearPending],
  );

  const deleteNodes = useCallback(
    (ids: string[]) => {
      chunks(ids, MAX_BATCH).forEach((batch) => {
        deleteWhiteboardNodes.call({ boardId, nodeIds: batch }, ignoreResult);
      });
    },
    [boardId],
  );

  const updateEdge = useCallback(
    (input: WhiteboardEdgeInput) => {
      upsertWhiteboardEdges.call({ boardId, edges: [input] }, ignoreResult);
    },
    [boardId],
  );

  // After a resize, save the node's new box and any of its children whose
  // position changed (resizing from the top or left moves the origin, and
  // React Flow compensates the children to keep them still).
  const persistResize = useCallback(
    (id: string) => {
      setInteracting(false);
      const all = flow.getNodes();
      const node = all.find((n) => n.id === id);
      if (!node) return;
      const width = node.width ?? node.measured?.width;
      const height = node.height ?? node.measured?.height;
      const inputs: WhiteboardNodeInput[] = [
        { _id: id, position: node.position, width, height },
      ];
      markPending(id, { position: node.position, width, height });
      all
        .filter((n) => n.parentId === id)
        .forEach((child) => {
          const saved = child.data.doc.position;
          if (
            Math.abs(saved.x - child.position.x) > 0.01 ||
            Math.abs(saved.y - child.position.y) > 0.01
          ) {
            inputs.push({ _id: child.id, position: child.position });
            markPending(child.id, { position: child.position });
          }
        });
      updateNodes(inputs);
    },
    [flow, markPending, updateNodes],
  );

  const clearEditOnAppear = useCallback(() => setEditOnAppear(undefined), []);

  const actions: WhiteboardActions = useMemo(
    () => ({
      boardId,
      huntId,
      readOnly,
      updateNodes,
      deleteNodes,
      updateEdge,
      persistResize,
      beginInteraction: () => setInteracting(true),
      beginEndpointDrag: (edgeId, end, event) =>
        beginEndpointDragRef.current(edgeId, end, event),
      editOnAppear,
      clearEditOnAppear,
    }),
    [
      boardId,
      huntId,
      readOnly,
      updateNodes,
      deleteNodes,
      updateEdge,
      persistResize,
      editOnAppear,
      clearEditOnAppear,
    ],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<WhiteboardFlowNode>[]) => {
      const current = flow.getNodes();
      const byId = new Map(current.map((n) => [n.id, n]));
      const extra: NodeChange<WhiteboardFlowNode>[] = [];

      // Selecting any segment of an ink stroke selects the whole stroke.
      // Only selections spread: a box that covers part of a stroke would
      // otherwise flip the rest back and forth.
      changes.forEach((change) => {
        if (change.type !== "select" || !change.selected) return;
        const stroke = byId.get(change.id)?.data.doc.stroke;
        if (!stroke) return;
        current
          .filter((n) => n.data.doc.stroke === stroke && n.id !== change.id)
          .forEach((n) => {
            if (!changes.some((c) => c.type === "select" && c.id === n.id)) {
              extra.push({ type: "select", id: n.id, selected: true });
            }
          });
      });

      // Things that travel together: the rest of an ink stroke, and the free
      // end of a line attached to whatever moved (or to anything inside it).
      const moves = new Map(
        changes.flatMap((c) =>
          c.type === "position" && c.position ? [[c.id, c] as const] : [],
        ),
      );
      // Resizing from the top or left moves the node's origin and its
      // children; that's saved by persistResize and carries nothing along.
      const resizing = changes.some(
        (c) => c.type === "dimensions" && c.resizing,
      );
      if (moves.size > 0 && !resizing) {
        const following = companionsOf(
          current.map((n) => ({
            id: n.id,
            type: n.type ?? "",
            parent: n.parentId,
            stroke: n.data.doc.stroke,
          })),
          flow.getEdges(),
          new Set(moves.keys()),
        );
        following.forEach((leaderId, id) => {
          const change = moves.get(leaderId)!;
          const leader = byId.get(leaderId);
          const node = byId.get(id);
          if (!leader || !node || !change.position) return;
          const dx = change.position.x - leader.position.x;
          const dy = change.position.y - leader.position.y;
          if (dx === 0 && dy === 0) return;
          extra.push({
            type: "position",
            id,
            position: { x: node.position.x + dx, y: node.position.y + dy },
            // Marked as dragging like their leader, so a board refresh
            // mid-drag doesn't snap them back.
            dragging: change.dragging,
          });
          companions.current.add(id);
        });

        // Arrow keys move selected nodes outside of any drag; save those once
        // the presses stop.
        if (!dragActive.current) {
          moves.forEach((_change, id) => nudged.current.add(id));
          following.forEach((_leader, id) => nudged.current.add(id));
          window.clearTimeout(nudgeTimer.current);
          nudgeTimer.current = window.setTimeout(
            () => saveNudgesRef.current(),
            400,
          );
        }
      }
      setNodes((nds) => applyNodeChanges([...changes, ...extra], nds));
    },
    [flow, setNodes],
  );

  const saveNudgesRef = useRef(() => {});
  saveNudgesRef.current = () => {
    const inputs: WhiteboardNodeInput[] = [];
    nudged.current.forEach((id) => {
      const node = flow.getNode(id);
      if (!node) return;
      inputs.push({ _id: id, position: node.position });
      markPending(id, { position: node.position });
    });
    nudged.current.clear();
    companions.current.clear();
    updateNodes(inputs);
  };

  const onEdgesChange = useCallback(
    (changes: Parameters<typeof applyEdgeChanges>[0]) => {
      setEdges((eds) => applyEdgeChanges(changes, eds) as typeof eds);
    },
    [setEdges],
  );

  // We delete on the server and let the echo update the canvas, so that
  // children of a deleted frame stay put rather than going with it.
  const onBeforeDelete: OnBeforeDelete<WhiteboardFlowNode> = useCallback(
    async ({ nodes: doomedNodes, edges: doomedEdges }) => {
      const nodeIds = doomedNodes.filter((n) => n.selected).map((n) => n.id);
      const edgeIds = doomedEdges.filter((e) => e.selected).map((e) => e.id);
      if (nodeIds.length > 0) deleteNodes(nodeIds);
      if (edgeIds.length > 0) {
        chunks(edgeIds, MAX_BATCH).forEach((batch) =>
          deleteWhiteboardEdges.call({ boardId, edgeIds: batch }, ignoreResult),
        );
      }
      return false;
    },
    [boardId, deleteNodes],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source === connection.target) return;
      updateEdge({
        _id: Random.id(),
        source: connection.source,
        target: connection.target,
        ...lineStyle,
      });
    },
    [updateEdge, lineStyle],
  );

  const absoluteRect = useCallback(
    (id: string) => {
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

  const isWithin = useCallback(
    (id: string, ancestorId: string) => {
      const byId = new Map(flow.getNodes().map((n) => [n.id, n]));
      let current = byId.get(id);
      for (let i = 0; current && i < 64; i++) {
        if (current.id === ancestorId) return true;
        current = current.parentId ? byId.get(current.parentId) : undefined;
      }
      return false;
    },
    [flow],
  );

  // The frame (if any) under a point, preferring the innermost.
  const frameAt = useCallback(
    (point: XYPosition, exclude: (id: string) => boolean) => {
      let best: { id: string; area: number } | undefined;
      flow.getNodes().forEach((n) => {
        if (n.type !== "frame" || exclude(n.id)) return;
        const rect = absoluteRect(n.id);
        if (
          !rect ||
          point.x < rect.x ||
          point.y < rect.y ||
          point.x > rect.x + rect.width ||
          point.y > rect.y + rect.height
        ) {
          return;
        }
        const area = rect.width * rect.height;
        if (!best || area < best.area) best = { id: n.id, area };
      });
      return best?.id;
    },
    [flow, absoluteRect],
  );

  const onNodeDragStart = useCallback(() => {
    dragActive.current = true;
    setInteracting(true);
  }, []);

  const onNodeDrag: OnNodeDrag<WhiteboardFlowNode> = useCallback(
    (_event, _node, dragged) => {
      const onto =
        dragged.length === 1
          ? droppedEndTargetRef.current(dragged[0]!)
          : undefined;
      setAttachPreview((current) => (current === onto ? current : onto));
      const carried = [...companions.current]
        .map((id) => flow.getNode(id))
        .filter((n): n is WhiteboardFlowNode => !!n);
      live.setDrag(
        [...dragged, ...carried].slice(0, 50).map((n) => ({
          node: n.id,
          x: n.position.x,
          y: n.position.y,
        })),
      );
    },
    [flow, live],
  );

  // Dropping a node onto a frame puts it in the frame; dropping it outside
  // takes it out. Positions are stored relative to the parent.
  const onNodeDragStop: OnNodeDrag<WhiteboardFlowNode> = useCallback(
    (_event, _node, dragged) => {
      setInteracting(false);
      setAttachPreview(undefined);
      live.setDrag(null);
      const draggedIds = new Set(dragged.map((n) => n.id));
      const inputs: WhiteboardNodeInput[] = [];
      const moves = new Map<
        string,
        { position: XYPosition; parent?: string }
      >();

      dragged.forEach((node) => {
        // A line's free end dragged on its own onto something attaches there.
        if (dragged.length === 1 && attachDroppedEndRef.current(node)) return;
        // Nodes inside a frame that's also moving go along with it.
        if (
          node.parentId &&
          [...draggedIds].some((id) => id !== node.id && isWithin(node.id, id))
        ) {
          return;
        }
        const rect = absoluteRect(node.id);
        if (!rect) return;
        const centre = {
          x: rect.x + rect.width / 2,
          y: rect.y + rect.height / 2,
        };
        const target = frameAt(
          centre,
          (id) => draggedIds.has(id) || isWithin(id, node.id),
        );
        if (target === node.parentId) {
          inputs.push({ _id: node.id, position: node.position });
          markPending(node.id, { position: node.position });
          return;
        }
        const parentRect = target ? absoluteRect(target) : undefined;
        const position = {
          x: rect.x - (parentRect?.x ?? 0),
          y: rect.y - (parentRect?.y ?? 0),
        };
        inputs.push({ _id: node.id, position, parent: target ?? null });
        markPending(node.id, { position, parent: target ?? null });
        moves.set(node.id, { position, parent: target });
      });

      dragActive.current = false;
      companions.current.forEach((id) => {
        const carried = flow.getNode(id);
        if (!carried || draggedIds.has(id)) return;
        inputs.push({ _id: id, position: carried.position });
        markPending(id, { position: carried.position });
      });
      companions.current.clear();

      if (moves.size > 0) {
        setNodes((nds) =>
          sortParentsFirst(
            nds.map((n) => {
              const move = moves.get(n.id);
              return move
                ? { ...n, position: move.position, parentId: move.parent }
                : n;
            }),
          ),
        );
      }
      updateNodes(inputs);
    },
    [
      flow,
      live,
      isWithin,
      absoluteRect,
      frameAt,
      markPending,
      setNodes,
      updateNodes,
    ],
  );

  const nodeCentre = useCallback(
    (id: string) => {
      const rect = absoluteRect(id);
      return rect
        ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
        : undefined;
    },
    [absoluteRect],
  );

  const endpointPosition = useCallback(
    (endpoint: Endpoint) =>
      "node" in endpoint ? nodeCentre(endpoint.node) : endpoint.point,
    [nodeCentre],
  );

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

  // A free end, as a point node positioned in its parent's coordinates.
  const pointPlacement = useCallback(
    (endpoint: { point: XYPosition; parent?: string }) => {
      const parentRect = endpoint.parent
        ? absoluteRect(endpoint.parent)
        : undefined;
      const round = (n: number) => Math.round(n * 10) / 10;
      return {
        position: {
          x: round(endpoint.point.x - POINT_SIZE / 2 - (parentRect?.x ?? 0)),
          y: round(endpoint.point.y - POINT_SIZE / 2 - (parentRect?.y ?? 0)),
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
      const addEdge = () =>
        upsertWhiteboardEdges.call({ boardId, edges: [edge] }, (error) => {
          if (error && points.length > 0) {
            deleteWhiteboardNodes.call(
              { boardId, nodeIds: points.map((p) => p._id) },
              ignoreResult,
            );
          }
        });
      if (points.length === 0) {
        addEdge();
        return;
      }
      upsertWhiteboardNodes.call({ boardId, nodes: points }, (error) => {
        if (!error) addEdge();
      });
    },
    [boardId, lineStyle, pointPlacement],
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
        setNodes((nds) =>
          sortParentsFirst(
            nds.map((n) =>
              n.id === currentId
                ? {
                    ...n,
                    position: placement.position,
                    parentId: placement.parent ?? undefined,
                  }
                : n,
            ),
          ),
        );
        updateNodes([{ _id: currentId, ...placement }]);
        return;
      }
      const _id = Random.id();
      upsertWhiteboardNodes.call(
        {
          boardId,
          nodes: [{ _id, type: "point", ...pointPlacement(endpoint) }],
        },
        (error) => {
          if (error) return;
          upsertWhiteboardEdges.call(
            { boardId, edges: [{ _id: edgeId, [end]: _id }] },
            (edgeError) => {
              if (edgeError) {
                deleteWhiteboardNodes.call(
                  { boardId, nodeIds: [_id] },
                  ignoreResult,
                );
              }
            },
          );
        },
      );
    },
    [
      boardId,
      flow,
      markPending,
      pointPlacement,
      setNodes,
      updateEdge,
      updateNodes,
    ],
  );

  const droppedEnd = (node: WhiteboardFlowNode) => {
    if (node.type !== "point") return undefined;
    const line = flow
      .getEdges()
      .find((e) => e.source === node.id || e.target === node.id);
    const centre = nodeCentre(node.id);
    if (!line || !centre) return undefined;
    const end = line.source === node.id ? "source" : "target";
    const other = end === "source" ? line.target : line.source;
    const endpoint = resolveEndpoint(centre, new Set([node.id, other]));
    if (!("node" in endpoint)) return undefined;
    return { line: line.id, end, onto: endpoint.node } as const;
  };
  droppedEndTargetRef.current = (node) => droppedEnd(node)?.onto;
  attachDroppedEndRef.current = (node) => {
    const dropped = droppedEnd(node);
    if (!dropped) return false;
    updateEdge({ _id: dropped.line, [dropped.end]: dropped.onto });
    return true;
  };

  const onMoveEnd: OnMoveEnd = useCallback(
    (_event, viewport) => writeLocal(viewportKey, viewport),
    [viewportKey],
  );

  const paneCentre = useCallback(() => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return flow.screenToFlowPosition({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
  }, [flow]);

  // Places a sticky, text box or frame. If it lands inside a frame it goes
  // into that frame.
  const placeNode = useCallback(
    (
      type: PlaceTool,
      rect: { x: number; y: number; width: number; height: number },
    ) => {
      const centre = {
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2,
      };
      const parent = frameAt(centre, () => false);
      const parentRect = parent ? absoluteRect(parent) : undefined;
      const _id = Random.id();
      updateNodes([
        {
          _id,
          type,
          position: {
            x: Math.round(rect.x - (parentRect?.x ?? 0)),
            y: Math.round(rect.y - (parentRect?.y ?? 0)),
          },
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          parent: parent ?? null,
          colour: type === "sticky" ? "yellow" : undefined,
        },
      ]);
      setEditOnAppear(_id);
      // If the new node can't open for editing (e.g. a frame placed while
      // zoomed right out shows no label), don't let it grab focus later.
      window.setTimeout(
        () =>
          setEditOnAppear((current) => (current === _id ? undefined : current)),
        3000,
      );
      setTool("select");
    },
    [frameAt, absoluteRect, updateNodes],
  );

  const placementRect = useCallback(
    (type: PlaceTool, start: XYPosition, end: XYPosition) => {
      const dragged =
        Math.hypot(end.x - start.x, end.y - start.y) * flow.getZoom() >=
        CLICK_SLOP;
      if (!dragged) {
        const size = DEFAULT_SIZES[type];
        return {
          x: start.x - size.width / 2,
          y: start.y - size.height / 2,
          ...size,
        };
      }
      const min = MIN_SIZES[type];
      return {
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        width: Math.max(min.width, Math.abs(end.x - start.x)),
        height: Math.max(min.height, Math.abs(end.y - start.y)),
      };
    },
    [flow],
  );

  const selectedUnitCount = useMemo(
    () => selectionUnits(nodes, edges).size,
    [nodes, edges],
  );
  const selectedLines = useMemo(
    () => edges.filter((e) => e.selected && !e.data?.doc.auto),
    [edges],
  );
  const restyleLines = useCallback(
    (patch: Partial<LineStyle>) => {
      if (selectedLines.length === 0) return;
      upsertWhiteboardEdges.call(
        {
          boardId,
          edges: selectedLines.slice(0, MAX_BATCH).map((e) => ({
            _id: e.id,
            ...patch,
          })),
        },
        ignoreResult,
      );
    },
    [boardId, selectedLines],
  );
  const updateLineStyle = useCallback((patch: Partial<LineStyle>) => {
    setLineStyle((current) => {
      const next = { ...current, ...patch };
      writeLocal("whiteboard:lineStyle", next);
      return next;
    });
  }, []);

  // Lines up or evenly spaces the selection. Works in board coordinates and
  // shifts each node by the same amount in its own parent's coordinates.
  const arrange = useCallback(
    (
      action:
        | { kind: "align"; mode: AlignMode }
        | { kind: "distribute"; axis: DistributeAxis },
    ) => {
      const units = selectionUnits(flow.getNodes(), flow.getEdges());
      const items: ArrangeItem[] = [];
      // A free line end counts as the point it marks, not its grab box.
      const rectFor = (m: WhiteboardFlowNode) => {
        const rect = absoluteRect(m.id);
        if (!rect || m.type !== "point") return rect;
        return {
          x: rect.x + rect.width / 2,
          y: rect.y + rect.height / 2,
          width: 0,
          height: 0,
        };
      };
      units.forEach((members, key) => {
        const rects = members
          .map(rectFor)
          .filter((r): r is NonNullable<typeof r> => !!r);
        if (rects.length === 0) return;
        const x = Math.min(...rects.map((r) => r.x));
        const y = Math.min(...rects.map((r) => r.y));
        items.push({
          id: key,
          x,
          y,
          width: Math.max(...rects.map((r) => r.x + r.width)) - x,
          height: Math.max(...rects.map((r) => r.y + r.height)) - y,
        });
      });
      const shifts =
        action.kind === "align"
          ? alignItems(items, action.mode)
          : distributeItems(items, action.axis);

      const round = (n: number) => Math.round(n * 10) / 10;
      const moved = new Map<
        string,
        { position: XYPosition; parent?: string }
      >();
      const inputs: WhiteboardNodeInput[] = [];
      const movingIds = new Set(
        [...units.values()].flatMap((members) => members.map((m) => m.id)),
      );
      units.forEach((members, key) => {
        const shift = shifts.get(key);
        if (
          !shift ||
          (Math.abs(shift.dx) < 0.05 && Math.abs(shift.dy) < 0.05)
        ) {
          return;
        }
        members.forEach((m) => {
          // Like a drop: whatever lands in a frame joins it, and whatever
          // leaves its frame leaves it. Frames being arranged themselves
          // aren't candidates, since they're moving too.
          const rect = absoluteRect(m.id);
          const centre = rect && {
            x: rect.x + rect.width / 2 + shift.dx,
            y: rect.y + rect.height / 2 + shift.dy,
          };
          const parent = centre
            ? frameAt(centre, (id) => movingIds.has(id) || isWithin(id, m.id))
            : m.parentId;
          if (rect && parent !== m.parentId) {
            const parentRect = parent ? absoluteRect(parent) : undefined;
            const position = {
              x: round(rect.x + shift.dx - (parentRect?.x ?? 0)),
              y: round(rect.y + shift.dy - (parentRect?.y ?? 0)),
            };
            moved.set(m.id, { position, parent });
            inputs.push({ _id: m.id, position, parent: parent ?? null });
            markPending(m.id, { position, parent: parent ?? null });
            return;
          }
          const position = {
            x: round(m.position.x + shift.dx),
            y: round(m.position.y + shift.dy),
          };
          moved.set(m.id, { position, parent: m.parentId });
          inputs.push({ _id: m.id, position });
          markPending(m.id, { position });
        });
      });
      if (inputs.length === 0) return;
      setNodes((nds) =>
        sortParentsFirst(
          nds.map((n) => {
            const move = moved.get(n.id);
            return move
              ? { ...n, position: move.position, parentId: move.parent }
              : n;
          }),
        ),
      );
      updateNodes(inputs);
    },
    [flow, absoluteRect, frameAt, isWithin, markPending, setNodes, updateNodes],
  );

  const hiddenCards = useMemo(() => {
    const titles = new Map(livePuzzles.map((p) => [p._id, p.title]));
    const onBoard = new Set(nodeDocs.map((d) => d.puzzle).filter(Boolean));
    const hidden = nodeDocs
      .filter((d) => d.type === "puzzle" && d.hidden && titles.has(d.puzzle!))
      .map((d) => ({
        id: d._id,
        puzzle: d.puzzle!,
        title: titles.get(d.puzzle!)!,
      }));
    const missing = livePuzzles
      .filter((p) => !onBoard.has(p._id))
      .map((p) => ({ id: undefined, puzzle: p._id, title: p.title }));
    return [...hidden, ...missing].sort((a, b) =>
      a.title.localeCompare(b.title),
    );
  }, [livePuzzles, nodeDocs]);

  const putBack = useCallback(
    (card: { id: string | undefined; puzzle: string }) => {
      const centre = paneCentre();
      const position = {
        x: Math.round(centre.x - CARD_WIDTH / 2),
        y: Math.round(centre.y - CARD_HEIGHT / 2),
      };
      updateNodes([
        card.id
          ? { _id: card.id, hidden: false, parent: null, position }
          : {
              _id: Random.id(),
              type: "puzzle",
              puzzle: card.puzzle,
              position,
              width: CARD_WIDTH,
              height: CARD_HEIGHT,
            },
      ]);
    },
    [paneCentre, updateNodes],
  );

  // Ink: pointer samples become a stroke in flow coordinates. Long strokes
  // are saved in segments as they're drawn, so other people see them grow.
  const commitSegment = useCallback(
    (state: Drawing, points: InkPoint[]) => {
      const size = STROKE_SIZES[state.strokeWidth];
      const bounds = inkBounds(points, size);
      const parentRect = state.parent ? absoluteRect(state.parent) : undefined;
      updateNodes([
        {
          _id: Random.id(),
          type: "ink",
          position: {
            x: bounds.x - (parentRect?.x ?? 0),
            y: bounds.y - (parentRect?.y ?? 0),
          },
          width: Math.max(1, bounds.width),
          height: Math.max(1, bounds.height),
          parent: state.parent ?? null,
          points: relativeTo(points, bounds),
          strokeWidth: state.strokeWidth,
          colour: state.colour,
          stroke: state.stroke,
        },
      ]);
      state.committed += 1;
    },
    [absoluteRect, updateNodes],
  );

  const selfId = useTracker(() => Meteor.userId() ?? undefined, []);
  const threads = useComments(huntId, puzzleId);
  const [seenComments, markCommentSeen] = useSeenComments(boardId, threads);
  const openThreadData = openThread ? threads.get(openThread) : undefined;
  // Cards only appear once their puzzles have loaded too.
  const boardLoaded = !contentsLoading() && !puzzlesLoading();

  // A comment goes on the topmost thing under it (anything but ink and line
  // ends), so it moves with it; otherwise it's pinned to the board.
  const commentAnchorAt = useCallback(
    (point: XYPosition): CommentAnchor => {
      const round = (n: number) => Math.round(n * 10) / 10;
      let best:
        | {
            id: string;
            z: number;
            order: number;
            rect: { x: number; y: number };
          }
        | undefined;
      flow.getNodes().forEach((n, order) => {
        if (n.type === "point" || n.type === "ink" || n.hidden) return;
        const rect = absoluteRect(n.id);
        if (!rect || !contains(rect, point)) return;
        const z = flow.getInternalNode(n.id)?.internals.z ?? 0;
        if (!best || z > best.z || (z === best.z && order > best.order)) {
          best = { id: n.id, z, order, rect };
        }
      });
      return best
        ? {
            node: best.id,
            x: round(point.x - best.rect.x),
            y: round(point.y - best.rect.y),
          }
        : { x: round(point.x), y: round(point.y) };
    },
    [flow, absoluteRect],
  );

  const openComment = useCallback((id: string) => {
    if (id === "draft") return;
    setOpenThread(id);
    setDraft(null);
    setShowHidden(false);
  }, []);

  const closeComment = useCallback(() => {
    setOpenThread(null);
    setDraft(null);
  }, []);

  const onDraftSent = useCallback(
    (sentAt: Date) => {
      if (draft) sentDraft.current = { anchor: draft, at: +sentAt };
      setDraft(null);
    },
    [draft],
  );

  // Open a comment we've just left as soon as it's saved, unless something
  // else has been opened since.
  useEffect(() => {
    const sent = sentDraft.current;
    if (!sent) return;
    if (draft || openThread) {
      sentDraft.current = undefined;
      return;
    }
    const same = (a: number, b: number) => Math.abs(a - b) < 0.5;
    const match = [...threads.values()].find((t) => {
      const c = t.root.comment;
      return (
        c &&
        t.root.sender === selfId &&
        +t.root.timestamp >= sent.at - 60_000 &&
        c.node === sent.anchor.node &&
        same(c.x, sent.anchor.x) &&
        same(c.y, sent.anchor.y)
      );
    });
    if (match) {
      sentDraft.current = undefined;
      setOpenThread(match.root._id);
    }
  }, [threads, selfId, draft, openThread]);

  useEffect(() => {
    if (openThread && !threads.has(openThread)) setOpenThread(null);
  }, [openThread, threads]);

  useEffect(() => {
    if (openThreadData) {
      markCommentSeen(openThreadData.root._id, +openThreadData.lastActivity);
    }
  }, [openThreadData, markCommentSeen]);

  // Pans to a comment and opens it. Returns false if it isn't on the board.
  const showComment = useCallback(
    (threadId: string) => {
      const anchor = threads.get(threadId)?.root.comment;
      if (!anchor) return false;
      const at = commentPosition(
        anchor,
        anchor.node ? absoluteRect(anchor.node) : undefined,
      );
      if (!at) return false;
      setShowHidden(false);
      setDraft(null);
      setOpenThread(threadId);
      flow.setCenter(at.x, at.y, {
        zoom: Math.max(flow.getZoom(), 0.8),
        duration: 400,
      });
      setPulse(threadId);
      window.clearTimeout(pulseTimer.current);
      pulseTimer.current = window.setTimeout(
        () => setPulse(undefined),
        PULSE_MS,
      );
      return true;
    },
    [threads, flow, absoluteRect],
  );

  // A comment asked for before the board has its nodes laid out, or before
  // the thread has reached this client, is shown as soon as both are ready.
  const [pendingFocus, setPendingFocus] = useState<string | undefined>();
  // React Flow takes in new nodes before this component's effects run, so
  // this is rechecked whenever they change.
  // biome-ignore lint/correctness/useExhaustiveDependencies(nodes): see above
  const readyToShow = useCallback(
    (threadId: string) => {
      const anchor = threads.get(threadId)?.root.comment;
      if (!anchor) return false;
      if (!anchor.node) return true;
      if (!boardLoaded) return false;
      // Once loaded, a comment on something that's gone is as ready as it
      // will ever be (showComment then reports it isn't on the board).
      const doc = WhiteboardNodes.findOne(anchor.node);
      return !doc || !!doc.hidden || !!flow.getInternalNode(anchor.node);
    },
    [threads, boardLoaded, flow, nodes],
  );

  const focusComment = useCallback(
    (threadId: string) => {
      if (readyToShow(threadId)) return showComment(threadId);
      setPendingFocus(threadId);
      return true;
    },
    [readyToShow, showComment],
  );

  useEffect(() => {
    if (initialComment) setPendingFocus(initialComment);
  }, [initialComment]);

  useEffect(() => {
    if (!pendingFocus || !readyToShow(pendingFocus)) return;
    setPendingFocus(undefined);
    showComment(pendingFocus);
    if (pendingFocus === initialComment) onInitialCommentShown?.();
  }, [
    pendingFocus,
    readyToShow,
    showComment,
    initialComment,
    onInitialCommentShown,
  ]);

  useEffect(() => {
    if (!focusRef) return undefined;
    focusRef.current = focusComment;
    return () => {
      focusRef.current = undefined;
    };
  }, [focusRef, focusComment]);

  useEffect(() => () => window.clearTimeout(pulseTimer.current), []);

  const commentPins = useMemo(() => {
    const pins: CommentPin[] = [];
    threads.forEach((thread) => {
      const id = thread.root._id;
      if (
        thread.resolved &&
        !showResolved &&
        id !== openThread &&
        id !== pulse
      ) {
        return;
      }
      pins.push({
        id,
        anchor: thread.root.comment!,
        author: thread.root.sender,
        replies: thread.replies.length,
        unread: isUnread(thread, seenComments[id], selfId),
        resolved: thread.resolved,
      });
    });
    if (draft) {
      pins.push({
        id: "draft",
        anchor: draft,
        replies: 0,
        unread: false,
        resolved: false,
        draft: true,
      });
    }
    return pins;
  }, [threads, showResolved, openThread, pulse, seenComments, selfId, draft]);

  const resolvedCount = useMemo(
    () => [...threads.values()].filter((t) => t.resolved).length,
    [threads],
  );

  const commentTarget = useTracker(
    () =>
      describeCommentTarget(
        draft ? draft.node : openThreadData?.root.comment?.node,
      ),
    [draft, openThreadData?.root.comment?.node],
  );

  const toggleShowResolved = useCallback(() => {
    setShowResolved((current) => {
      writeLocal("whiteboard:showResolvedComments", !current);
      return !current;
    });
  }, []);

  const flowPoint = useCallback(
    (event: React.PointerEvent | PointerEvent) =>
      flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
    [flow],
  );

  const eraseAt = useCallback(
    (point: XYPosition) => {
      const hits: string[] = [];
      flow.getNodes().forEach((n) => {
        const stroke = n.data.doc.stroke;
        if (n.type !== "ink" || !stroke || erasingStrokes.has(stroke)) return;
        const rect = absoluteRect(n.id);
        if (
          !rect ||
          point.x < rect.x ||
          point.y < rect.y ||
          point.x > rect.x + rect.width ||
          point.y > rect.y + rect.height
        ) {
          return;
        }
        const size = STROKE_SIZES[n.data.doc.strokeWidth ?? "medium"];
        const distance = distanceToInk(
          (n.data.doc.points ?? []) as InkPoint[],
          point.x - rect.x,
          point.y - rect.y,
        );
        if (distance <= size + 4 / flow.getZoom()) hits.push(stroke);
      });
      if (hits.length > 0) {
        setErasingStrokes((current) => new Set([...current, ...hits]));
      }
    },
    [flow, absoluteRect, erasingStrokes],
  );

  const finishErasing = useCallback(() => {
    if (erasingStrokes.size === 0) return;
    const ids = flow
      .getNodes()
      .filter((n) => n.data.doc.stroke && erasingStrokes.has(n.data.doc.stroke))
      .map((n) => n.id);
    deleteNodes(ids);
    // Leave them faded until the server removes them.
    window.setTimeout(() => setErasingStrokes(new Set()), 1500);
  }, [flow, erasingStrokes, deleteNodes]);

  const onPointerDownCapture = useCallback(
    (event: React.PointerEvent) => {
      if (
        readOnly ||
        tool === "select" ||
        event.button !== 0 ||
        spaceHeld.current
      ) {
        return;
      }
      const target = event.target as HTMLElement;
      if (
        target.closest(
          ".react-flow__panel, .react-flow__controls, .react-flow__minimap, .react-flow__node-toolbar, .react-flow__resize-control, .jr-comment-pin",
        )
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      wrapperRef.current?.setPointerCapture(event.pointerId);
      const point = flowPoint(event);

      if (tool === "comment") {
        commentPress.current = point;
        return;
      }

      if (tool === "eraser") {
        eraseAt(point);
        return;
      }

      if (isPlaceTool(tool)) {
        setPlacing({ start: point, current: point });
        return;
      }

      if (tool === "connector") {
        setAttachPreview(undefined);
        setConnecting({
          fixed: resolveEndpoint(point, new Set()),
          current: point,
        });
        return;
      }

      const stroke = Random.id();
      const state: Drawing = {
        stroke,
        colour: penColour,
        strokeWidth: penWidth,
        segmenter: new InkSegmenter(),
        committed: 0,
        parent: frameAt(point, () => false),
      };
      drawing.current = state;
      const pressure =
        event.pointerType === "pen" && event.pressure > 0
          ? event.pressure
          : 0.5;
      state.segmenter.push([point.x, point.y, pressure]);
      setDrawingPoints([...state.segmenter.points]);
    },
    [
      readOnly,
      tool,
      flowPoint,
      eraseAt,
      penColour,
      penWidth,
      frameAt,
      resolveEndpoint,
    ],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const point = flowPoint(event);
      if (event.pointerType !== "touch") live.setCursor(point);

      if (connecting) {
        const exclude = new Set<string>();
        // Moving an end can't attach it to the line's other end. A new line
        // can end on the node it started from; releasing there cancels it.
        if (connecting.edgeId && "node" in connecting.fixed) {
          exclude.add(connecting.fixed.node);
        }
        if (connecting.edgeId && connecting.end) {
          const moving = flow.getEdge(connecting.edgeId)?.[connecting.end];
          // A free end being moved mustn't find itself; an attached end can
          // be dropped back where it was.
          if (moving && flow.getNode(moving)?.type === "point") {
            exclude.add(moving);
          }
        }
        let target = resolveEndpoint(point, exclude);
        const origin = endpointPosition(connecting.fixed);
        if (!("node" in target) && event.shiftKey && origin) {
          target = { ...target, point: snapAngle(origin, point) };
        }
        setConnecting({
          ...connecting,
          current: "node" in target ? point : target.point,
          target,
        });
        return;
      }

      if (tool === "connector") {
        const under = resolveEndpoint(point, new Set());
        const id = "node" in under ? under.node : undefined;
        setAttachPreview((current) => (current === id ? current : id));
        return;
      }
      if (tool === "eraser" && event.buttons === 1 && !spaceHeld.current) {
        eraseAt(point);
        return;
      }
      if (isPlaceTool(tool)) {
        if (placing) {
          setPlacing({ ...placing, current: point });
        } else {
          setHover(point);
        }
        return;
      }
      const state = drawing.current;
      if (!state) return;
      const samples =
        typeof event.nativeEvent.getCoalescedEvents === "function"
          ? event.nativeEvent.getCoalescedEvents()
          : [event.nativeEvent];
      const size = STROKE_SIZES[state.strokeWidth];
      (samples.length > 0 ? samples : [event.nativeEvent]).forEach((sample) => {
        const p = flowPoint(sample);
        const previous =
          state.segmenter.points[state.segmenter.points.length - 1];
        const pressure =
          sample.pointerType === "pen" && sample.pressure > 0
            ? sample.pressure
            : simulatedPressure(previous, p.x, p.y, size);
        const full = state.segmenter.push([p.x, p.y, pressure]);
        if (full) commitSegment(state, full);
      });
      setDrawingPoints([...state.segmenter.points]);
      live.setStroke({
        id: state.stroke,
        colour: state.colour,
        strokeWidth: state.strokeWidth,
        points: state.segmenter.points,
      });
    },
    [
      flowPoint,
      live,
      tool,
      placing,
      connecting,
      flow,
      resolveEndpoint,
      endpointPosition,
      eraseAt,
      commitSegment,
    ],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent) => {
      if (wrapperRef.current?.hasPointerCapture(event.pointerId)) {
        wrapperRef.current.releasePointerCapture(event.pointerId);
      }
      if (connecting) {
        const { fixed, target, edgeId, end } = connecting;
        setConnecting(null);
        setInteracting(false);
        if (!target) return;
        if (edgeId && end) {
          moveLineEnd(edgeId, end, target);
          return;
        }
        if ("node" in target && "node" in fixed && target.node === fixed.node) {
          return;
        }
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
        return;
      }
      if (tool === "eraser") {
        finishErasing();
        return;
      }
      if (tool === "comment") {
        const press = commentPress.current;
        commentPress.current = undefined;
        if (press) {
          setDraft(commentAnchorAt(press));
          setOpenThread(null);
          setShowHidden(false);
          setTool("select");
        }
        return;
      }
      if (isPlaceTool(tool)) {
        if (placing) {
          placeNode(tool, placementRect(tool, placing.start, flowPoint(event)));
          setPlacing(null);
          setHover(null);
        }
        return;
      }
      const state = drawing.current;
      if (!state) return;
      drawing.current = undefined;
      const rest = state.segmenter.finish(state.committed > 0);
      if (rest) commitSegment(state, rest);
      myStrokes.current.push(state.stroke);
      setDrawingPoints([]);
      live.setStroke(null);
    },
    [
      tool,
      placing,
      connecting,
      flow,
      commentAnchorAt,
      moveLineEnd,
      createLine,
      endpointPosition,
      finishErasing,
      placeNode,
      placementRect,
      flowPoint,
      commitSegment,
      live,
    ],
  );

  const onPointerLeave = useCallback(() => {
    live.setCursor(null);
    setHover(null);
    setAttachPreview(undefined);
  }, [live]);

  beginEndpointDragRef.current = (edgeId, end, event) => {
    if (readOnly) return;
    const line = flow.getEdge(edgeId);
    if (!line) return;
    wrapperRef.current?.setPointerCapture(event.pointerId);
    setInteracting(true);
    setConnecting({
      fixed: { node: end === "source" ? line.target : line.source },
      current: flowPoint(event),
      edgeId,
      end,
    });
  };

  // Switching tools drops anything half-finished, and a drawing tool clears
  // the selection, whose resize handles and toolbars would otherwise get in
  // the way.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on tool change only
  useEffect(() => {
    if (tool !== "select") {
      setNodes((nds) =>
        nds.some((n) => n.selected)
          ? nds.map((n) => (n.selected ? { ...n, selected: false } : n))
          : nds,
      );
      setEdges((eds) =>
        eds.some((e) => e.selected)
          ? eds.map((e) => (e.selected ? { ...e, selected: false } : e))
          : eds,
      );
    }
    setPlacing(null);
    setHover(null);
    setAttachPreview(undefined);
    commentPress.current = undefined;
    setConnecting(null);
    setErasingStrokes(new Set());
    setInteracting(false);
  }, [tool]);

  useEffect(() => {
    const isTyping = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space") spaceHeld.current = true;
      if (event.key === "Escape" && !isTyping(event.target)) {
        setDraft(null);
        setConnecting(null);
        setErasingStrokes(new Set());
        setInteracting(false);
        setTool("select");
        return;
      }
      if (
        !readOnly &&
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        event.key.toLowerCase() === "z" &&
        !isTyping(event.target)
      ) {
        // Undo is limited to taking back your own strokes from this visit.
        const stroke = myStrokes.current.pop();
        if (!stroke) return;
        event.preventDefault();
        const ids = flow
          .getNodes()
          .filter((n) => n.data.doc.stroke === stroke)
          .map((n) => n.id);
        if (ids.length > 0) deleteNodes(ids);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") spaceHeld.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [readOnly, flow, deleteNodes]);

  const persistPenColour = useCallback((colour: WhiteboardColour) => {
    setPenColour(colour);
    writeLocal("whiteboard:penColour", colour);
  }, []);
  const persistPenWidth = useCallback((width: WhiteboardStrokeWidth) => {
    setPenWidth(width);
    writeLocal("whiteboard:penWidth", width);
  }, []);
  const toggleFeederArrows = useCallback(() => {
    setShowFeederArrows((current) => {
      writeLocal("whiteboard:feederArrows", !current);
      return !current;
    });
  }, []);

  const drawingTool = tool !== "select";

  // The dashed outline around something a line end will attach to.
  const attachOutline = (id: string) => {
    const rect = absoluteRect(id);
    if (!rect) return null;
    return (
      <rect
        key={id}
        x={rect.x - 4}
        y={rect.y - 4}
        width={rect.width + 8}
        height={rect.height + 8}
        rx={8}
        fill="none"
        stroke={theme.colors.primary}
        strokeWidth={2}
        strokeDasharray="6 4"
      />
    );
  };

  return (
    <WhiteboardContext.Provider value={actions}>
      <PeopleContext.Provider value={people}>
        <CanvasWrapper
          ref={wrapperRef}
          $tool={readOnly ? "select" : tool}
          className={interacting ? "jr-interacting" : undefined}
          onPointerDownCapture={onPointerDownCapture}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={onPointerLeave}
        >
          <ReactFlow<WhiteboardFlowNode>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onBeforeDelete={onBeforeDelete}
            onConnect={onConnect}
            onNodeDragStart={onNodeDragStart}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={onNodeDragStop}
            onMoveEnd={onMoveEnd}
            connectionMode={ConnectionMode.Loose}
            colorMode={theme.basicMode === "dark" ? "dark" : "light"}
            defaultViewport={savedViewport}
            fitView={!savedViewport}
            minZoom={0.1}
            maxZoom={2}
            nodesDraggable={!readOnly && !drawingTool}
            nodesConnectable={!readOnly && !drawingTool}
            elementsSelectable={!readOnly && !drawingTool}
            panOnDrag={!drawingTool}
            selectionOnDrag={false}
            deleteKeyCode={readOnly ? null : ["Backspace", "Delete"]}
            onlyRenderVisibleElements
          >
            <Background />
            <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              nodeColor={(n) =>
                n.type === "point" ? "transparent" : "rgb(128 128 128 / 45%)"
              }
            />
            <FrameLabelLayer />
            <CursorLayer presence={presence} />
            <CommentLayer
              pins={commentPins}
              openId={openThread ?? (draft ? "draft" : undefined)}
              pulseId={pulse}
              onOpen={openComment}
            />
            {drawingPoints.length > 0 && drawing.current && (
              <ViewportPortal>
                <LocalStroke>
                  <path
                    d={inkPath(
                      drawingPoints,
                      drawing.current.strokeWidth,
                      false,
                    )}
                    fill={
                      STROKE_COLOURS[drawing.current.colour] ??
                      theme.colors.text
                    }
                  />
                </LocalStroke>
              </ViewportPortal>
            )}
            {connecting &&
              (() => {
                const from = endpointPosition(connecting.fixed);
                const attached =
                  connecting.target && "node" in connecting.target
                    ? connecting.target.node
                    : undefined;
                const to = attached ? nodeCentre(attached) : connecting.current;
                // A new line shows what both its ends are on; moving an end
                // shows just where that end will go.
                const origin =
                  !connecting.edgeId && "node" in connecting.fixed
                    ? connecting.fixed.node
                    : undefined;
                if (!from || !to) return null;
                return (
                  <ViewportPortal>
                    <LocalStroke>
                      {origin && attachOutline(origin)}
                      {attached &&
                        attached !== origin &&
                        attachOutline(attached)}
                      <line
                        x1={from.x}
                        y1={from.y}
                        x2={to.x}
                        y2={to.y}
                        stroke={theme.colors.primary}
                        strokeWidth={2}
                        strokeDasharray="6 4"
                      />
                      <circle
                        cx={to.x}
                        cy={to.y}
                        r={4}
                        fill={theme.colors.primary}
                      />
                    </LocalStroke>
                  </ViewportPortal>
                );
              })()}
            {!connecting && attachPreview && (
              <ViewportPortal>
                <LocalStroke>{attachOutline(attachPreview)}</LocalStroke>
              </ViewportPortal>
            )}
            {isPlaceTool(tool) && (placing || hover) && (
              <ViewportPortal>
                {(() => {
                  const rect = placing
                    ? placementRect(tool, placing.start, placing.current)
                    : placementRect(tool, hover!, hover!);
                  return (
                    <PlaceGhost
                      $tool={tool}
                      style={{
                        transform: `translate(${rect.x}px, ${rect.y}px)`,
                        width: rect.width,
                        height: rect.height,
                      }}
                    />
                  );
                })()}
              </ViewportPortal>
            )}
            {readOnly ? (
              <Panel position="top-left">
                <ToolBox>
                  <ReadOnlyNote>Viewing only</ReadOnlyNote>
                  {resolvedCount > 0 && (
                    <Button
                      size="sm"
                      variant={showResolved ? "secondary" : "outline-secondary"}
                      onClick={toggleShowResolved}
                      title="Show resolved comments"
                    >
                      <FontAwesomeIcon icon={faCircleCheck} /> {resolvedCount}
                    </Button>
                  )}
                </ToolBox>
              </Panel>
            ) : (
              <Panel position="top-left">
                <ToolBox>
                  <ButtonGroup size="sm">
                    <Button
                      variant={
                        tool === "select" ? "primary" : "outline-secondary"
                      }
                      onClick={() => setTool("select")}
                      title="Select and move (Shift-drag to select an area, Ctrl/⌘-click to add)"
                    >
                      <FontAwesomeIcon icon={faArrowPointer} />
                    </Button>
                    <Button
                      variant={tool === "pen" ? "primary" : "outline-secondary"}
                      onClick={() => setTool("pen")}
                      title="Draw (hold Space to pan)"
                    >
                      <FontAwesomeIcon icon={faPen} />
                    </Button>
                    <Button
                      variant={
                        tool === "eraser" ? "primary" : "outline-secondary"
                      }
                      onClick={() => setTool("eraser")}
                      title="Erase strokes"
                    >
                      <FontAwesomeIcon icon={faEraser} />
                    </Button>
                    <Button
                      variant={
                        tool === "connector" ? "primary" : "outline-secondary"
                      }
                      onClick={() => setTool("connector")}
                      title="Line: drag between two things to connect them, or anywhere for a free line (Shift snaps the angle)"
                    >
                      <ArrowHeadIcon kind="end" />
                    </Button>
                  </ButtonGroup>
                  {tool === "connector" && (
                    <LineStyleControls
                      value={lineStyle}
                      onChange={updateLineStyle}
                    />
                  )}
                  {tool === "pen" && (
                    <>
                      <ColourPicker
                        value={penColour}
                        palette={STROKE_COLOURS}
                        onChange={persistPenColour}
                        fallback={theme.colors.text}
                      />
                      <Form.Select
                        size="sm"
                        value={penWidth}
                        onChange={(e) =>
                          persistPenWidth(
                            e.target.value as WhiteboardStrokeWidth,
                          )
                        }
                        style={{ width: "auto" }}
                        aria-label="Pen width"
                      >
                        {WhiteboardStrokeWidths.map((w) => (
                          <option key={w} value={w}>
                            {w}
                          </option>
                        ))}
                      </Form.Select>
                    </>
                  )}
                  <ButtonGroup size="sm">
                    <Button
                      variant={
                        tool === "sticky" ? "primary" : "outline-secondary"
                      }
                      onClick={() => setTool("sticky")}
                      title="Sticky note: click to place, or drag to size"
                    >
                      <FontAwesomeIcon icon={faNoteSticky} />
                    </Button>
                    <Button
                      variant={
                        tool === "text" ? "primary" : "outline-secondary"
                      }
                      onClick={() => setTool("text")}
                      title="Text: click to place, or drag to size"
                    >
                      <FontAwesomeIcon icon={faFont} />
                    </Button>
                    <Button
                      variant={
                        tool === "frame" ? "primary" : "outline-secondary"
                      }
                      onClick={() => setTool("frame")}
                      title="Frame: click to place, or drag to size"
                    >
                      <FontAwesomeIcon icon={faObjectGroup} />
                    </Button>
                  </ButtonGroup>
                  <ButtonGroup size="sm">
                    <Button
                      variant={
                        tool === "comment" ? "primary" : "outline-secondary"
                      }
                      onClick={() => setTool("comment")}
                      title="Comment: click on something to start a thread about it"
                    >
                      <FontAwesomeIcon icon={faComment} />
                    </Button>
                    <Button
                      variant={showResolved ? "secondary" : "outline-secondary"}
                      onClick={toggleShowResolved}
                      title="Show resolved comments"
                    >
                      <FontAwesomeIcon icon={faCircleCheck} />
                      {resolvedCount > 0 && ` ${resolvedCount}`}
                    </Button>
                  </ButtonGroup>
                  <ButtonGroup size="sm">
                    <Button
                      variant={
                        showFeederArrows ? "secondary" : "outline-secondary"
                      }
                      onClick={toggleFeederArrows}
                      title="Show feeder arrows"
                    >
                      <FontAwesomeIcon icon={faDiagramProject} />
                    </Button>
                    <Button
                      variant={showHidden ? "secondary" : "outline-secondary"}
                      onClick={() => {
                        setShowHidden((s) => !s);
                        closeComment();
                      }}
                      title="Puzzles not on the board"
                    >
                      <FontAwesomeIcon icon={faEyeSlash} />
                      {hiddenCards.length > 0 && ` ${hiddenCards.length}`}
                    </Button>
                  </ButtonGroup>
                </ToolBox>
              </Panel>
            )}
            {!readOnly && tool === "select" && selectedLines.length > 0 && (
              <Panel position="bottom-center">
                <ToolBox>
                  <LineStyleControls
                    value={{
                      ...DEFAULT_LINE_STYLE,
                      ...Object.fromEntries(
                        (
                          [
                            "pathStyle",
                            "arrowHead",
                            "colour",
                            "dashed",
                          ] as const
                        )
                          .map((k) => [k, selectedLines[0]!.data?.doc[k]])
                          .filter(([, v]) => v !== undefined),
                      ),
                    }}
                    onChange={restyleLines}
                  />
                </ToolBox>
              </Panel>
            )}
            {!readOnly && tool === "select" && selectedUnitCount >= 2 && (
              <Panel position="top-center">
                <ToolBox>
                  <ButtonGroup size="sm" aria-label="Align">
                    {(
                      [
                        ["left", "Align left edges"],
                        ["centre", "Align centres horizontally"],
                        ["right", "Align right edges"],
                        ["top", "Align top edges"],
                        ["middle", "Align centres vertically"],
                        ["bottom", "Align bottom edges"],
                      ] as const
                    ).map(([mode, title]) => (
                      <Button
                        key={mode}
                        variant="outline-secondary"
                        title={title}
                        aria-label={title}
                        onClick={() => arrange({ kind: "align", mode })}
                      >
                        <ArrangeIcon kind={mode} />
                      </Button>
                    ))}
                  </ButtonGroup>
                  <ButtonGroup size="sm" aria-label="Distribute">
                    {(
                      [
                        ["horizontal", "Space evenly left to right"],
                        ["vertical", "Space evenly top to bottom"],
                      ] as const
                    ).map(([axis, title]) => (
                      <Button
                        key={axis}
                        variant="outline-secondary"
                        title={
                          selectedUnitCount < 3
                            ? `${title} (select three or more)`
                            : title
                        }
                        aria-label={title}
                        disabled={selectedUnitCount < 3}
                        onClick={() => arrange({ kind: "distribute", axis })}
                      >
                        <ArrangeIcon kind={axis} />
                      </Button>
                    ))}
                  </ButtonGroup>
                </ToolBox>
              </Panel>
            )}
            {(draft || openThreadData) && (
              <Panel position="top-right">
                <CommentPanel
                  key={
                    draft
                      ? `draft:${draft.node ?? ""}:${draft.x}:${draft.y}`
                      : (openThread ?? "")
                  }
                  huntId={huntId}
                  puzzleId={puzzleId}
                  thread={openThreadData}
                  draft={draft ?? undefined}
                  targetLabel={commentTarget}
                  readOnly={readOnly}
                  onClose={closeComment}
                  onDraftSent={onDraftSent}
                />
              </Panel>
            )}
            {showHidden && !readOnly && !draft && !openThreadData && (
              <Panel position="top-right">
                <SidePanel>
                  <strong>Not on the board</strong>
                  {hiddenCards.length === 0 && (
                    <div>Every puzzle is on the board.</div>
                  )}
                  {hiddenCards.map((card) => (
                    <HiddenRow key={card.puzzle}>
                      <span title={card.title}>{card.title}</span>
                      <Button
                        size="sm"
                        variant="link"
                        onClick={() => putBack(card)}
                      >
                        Put back
                      </Button>
                    </HiddenRow>
                  ))}
                </SidePanel>
              </Panel>
            )}
          </ReactFlow>
        </CanvasWrapper>
      </PeopleContext.Provider>
    </WhiteboardContext.Provider>
  );
};

const WhiteboardCanvas = (props: CanvasProps) => (
  <ReactFlowProvider>
    <CanvasInner {...props} />
  </ReactFlowProvider>
);

export default React.memo(WhiteboardCanvas);
