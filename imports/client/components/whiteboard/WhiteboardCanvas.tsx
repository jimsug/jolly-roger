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
  AriaLabelConfig,
  EdgeChange,
  Node,
  NodeChange,
  OnBeforeDelete,
  OnConnectEnd,
  OnConnectStart,
  OnMoveEnd,
  OnNodeDrag,
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
  useInternalNode,
  useReactFlow,
  ViewportPortal,
} from "@xyflow/react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import FormSelect from "react-bootstrap/FormSelect";
import { useTranslation } from "react-i18next";
import styled, { css, useTheme } from "styled-components";
import Flags from "../../../Flags";
import type { ChatMessageCommentAnchorType } from "../../../lib/models/ChatMessages";
import Puzzles from "../../../lib/models/Puzzles";
import type {
  WhiteboardColor,
  WhiteboardStrokeWidth,
} from "../../../lib/models/WhiteboardNodes";
import WhiteboardNodes, {
  WhiteboardStrokeWidths,
} from "../../../lib/models/WhiteboardNodes";
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
  sortParentsFirst,
} from "../../../lib/whiteboard/arrange";
import { commentPosition, isUnread } from "../../../lib/whiteboard/comments";
import type { AttachHit } from "../../../lib/whiteboard/connectors";
import {
  attachHit,
  centerOf,
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
  round1,
  STROKE_SIZES,
  simulatedPressure,
} from "../../../lib/whiteboard/ink";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  POINT_SIZE,
} from "../../../lib/whiteboard/layout";
import {
  MAX_BATCH,
  MAX_FRAME_DEPTH,
  MAX_LIVE_DRAG_NODES,
} from "../../../lib/whiteboard/limits";
import type { LineStyle } from "../../../lib/whiteboard/lineStyle";
import deleteWhiteboardEdges from "../../../methods/deleteWhiteboardEdges";
import deleteWhiteboardNodes from "../../../methods/deleteWhiteboardNodes";
import type { WhiteboardLiveState } from "../../../methods/setWhiteboardLive";
import type { WhiteboardEdgeInput } from "../../../methods/upsertWhiteboardEdges";
import upsertWhiteboardEdges from "../../../methods/upsertWhiteboardEdges";
import type { WhiteboardNodeInput } from "../../../methods/upsertWhiteboardNodes";
import upsertWhiteboardNodes from "../../../methods/upsertWhiteboardNodes";
import {
  useWhiteboardFeederArrows,
  useWhiteboardLineStyle,
  useWhiteboardPenColor,
  useWhiteboardPenWidth,
  useWhiteboardShowResolvedComments,
  useWhiteboardViewport,
} from "../../hooks/persisted-state";
import usePuzzlePeople from "../../hooks/usePuzzlePeople";
import useTypedSubscribe from "../../hooks/useTypedSubscribe";
import useWhiteboardComments, {
  useSeenComments,
} from "../../hooks/useWhiteboardComments";
import useWhiteboardLive from "../../hooks/useWhiteboardLive";
import type {
  LineLabels,
  RemoteDrag,
  WhiteboardFlowEdge,
  WhiteboardFlowNode,
} from "../../hooks/useWhiteboardSync";
import useWhiteboardSync, {
  selectionUnits,
} from "../../hooks/useWhiteboardSync";
import WhiteboardPresence from "../../WhiteboardPresence";
import ArrangeIcon from "./ArrangeIcon";
import ColorPicker from "./ColorPicker";
import type { CommentPin } from "./CommentLayer";
import CommentLayer from "./CommentLayer";
import CommentPanel from "./CommentPanel";
import CursorLayer from "./CursorLayer";
import colors from "./colors";
import describeCommentTarget from "./describeCommentTarget";
import FrameLabelLayer from "./FrameLabelLayer";
import FrameNode from "./FrameNode";
import { boxOf } from "./floatingEdgeParams";
import InkNode from "./InkNode";
import LineStyleControls, { DEFAULT_LINE_STYLE } from "./LineStyleControls";
import LineStyleIcon from "./LineStyleIcon";
import { MIN_SIZES } from "./NodeChrome";
import PeopleContext from "./PeopleContext";
import PointNode from "./PointNode";
import PuzzleCardNode from "./PuzzleCardNode";
import StickyNode from "./StickyNode";
import TextNode from "./TextNode";
import type { WhiteboardActions } from "./WhiteboardContext";
import WhiteboardContext from "./WhiteboardContext";
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
  // Where the press was, on screen, so a grip that's only clicked stays put.
  pressedAt?: { x: number; y: number };
}

// Where nodes are being moved to, each in its frame (if any).
type NodeMoves = Map<string, { position: XYPosition; parent?: string }>;

const isPlaceTool = (tool: Tool): tool is PlaceTool =>
  tool === "sticky" || tool === "text" || tool === "frame";

// Size when placed with a click; dragging out a box sets the size instead.
const DEFAULT_SIZES: Record<PlaceTool, { width: number; height: number }> = {
  sticky: { width: 200, height: 160 },
  text: { width: 240, height: 48 },
  frame: { width: 2 * CARD_WIDTH + 64, height: 2 * CARD_HEIGHT + 104 },
};
// A press that moves less than this (in screen pixels) is a click.
const CLICK_SLOP = 4;
// The parts of the canvas that sit over the board, where presses are the
// controls' own rather than a tool's.
const OVERLAYS =
  ".react-flow__panel, .react-flow__controls, .react-flow__minimap, .react-flow__node-toolbar, .jr-comment-pin";
// How close (in screen pixels) a line end has to be to something to attach to
// it: just outside its edge, or either side of a frame's border.
const ATTACH_MARGIN = 8;
const FRAME_ATTACH_MARGIN = 12;

// Free line ends are too small to show on the mini map.
const miniMapNodeColor = (node: Node) =>
  node.type === "point" ? "transparent" : "rgb(128 128 128 / 45%)";

const CanvasWrapper = styled.div<{ $tool: Tool; $readOnly: boolean }>`
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

  /* On a read-only board React Flow stops nodes taking the pointer, since
     they can't be selected or dragged, but their links and attribution
     should still work. */
  ${({ $readOnly }) =>
    $readOnly &&
    css`
      .react-flow__node .nodrag {
        pointer-events: auto;
      }
    `}

  /* Line labels, grips and attribution sit above everything, so a grip on
     the edge of the thing a line is attached to can still be grabbed. */
  .react-flow__edgelabel-renderer {
    z-index: 1002;
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

const PenWidthSelect = styled(FormSelect)`
  width: auto;
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
    $tool === "sticky" ? `${colors.fill.yellow}99` : "transparent"};
`;

const LocalStroke = styled.svg`
  position: absolute;
  left: 0;
  top: 0;
  overflow: visible;
  pointer-events: none;
`;

type LiveDrag = NonNullable<WhiteboardLiveState["drag"]>[number];

// Whether two lists of other people's drags would put everything in the same
// place.
const sameDrags = (a: LiveDrag[], b: LiveDrag[]) =>
  a.length === b.length &&
  a.every((drag, i) => {
    const other = b[i];
    return (
      !!other &&
      drag.node === other.node &&
      drag.x === other.x &&
      drag.y === other.y &&
      (drag.parent ?? null) === (other.parent ?? null)
    );
  });

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

// The dashed outline around something a line end will attach to. It follows
// the node through React Flow's store, so it keeps up as the node moves.
const AttachOutline = React.memo(({ id }: { id: string }) => {
  const theme = useTheme();
  const node = useInternalNode(id);
  if (!node) return null;
  const { x, y, width, height } = boxOf(node);
  return (
    <rect
      x={x - 4}
      y={y - 4}
      width={width + 8}
      height={height + 8}
      rx={8}
      fill="none"
      stroke={theme.colors.primary}
      strokeWidth={2}
      strokeDasharray="6 4"
    />
  );
});

// A tool on the toolbar. Its title says what it does, and names it for
// screen readers too.
const ToolButton = ({
  tool,
  active,
  title,
  onSelect,
  children,
}: {
  tool: Tool;
  active: boolean;
  title: string;
  onSelect: (tool: Tool) => void;
  children: React.ReactNode;
}) => {
  const onClick = useCallback(() => onSelect(tool), [onSelect, tool]);
  return (
    <Button
      variant={active ? "primary" : "outline-secondary"}
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
    >
      {children}
    </Button>
  );
};

// Lines up or spaces out the selection one way.
const ArrangeButton = <Kind extends AlignMode | DistributeAxis>({
  kind,
  title,
  label,
  disabled,
  onArrange,
}: {
  kind: Kind;
  title: string;
  label: string;
  disabled?: boolean;
  onArrange: (kind: Kind) => void;
}) => {
  const onClick = useCallback(() => onArrange(kind), [onArrange, kind]);
  return (
    <Button
      variant="outline-secondary"
      title={title}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <ArrangeIcon kind={kind} />
    </Button>
  );
};

// A puzzle that isn't on the board, with a way to put it back.
interface MissingCard {
  id: string | undefined;
  puzzle: string;
  title: string;
}

const MissingCardRow = ({
  card,
  onPutBack,
}: {
  card: MissingCard;
  onPutBack: (card: MissingCard) => void;
}) => {
  const { t } = useTranslation();
  const onClick = useCallback(() => onPutBack(card), [onPutBack, card]);
  return (
    <HiddenRow>
      <span title={card.title}>{card.title}</span>
      <Button size="sm" variant="link" onClick={onClick}>
        {t("whiteboard.hidden.putBack", "Put back")}
      </Button>
    </HiddenRow>
  );
};

interface Drawing {
  stroke: string;
  color: WhiteboardColor;
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
  // Whether the board's nodes and lines have arrived.
  boardLoaded: boolean;
  // Set to the canvas's way of showing a comment, for the board's chat.
  focusRef: React.RefObject<((threadId: string) => void) | undefined>;
  // A comment to show once the board has loaded (from a ?comment= link).
  initialComment?: string;
  onInitialCommentShown?: () => void;
}

const CanvasInner = ({
  boardId,
  huntId,
  puzzleId,
  readOnly,
  boardLoaded,
  focusRef,
  initialComment,
  onInitialCommentShown,
}: CanvasProps) => {
  const theme = useTheme();
  const { t } = useTranslation();
  const flow = useReactFlow<WhiteboardFlowNode, WhiteboardFlowEdge>();
  const wrapperRef = useRef<HTMLDivElement>(null);

  // The hunt's puzzles and tags come from the puzzle page around the canvas,
  // which only shows it once they've loaded (puzzleForPuzzlePage), and the
  // board's nodes and lines from the whiteboard page.
  const people = usePuzzlePeople(huntId);

  const liveEnabled = useTracker(
    () => !Flags.active("disable.whiteboard_live"),
    [],
  );
  useTypedSubscribe(liveEnabled ? whiteboardPresence : undefined, {
    boardId,
  });
  const live = useWhiteboardLive(boardId, liveEnabled && !readOnly);

  // Cursors move constantly, but only what people are dragging matters here
  // (CursorLayer draws the rest). Reading just that means cursor moves don't
  // re-render the canvas, and nodes are only rebuilt when a drag changes.
  const drags = useTracker(
    () =>
      liveEnabled
        ? WhiteboardPresence.find(
            { board: boardId },
            { projection: { drag: 1 } },
          )
            .fetch()
            .flatMap((p) => p.drag ?? [])
        : [],
    [boardId, liveEnabled],
    sameDrags,
  );
  const remoteDrags = useMemo(
    () =>
      new Map(
        drags.map(({ node, x, y, parent }): [string, RemoteDrag] => [
          node,
          { x, y, parent: parent ?? undefined },
        ]),
      ),
    [drags],
  );

  const livePuzzles = useTracker(
    () =>
      Puzzles.find(
        { hunt: huntId, kind: { $ne: "whiteboard" } },
        { projection: { _id: 1, title: 1 } },
      ).fetch(),
    [huntId],
  );
  const livePuzzleIds = useMemo(
    () => new Set(livePuzzles.map((p) => p._id)),
    [livePuzzles],
  );

  // Each viewer's own pan and zoom for the board, and their tool settings.
  const [savedViewport, setSavedViewport] = useWhiteboardViewport(boardId);
  // Only the viewport the board opened at counts; it's fitted to the board
  // when there's none.
  const [initialViewport] = useState(savedViewport);
  const [showFeederArrows, setShowFeederArrows] = useWhiteboardFeederArrows();
  const [tool, setTool] = useState<Tool>("select");
  // A board that becomes read-only (say, the hunt is archived) puts any
  // drawing tool down.
  if (readOnly && tool !== "select") setTool("select");
  const [penColor, setPenColor] = useWhiteboardPenColor();
  const [penWidth, setPenWidth] = useWhiteboardPenWidth();
  const [showHidden, setShowHidden] = useState(false);
  const [showResolved, setShowResolved] = useWhiteboardShowResolvedComments();
  const [openThread, setOpenThread] = useState<string>();
  const [draft, setDraft] = useState<ChatMessageCommentAnchorType>();
  const [pulse, setPulse] = useState<string | undefined>();
  const pulseTimer = useRef<number | undefined>(undefined);
  // Timeouts that only tidy up this component's state, cleared with it.
  const tidyTimers = useRef(new Set<number>());
  const tidyLater = useCallback((tidy: () => void, ms: number) => {
    const timer = window.setTimeout(() => {
      tidyTimers.current.delete(timer);
      tidy();
    }, ms);
    tidyTimers.current.add(timer);
  }, []);
  useEffect(() => {
    const timers = tidyTimers.current;
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);
  const commentPress = useRef<XYPosition | undefined>(undefined);
  // A comment just sent, to open once it comes back from the server.
  const sentDraft = useRef<
    { anchor: ChatMessageCommentAnchorType; at: number } | undefined
  >(undefined);
  // Where a sticky, text box or frame will go: the press point and the
  // current pointer while placing, or just the pointer while hovering.
  const [placing, setPlacing] = useState<{
    start: XYPosition;
    current: XYPosition;
  }>();
  const [hover, setHover] = useState<XYPosition>();
  // What a line end would attach to: under the pointer with the line tool
  // before pressing, or under a free end being dragged.
  const [attachPreview, setAttachPreview] = useState<string | undefined>();
  const [connecting, setConnecting] = useState<Connecting>();
  const [lineStyle, setLineStyle] = useWhiteboardLineStyle(DEFAULT_LINE_STYLE);
  // Nodes carried along by a node being moved (free line ends, the rest of an
  // ink stroke), saved when the move ends.
  const companions = useRef(new Set<string>());
  const dragActive = useRef(false);
  // Nodes moved with the arrow keys, saved shortly after the last press by
  // saveNudges (further down, after the helpers it uses).
  const nudged = useRef(new Set<string>());
  const nudgeTimer = useRef<number | undefined>(undefined);
  const saveNudgesRef = useRef<() => void>(undefined);
  const lineColors = useMemo(
    () => ({ text: theme.colors.text, muted: theme.colors.textSecondary }),
    [theme],
  );
  const lineLabels = useMemo(
    (): LineLabels => ({
      line: t("whiteboard.line.ariaLabel", "Line"),
      feeder: t("whiteboard.line.feederAriaLabel", "Feeder arrow"),
    }),
    [t],
  );
  const [editOnAppear, setEditOnAppear] = useState<string | undefined>();
  const [erasingStrokes, setErasingStrokes] = useState<Set<string>>(new Set());
  const drawing = useRef<Drawing | undefined>(undefined);
  // The stroke being drawn, as it's shown until it's saved.
  const [localStroke, setLocalStroke] = useState<
    Pick<Drawing, "color" | "strokeWidth"> & { points: InkPoint[] }
  >();
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
    markEdgePending,
    clearEdgePending,
  } = useWhiteboardSync({
    boardId,
    livePuzzleIds,
    showFeederArrows,
    remoteDrags,
    erasingStrokes,
    lineColors,
    lineLabels,
  });

  const updateNodes = useCallback(
    (inputs: WhiteboardNodeInput[], onDone?: () => void) => {
      if (inputs.length === 0) {
        onDone?.();
        return;
      }
      const batches = chunks(inputs, MAX_BATCH);
      let outstanding = batches.length;
      batches.forEach((batch) => {
        upsertWhiteboardNodes.call({ boardId, nodes: batch }, (error) => {
          if (error) clearPending(batch.map((n) => n._id));
          outstanding -= 1;
          if (outstanding === 0) onDone?.();
        });
      });
    },
    [boardId, clearPending],
  );

  const deleteNodes = useCallback(
    (ids: string[]) => {
      chunks(ids, MAX_BATCH).forEach((batch) => {
        deleteWhiteboardNodes.call({ boardId, nodeIds: batch });
      });
    },
    [boardId],
  );

  // Shows moved nodes in their new places (and frames) straight away, rather
  // than once the server has them.
  const showMoves = useCallback(
    (moves: NodeMoves) => {
      if (moves.size === 0) return;
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
    },
    [setNodes],
  );

  const updateEdge = useCallback(
    (input: WhiteboardEdgeInput) => {
      // Changes to a line show at once; a new line waits for the server.
      const existing = !!flow.getEdge(input._id);
      if (existing) {
        const { _id, ...change } = input;
        markEdgePending(_id, change);
      }
      upsertWhiteboardEdges.call({ boardId, edges: [input] }, (error) => {
        if (error && existing) clearEdgePending([input._id]);
      });
    },
    [boardId, flow, markEdgePending, clearEdgePending],
  );

  // After a resize, save the node's new box and any of its children whose
  // position changed (resizing from the top or left moves the origin, and
  // React Flow compensates the children to keep them still).
  const persistResize = useCallback(
    (id: string) => {
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
      // Resizes and arrow-key moves only reach the server later (when the
      // resize ends, or once the presses stop), so they're held as pending
      // from the start: a refresh from someone else's edit mustn't undo them.
      changes.forEach((c) => {
        if (c.type === "dimensions" && c.resizing && c.dimensions) {
          markPending(c.id, {
            width: c.dimensions.width,
            height: c.dimensions.height,
          });
        }
      });
      if (resizing) {
        moves.forEach((c, id) => markPending(id, { position: c.position! }));
      }
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
          // The last change of a drag doesn't move anything, but it's what
          // tells React Flow the carried nodes aren't being dragged any more.
          if (dx === 0 && dy === 0 && change.dragging !== false) return;
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
          moves.forEach((change, id) => {
            nudged.current.add(id);
            markPending(id, { position: change.position! });
          });
          following.forEach((_leader, id) => {
            nudged.current.add(id);
            const carried = extra.find(
              (c) => c.type === "position" && c.id === id,
            );
            if (carried?.type === "position" && carried.position) {
              markPending(id, { position: carried.position });
            }
          });
          window.clearTimeout(nudgeTimer.current);
          nudgeTimer.current = window.setTimeout(
            () => saveNudgesRef.current?.(),
            400,
          );
        }
      }
      setNodes((nds) => applyNodeChanges([...changes, ...extra], nds));
    },
    [flow, setNodes, markPending],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<WhiteboardFlowEdge>[]) => {
      setEdges((eds) => applyEdgeChanges(changes, eds));
    },
    [setEdges],
  );

  // We delete on the server and let the echo update the canvas, so that
  // children of a deleted frame stay put rather than going with it.
  const onBeforeDelete: OnBeforeDelete<WhiteboardFlowNode, WhiteboardFlowEdge> =
    useCallback(
      ({ nodes: doomedNodes, edges: doomedEdges }) => {
        const nodeIds = doomedNodes.filter((n) => n.selected).map((n) => n.id);
        const edgeIds = doomedEdges.filter((e) => e.selected).map((e) => e.id);
        if (nodeIds.length > 0) deleteNodes(nodeIds);
        if (edgeIds.length > 0) {
          chunks(edgeIds, MAX_BATCH).forEach((batch) =>
            deleteWhiteboardEdges.call({ boardId, edgeIds: batch }),
          );
        }
        return Promise.resolve(false);
      },
      [boardId, deleteNodes],
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

  // A node's box on the board from its own position, which during a drag is
  // ahead of what React Flow last rendered.
  const liveRect = useCallback(
    (node: WhiteboardFlowNode) => {
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
  // at a time, rather than once per node.
  const frameRects = useCallback(
    () =>
      flow.getNodes().flatMap((n) => {
        if (n.type !== "frame") return [];
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
      frames: ReturnType<typeof frameRects> = frameRects(),
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
    (
      id: string,
      rect: { x: number; y: number; width: number; height: number },
      moving: Set<string>,
      frames?: ReturnType<typeof frameRects>,
    ) => {
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

  // Saves the nodes nudged with the arrow keys.
  const saveNudges = useCallback(() => {
    const inputs: WhiteboardNodeInput[] = [];
    const nudgedIds = new Set(nudged.current);
    const frames = frameRects();
    const moves: NodeMoves = new Map();
    nudgedIds.forEach((id) => {
      const node = flow.getNode(id);
      if (!node) return;
      // Like a drop, something nudged into or out of a frame joins or leaves
      // it. Things carried along (free line ends, the rest of a stroke) and
      // things inside a frame that moved too keep their frame.
      const carried =
        companions.current.has(id) ||
        [...nudgedIds].some((other) => other !== id && isWithin(id, other));
      const rect = carried ? undefined : absoluteRect(id);
      if (rect) {
        const { parent, position } = placementFor(id, rect, nudgedIds, frames);
        if (parent !== node.parentId) {
          inputs.push({ _id: id, position, parent: parent ?? null });
          markPending(id, { position, parent: parent ?? null });
          moves.set(id, { position, parent });
          return;
        }
      }
      inputs.push({ _id: id, position: node.position });
      markPending(id, { position: node.position });
    });
    nudged.current.clear();
    companions.current.clear();
    showMoves(moves);
    updateNodes(inputs);
  }, [
    flow,
    frameRects,
    isWithin,
    absoluteRect,
    placementFor,
    markPending,
    showMoves,
    updateNodes,
  ]);
  useEffect(() => {
    saveNudgesRef.current = saveNudges;
  }, [saveNudges]);

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

  const onNodeDragStart = useCallback(() => {
    dragActive.current = true;
  }, []);

  const onNodeDrag: OnNodeDrag<WhiteboardFlowNode> = useCallback(
    (_event, _node, dragged) => {
      const only = dragged.length === 1 ? dragged[0] : undefined;
      const onto = only && droppedEnd(only)?.onto;
      setAttachPreview((current) => (current === onto ? current : onto));
      const carried = [...companions.current]
        .map((id) => flow.getNode(id))
        .filter((n): n is WhiteboardFlowNode => !!n);
      live.setDrag(
        [...dragged, ...carried].slice(0, MAX_LIVE_DRAG_NODES).map((n) => ({
          node: n.id,
          x: n.position.x,
          y: n.position.y,
          parent: n.parentId ?? null,
        })),
      );
    },
    [flow, live, droppedEnd],
  );

  // Dropping a node onto a frame puts it in the frame; dropping it outside
  // takes it out. Positions are stored relative to the parent.
  const onNodeDragStop: OnNodeDrag<WhiteboardFlowNode> = useCallback(
    (_event, _node, dragged) => {
      setAttachPreview(undefined);
      const draggedIds = new Set(dragged.map((n) => n.id));
      const frames = frameRects();
      const inputs: WhiteboardNodeInput[] = [];
      const moves: NodeMoves = new Map();

      dragged.forEach((node) => {
        // A line's free end dragged on its own onto something attaches there.
        if (dragged.length === 1 && attachDroppedEnd(node)) return;
        // Nodes inside a frame that's also moving go along with it.
        if (
          node.parentId &&
          [...draggedIds].some((id) => id !== node.id && isWithin(node.id, id))
        ) {
          return;
        }
        const { parent: target, position } = placementFor(
          node.id,
          liveRect(node),
          draggedIds,
          frames,
        );
        if (target === node.parentId) {
          inputs.push({ _id: node.id, position: node.position });
          markPending(node.id, { position: node.position });
          return;
        }
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

      showMoves(moves);
      // Others drop their copy of the drag only once the saved positions
      // are on their way, so they never see the node jump back.
      updateNodes(inputs, () => {
        if (!dragActive.current) live.setDrag(null);
      });
    },
    [
      flow,
      live,
      attachDroppedEnd,
      isWithin,
      liveRect,
      placementFor,
      frameRects,
      markPending,
      showMoves,
      updateNodes,
    ],
  );

  const nodeCenter = useCallback(
    (id: string) => {
      const rect = absoluteRect(id);
      return rect && centerOf(rect);
    },
    [absoluteRect],
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
      // The server runs one client's calls in order, so the line can follow
      // its free ends without waiting for them.
      if (points.length > 0) {
        upsertWhiteboardNodes.call({ boardId, nodes: points });
      }
      upsertWhiteboardEdges.call({ boardId, edges: [edge] }, (error) => {
        if (error && points.length > 0) {
          deleteWhiteboardNodes.call({
            boardId,
            nodeIds: points.map((p) => p._id),
          });
        }
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
      // The server runs one client's calls in order, so the line can follow
      // its new free end without waiting for it.
      const _id = Random.id();
      upsertWhiteboardNodes.call({
        boardId,
        nodes: [{ _id, type: "point", ...pointPlacement(endpoint) }],
      });
      upsertWhiteboardEdges.call(
        { boardId, edges: [{ _id: edgeId, [end]: _id }] },
        (edgeError) => {
          if (edgeError) {
            deleteWhiteboardNodes.call({ boardId, nodeIds: [_id] });
          }
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
    ],
  );

  const onMoveEnd: OnMoveEnd = useCallback(
    (_event, viewport) => setSavedViewport(viewport),
    [setSavedViewport],
  );
  const refreshAttachPreviewRef = useRef<() => void>(undefined);
  const onMove = useCallback(() => refreshAttachPreviewRef.current?.(), []);

  const paneCenter = useCallback(() => {
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
      const _id = Random.id();
      const { parent, position } = placementFor(_id, rect, new Set());
      updateNodes([
        {
          _id,
          type,
          position: { x: Math.round(position.x), y: Math.round(position.y) },
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          parent: parent ?? null,
          color: type === "sticky" ? "yellow" : undefined,
        },
      ]);
      setEditOnAppear(_id);
      // If the new node can't open for editing (e.g. a frame placed while
      // zoomed right out shows no label), don't let it grab focus later.
      tidyLater(
        () =>
          setEditOnAppear((current) => (current === _id ? undefined : current)),
        3000,
      );
      setTool("select");
    },
    [placementFor, updateNodes, tidyLater],
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
  // The first selected line's look, for the restyling controls.
  const selectedLineStyle = useMemo((): LineStyle => {
    const doc = selectedLines[0]?.data?.doc;
    return {
      pathStyle: doc?.pathStyle ?? DEFAULT_LINE_STYLE.pathStyle,
      arrowHead: doc?.arrowHead ?? DEFAULT_LINE_STYLE.arrowHead,
      color: doc?.color ?? DEFAULT_LINE_STYLE.color,
      dashed: doc?.dashed ?? DEFAULT_LINE_STYLE.dashed,
    };
  }, [selectedLines]);
  const restyleLines = useCallback(
    (patch: Partial<LineStyle>) => {
      if (selectedLines.length === 0) return;
      const lines = selectedLines.slice(0, MAX_BATCH);
      lines.forEach((e) => markEdgePending(e.id, patch));
      upsertWhiteboardEdges.call(
        {
          boardId,
          edges: lines.map((e) => ({ _id: e.id, ...patch })),
        },
        (error) => {
          if (error) clearEdgePending(lines.map((e) => e.id));
        },
      );
    },
    [boardId, selectedLines, markEdgePending, clearEdgePending],
  );
  const updateLineStyle = useCallback(
    (patch: Partial<LineStyle>) =>
      setLineStyle((current) => ({ ...current, ...patch })),
    [setLineStyle],
  );

  // Lines up or evenly spaces the selection. Works in board coordinates and
  // shifts each node by the same amount in its own parent's coordinates.
  const arrange = useCallback(
    (
      action:
        | { kind: "align"; mode: AlignMode }
        | { kind: "distribute"; axis: DistributeAxis },
    ) => {
      const units = selectionUnits(flow.getNodes(), flow.getEdges());
      const frames = frameRects();
      const items: ArrangeItem[] = [];
      // A free line end counts as the point it marks, not its grab box.
      const rectFor = (m: WhiteboardFlowNode) => {
        const rect = absoluteRect(m.id);
        if (!rect || m.type !== "point") return rect;
        return { ...centerOf(rect), width: 0, height: 0 };
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

      const moved: NodeMoves = new Map();
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
          const placed =
            rect &&
            placementFor(
              m.id,
              { ...rect, x: rect.x + shift.dx, y: rect.y + shift.dy },
              movingIds,
              frames,
            );
          if (placed && placed.parent !== m.parentId) {
            const { parent } = placed;
            const position = {
              x: round1(placed.position.x),
              y: round1(placed.position.y),
            };
            moved.set(m.id, { position, parent });
            inputs.push({ _id: m.id, position, parent: parent ?? null });
            markPending(m.id, { position, parent: parent ?? null });
            return;
          }
          const position = {
            x: round1(m.position.x + shift.dx),
            y: round1(m.position.y + shift.dy),
          };
          moved.set(m.id, { position, parent: m.parentId });
          inputs.push({ _id: m.id, position });
          markPending(m.id, { position });
        });
      });
      showMoves(moved);
      updateNodes(inputs);
    },
    [
      flow,
      absoluteRect,
      frameRects,
      placementFor,
      markPending,
      showMoves,
      updateNodes,
    ],
  );

  const hiddenCards = useMemo((): MissingCard[] => {
    const titles = new Map(livePuzzles.map((p) => [p._id, p.title]));
    const onBoard = new Set(nodeDocs.map((d) => d.puzzle).filter(Boolean));
    const hidden = nodeDocs.flatMap((d) => {
      const title = d.puzzle && titles.get(d.puzzle);
      return d.type === "puzzle" && d.hidden && d.puzzle && title
        ? [{ id: d._id, puzzle: d.puzzle, title }]
        : [];
    });
    const missing = livePuzzles
      .filter((p) => !onBoard.has(p._id))
      .map((p) => ({ id: undefined, puzzle: p._id, title: p.title }));
    return [...hidden, ...missing].toSorted((a, b) =>
      a.title.localeCompare(b.title),
    );
  }, [livePuzzles, nodeDocs]);

  const putBack = useCallback(
    (card: MissingCard) => {
      const center = paneCenter();
      const position = {
        x: Math.round(center.x - CARD_WIDTH / 2),
        y: Math.round(center.y - CARD_HEIGHT / 2),
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
    [paneCenter, updateNodes],
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
          color: state.color,
          stroke: state.stroke,
        },
      ]);
      state.committed += 1;
    },
    [absoluteRect, updateNodes],
  );

  const selfId = useTracker(() => Meteor.userId() ?? undefined, []);
  const threads = useWhiteboardComments(puzzleId);
  const [seenComments, markCommentSeen] = useSeenComments(boardId, threads);
  // A thread that has gone (deleted, say) counts as closed.
  const openThreadData = openThread ? threads.get(openThread) : undefined;
  const openThreadId = openThreadData?.root._id;

  // A comment goes on the topmost thing under it (anything but ink and line
  // ends), so it moves with it; otherwise it's pinned to the board.
  const commentAnchorAt = useCallback(
    (point: XYPosition): ChatMessageCommentAnchorType => {
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
            x: round1(point.x - best.rect.x),
            y: round1(point.y - best.rect.y),
          }
        : { x: round1(point.x), y: round1(point.y) };
    },
    [flow, absoluteRect],
  );

  const openComment = useCallback((id: string) => {
    if (id === "draft") return;
    setOpenThread(id);
    setDraft(undefined);
    setShowHidden(false);
  }, []);

  const closeComment = useCallback(() => {
    setOpenThread(undefined);
    setDraft(undefined);
  }, []);

  const onDraftSent = useCallback(
    (sentAt: Date) => {
      if (draft) sentDraft.current = { anchor: draft, at: +sentAt };
      setDraft(undefined);
    },
    [draft],
  );

  // Open a comment we've just left as soon as it's saved, unless something
  // else has been opened since.
  useEffect(() => {
    const sent = sentDraft.current;
    if (!sent) return;
    if (draft || openThreadId) {
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
  }, [threads, selfId, draft, openThreadId]);

  useEffect(() => {
    if (openThreadData) {
      markCommentSeen(openThreadData.root._id, +openThreadData.lastActivity);
    }
  }, [openThreadData, markCommentSeen]);

  // Pans to a comment and opens it, if it's on the board.
  const showComment = useCallback(
    (threadId: string) => {
      const anchor = threads.get(threadId)?.root.comment;
      if (!anchor) return;
      const at = commentPosition(
        anchor,
        anchor.node ? absoluteRect(anchor.node) : undefined,
      );
      if (!at) return;
      setShowHidden(false);
      setDraft(undefined);
      setOpenThread(threadId);
      void flow.setCenter(at.x, at.y, {
        zoom: Math.max(flow.getZoom(), 0.8),
        duration: 400,
      });
      setPulse(threadId);
      window.clearTimeout(pulseTimer.current);
      pulseTimer.current = window.setTimeout(
        () => setPulse(undefined),
        PULSE_MS,
      );
    },
    [threads, flow, absoluteRect],
  );

  // A comment asked for before the board has its nodes laid out, or before
  // the thread has reached this client, is shown as soon as both are ready.
  // One from the page's ?comment= link waits the same way, each time the
  // link changes.
  const [pendingFocus, setPendingFocus] = useState(initialComment);
  const [linkedComment, setLinkedComment] = useState(initialComment);
  if (initialComment !== linkedComment) {
    setLinkedComment(initialComment);
    if (initialComment) setPendingFocus(initialComment);
  }
  const readyToShow = useCallback(
    (threadId: string) => {
      const anchor = threads.get(threadId)?.root.comment;
      if (!anchor) return false;
      if (!anchor.node) return true;
      if (!boardLoaded) return false;
      // Once loaded, a comment on something that's gone is as ready as it
      // will ever be (showComment then leaves it).
      const doc = WhiteboardNodes.findOne(anchor.node);
      return !doc || !!doc.hidden || !!flow.getInternalNode(anchor.node);
    },
    [threads, boardLoaded, flow],
  );

  const focusComment = useCallback(
    (threadId: string) => {
      if (readyToShow(threadId)) return showComment(threadId);
      setPendingFocus(threadId);
    },
    [readyToShow, showComment],
  );

  // React Flow takes in new nodes before this component's effects run, so
  // this is rechecked whenever they change.
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
    nodes,
  ]);

  useEffect(() => {
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
        id !== openThreadId &&
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
  }, [threads, showResolved, openThreadId, pulse, seenComments, selfId, draft]);

  const resolvedCount = useMemo(
    () => [...threads.values()].filter((t) => t.resolved).length,
    [threads],
  );

  const commentTarget = useTracker(
    () =>
      describeCommentTarget(
        draft ? draft.node : openThreadData?.root.comment?.node,
        t,
      ),
    [draft, openThreadData?.root.comment?.node, t],
  );

  const toggleShowResolved = useCallback(
    () => setShowResolved((current) => !current),
    [setShowResolved],
  );

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
        if (!rect || !contains(rect, point)) return;
        const size = STROKE_SIZES[n.data.doc.strokeWidth ?? "medium"];
        const distance = distanceToInk(
          n.data.doc.points ?? [],
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
    tidyLater(() => setErasingStrokes(new Set()), 1500);
  }, [flow, erasingStrokes, deleteNodes, tidyLater]);

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
      if (target.closest(`${OVERLAYS}, .react-flow__resize-control`)) {
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
        color: penColor,
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
      setLocalStroke({
        color: state.color,
        strokeWidth: state.strokeWidth,
        points: [...state.segmenter.points],
      });
    },
    [
      readOnly,
      tool,
      flowPoint,
      eraseAt,
      penColor,
      penWidth,
      frameAt,
      resolveEndpoint,
    ],
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
  // pointer's last position on screen; kept up to date as the view or the
  // board changes under a still pointer.
  const lastPointer = useRef<{ x: number; y: number } | undefined>(undefined);
  const refreshAttachPreview = useCallback(() => {
    if (tool !== "connector") return;
    const at = lastPointer.current;
    let id: string | undefined;
    if (!readOnly && !connecting && at) {
      const under = resolveEndpoint(flow.screenToFlowPosition(at), new Set());
      id = "node" in under ? under.node : undefined;
    }
    setAttachPreview((current) => (current === id ? current : id));
  }, [readOnly, tool, connecting, flow, resolveEndpoint]);
  // Objects moving under a still pointer change what's under it.
  useEffect(() => {
    refreshAttachPreview();
  }, [nodes, refreshAttachPreview]);

  // onMove, further up, refreshes it as the view moves.
  useEffect(() => {
    refreshAttachPreviewRef.current = refreshAttachPreview;
  }, [refreshAttachPreview]);

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const point = flowPoint(event);
      if (event.pointerType !== "touch") live.setCursor(point);
      // Over the toolbars, panels and pins a press doesn't start anything.
      lastPointer.current = (event.target as HTMLElement).closest(OVERLAYS)
        ? undefined
        : { x: event.clientX, y: event.clientY };

      if (connecting) {
        const target = targetFor(connecting, point, event.shiftKey);
        setConnecting({
          ...connecting,
          current: "node" in target ? point : target.point,
          target,
        });
        return;
      }

      if (tool === "connector") {
        refreshAttachPreview();
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
        const previous = state.segmenter.points.at(-1);
        const pressure =
          sample.pointerType === "pen" && sample.pressure > 0
            ? sample.pressure
            : simulatedPressure(previous, p.x, p.y, size);
        const full = state.segmenter.push([p.x, p.y, pressure]);
        if (full) commitSegment(state, full);
      });
      setLocalStroke({
        color: state.color,
        strokeWidth: state.strokeWidth,
        points: [...state.segmenter.points],
      });
      live.setStroke({
        color: state.color,
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
      targetFor,
      refreshAttachPreview,
      eraseAt,
      commitSegment,
    ],
  );

  // The browser lets go of pointer capture itself after pointerup and
  // pointercancel.
  const onPointerUp = useCallback(
    (event: React.PointerEvent) => {
      if (connecting) {
        const { fixed, edgeId, end } = connecting;
        // Worked out from where the pointer was let go, which can be a move
        // ahead of the last rendered preview.
        const target = targetFor(connecting, flowPoint(event), event.shiftKey);
        setConnecting(undefined);
        if (edgeId && end) {
          const { pressedAt } = connecting;
          const clicked =
            pressedAt &&
            Math.hypot(
              event.clientX - pressedAt.x,
              event.clientY - pressedAt.y,
            ) < CLICK_SLOP;
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
        return;
      }
      if (tool === "select") setAttachPreview(undefined);
      if (tool === "eraser") {
        finishErasing();
        return;
      }
      if (tool === "comment") {
        const press = commentPress.current;
        commentPress.current = undefined;
        if (press) {
          setDraft(commentAnchorAt(press));
          setOpenThread(undefined);
          setShowHidden(false);
          setTool("select");
        }
        return;
      }
      if (isPlaceTool(tool)) {
        if (placing) {
          placeNode(tool, placementRect(tool, placing.start, flowPoint(event)));
          setPlacing(undefined);
          setHover(undefined);
        }
        return;
      }
      const state = drawing.current;
      if (!state) return;
      drawing.current = undefined;
      const rest = state.segmenter.finish(state.committed > 0);
      if (rest) commitSegment(state, rest);
      myStrokes.current.push(state.stroke);
      setLocalStroke(undefined);
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
      targetFor,
      finishErasing,
      placeNode,
      placementRect,
      flowPoint,
      commitSegment,
      live,
    ],
  );

  // A cancelled pointer (a touch taken over by a gesture, say) drops a line
  // being drawn rather than finishing it; anything else ends as usual.
  const onPointerCancel = useCallback(
    (event: React.PointerEvent) => {
      if (!connecting) {
        onPointerUp(event);
        return;
      }
      setConnecting(undefined);
    },
    [connecting, onPointerUp],
  );

  const onPointerLeave = useCallback(() => {
    live.setCursor(null);
    setHover(undefined);
    lastPointer.current = undefined;
    setAttachPreview(undefined);
  }, [live]);

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
  // handle clicked (React Flow's click-to-connect).
  const clickConnectFrom = useRef<string | undefined>(undefined);
  const onClickConnectStart: OnConnectStart = useCallback(
    (_event, { nodeId }) => {
      clickConnectFrom.current = nodeId ?? undefined;
    },
    [],
  );
  const onClickConnectEnd: OnConnectEnd = useCallback(
    (event) => {
      const from = clickConnectFrom.current;
      clickConnectFrom.current = undefined;
      if (from) connectFromHandle(from, event);
    },
    [connectFromHandle],
  );

  const beginEndpointDrag = useCallback(
    (edgeId: string, end: "source" | "target", event: React.PointerEvent) => {
      if (readOnly) return;
      const line = flow.getEdge(edgeId);
      if (!line) return;
      wrapperRef.current?.setPointerCapture(event.pointerId);
      setConnecting({
        fixed: { node: end === "source" ? line.target : line.source },
        current: flowPoint(event),
        edgeId,
        end,
        pressedAt: { x: event.clientX, y: event.clientY },
      });
    },
    [readOnly, flow, flowPoint],
  );

  const actions: WhiteboardActions = useMemo(
    () => ({
      readOnly,
      updateNodes,
      updateEdge,
      persistResize,
      beginEndpointDrag,
      editOnAppear,
      clearEditOnAppear,
    }),
    [
      readOnly,
      updateNodes,
      updateEdge,
      persistResize,
      beginEndpointDrag,
      editOnAppear,
      clearEditOnAppear,
    ],
  );

  // Switching tools drops anything half-finished, and a drawing tool clears
  // the selection, whose resize handles and toolbars would otherwise get in
  // the way.
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
    setPlacing(undefined);
    setHover(undefined);
    setAttachPreview(undefined);
    commentPress.current = undefined;
    setConnecting(undefined);
    setErasingStrokes(new Set());
  }, [tool, setNodes, setEdges]);

  useEffect(() => {
    const isTyping = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space") spaceHeld.current = true;
      if (event.key === "Escape" && !isTyping(event.target)) {
        setDraft(undefined);
        setConnecting(undefined);
        setErasingStrokes(new Set());
        setTool("select");
        return;
      }
      // Enter on a focused sticky or text box starts editing it, as a
      // double-click does. Held back from the note's new editor, where it
      // would start a new line.
      const note = event.target;
      if (
        event.key === "Enter" &&
        !readOnly &&
        tool === "select" &&
        note instanceof HTMLElement &&
        note.matches(".react-flow__node-sticky, .react-flow__node-text") &&
        wrapperRef.current?.contains(note) &&
        note.dataset.id
      ) {
        event.preventDefault();
        setEditOnAppear(note.dataset.id);
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
  }, [readOnly, tool, flow, deleteNodes]);

  const toggleFeederArrows = useCallback(
    () => setShowFeederArrows((current) => !current),
    [setShowFeederArrows],
  );
  const toggleHidden = useCallback(() => {
    setShowHidden((current) => !current);
    closeComment();
  }, [closeComment]);
  const onPenWidth = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const width = WhiteboardStrokeWidths.find(
        (w) => w === event.target.value,
      );
      if (width) setPenWidth(width);
    },
    [setPenWidth],
  );
  const alignBy = useCallback(
    (mode: AlignMode) => arrange({ kind: "align", mode }),
    [arrange],
  );
  const distributeBy = useCallback(
    (axis: DistributeAxis) => arrange({ kind: "distribute", axis }),
    [arrange],
  );

  const drawingTool = tool !== "select";
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
  // Where a sticky, text box or frame would go.
  const placeAt = placing ?? (hover && { start: hover, current: hover });
  const placeGhost =
    isPlaceTool(tool) && placeAt
      ? placementRect(tool, placeAt.start, placeAt.current)
      : undefined;
  const showResolvedTitle = t(
    "whiteboard.toolbar.showResolved",
    "Show resolved comments",
  );
  // The toggles show a count beside their icon, so their names carry it too.
  const showResolvedLabel =
    resolvedCount > 0
      ? t(
          "whiteboard.toolbar.showResolvedCount",
          "Show resolved comments ({{count}})",
          { count: resolvedCount },
        )
      : showResolvedTitle;
  const penWidthNames: Record<WhiteboardStrokeWidth, string> = {
    thin: t("whiteboard.toolbar.penWidthThin", "Thin"),
    medium: t("whiteboard.toolbar.penWidthMedium", "Medium"),
    thick: t("whiteboard.toolbar.penWidthThick", "Thick"),
  };
  const feederArrowsTitle = t(
    "whiteboard.toolbar.feederArrows",
    "Show feeder arrows",
  );
  const hiddenPuzzlesTitle = t(
    "whiteboard.toolbar.hiddenPuzzles",
    "Puzzles not on the board",
  );
  const hiddenPuzzlesLabel =
    hiddenCards.length > 0
      ? t(
          "whiteboard.toolbar.hiddenPuzzlesCount",
          "Puzzles not on the board ({{count}})",
          { count: hiddenCards.length },
        )
      : hiddenPuzzlesTitle;
  const alignModes = [
    ["left", t("whiteboard.arrange.left", "Align left edges")],
    ["center", t("whiteboard.arrange.center", "Align centres horizontally")],
    ["right", t("whiteboard.arrange.right", "Align right edges")],
    ["top", t("whiteboard.arrange.top", "Align top edges")],
    ["middle", t("whiteboard.arrange.middle", "Align centres vertically")],
    ["bottom", t("whiteboard.arrange.bottom", "Align bottom edges")],
  ] as const;
  const distributeAxes = [
    [
      "horizontal",
      t("whiteboard.arrange.horizontal", "Space evenly left to right"),
    ],
    [
      "vertical",
      t("whiteboard.arrange.vertical", "Space evenly top to bottom"),
    ],
  ] as const;
  // React Flow's own control labels and screen reader text.
  const ariaLabelConfig = useMemo((): Partial<AriaLabelConfig> => {
    const directions: Record<string, string> = {
      up: t("whiteboard.a11y.up", "up"),
      down: t("whiteboard.a11y.down", "down"),
      left: t("whiteboard.a11y.left", "left"),
      right: t("whiteboard.a11y.right", "right"),
    };
    return {
      // React Flow shows this one while nodes can be moved with the arrow
      // keys, which here is always.
      "node.a11yDescription.keyboardDisabled": t(
        "whiteboard.a11y.nodeKeyboard",
        "Press enter or space to select a node. You can then use the arrow keys to move the node around. Press delete to remove it and escape to cancel.",
      ),
      "node.a11yDescription.ariaLiveMessage": ({ direction, x, y }) =>
        t(
          "whiteboard.a11y.nodeMoved",
          "Moved selected node {{direction}}. New position, x: {{x}}, y: {{y}}",
          { direction: directions[direction] ?? direction, x, y },
        ),
      "edge.a11yDescription.default": t(
        "whiteboard.a11y.edge",
        "Press enter or space to select an edge. You can then press delete to remove it or escape to cancel.",
      ),
      "controls.ariaLabel": t("whiteboard.controls.panel", "Control panel"),
      "controls.zoomIn.ariaLabel": t("whiteboard.controls.zoomIn", "Zoom in"),
      "controls.zoomOut.ariaLabel": t(
        "whiteboard.controls.zoomOut",
        "Zoom out",
      ),
      "controls.fitView.ariaLabel": t(
        "whiteboard.controls.fitView",
        "Fit view",
      ),
      "minimap.ariaLabel": t("whiteboard.controls.minimap", "Mini map"),
    };
  }, [t]);

  return (
    <WhiteboardContext value={actions}>
      <PeopleContext value={people}>
        <CanvasWrapper
          ref={wrapperRef}
          $tool={readOnly ? "select" : tool}
          $readOnly={readOnly}
          onPointerDownCapture={onPointerDownCapture}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onPointerLeave={onPointerLeave}
        >
          <ReactFlow<WhiteboardFlowNode, WhiteboardFlowEdge>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onBeforeDelete={onBeforeDelete}
            onConnectEnd={onConnectEnd}
            onClickConnectStart={onClickConnectStart}
            onClickConnectEnd={onClickConnectEnd}
            onNodeDragStart={onNodeDragStart}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={onNodeDragStop}
            onMove={onMove}
            onMoveEnd={onMoveEnd}
            connectionMode={ConnectionMode.Loose}
            // onConnectEnd decides where a line from a handle ends, so the
            // line being dragged shouldn't snap to a nearby handle either.
            connectionRadius={0}
            colorMode={theme.basicMode === "dark" ? "dark" : "light"}
            defaultViewport={initialViewport}
            fitView={!initialViewport}
            minZoom={0.1}
            maxZoom={2}
            nodesDraggable={!readOnly && !drawingTool}
            nodesConnectable={!readOnly && !drawingTool}
            elementsSelectable={!readOnly && !drawingTool}
            panOnDrag={!drawingTool}
            selectionOnDrag={false}
            deleteKeyCode={readOnly ? null : ["Backspace", "Delete"]}
            onlyRenderVisibleElements
            ariaLabelConfig={ariaLabelConfig}
          >
            <Background />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable nodeColor={miniMapNodeColor} />
            <FrameLabelLayer />
            <CursorLayer boardId={boardId} liveEnabled={liveEnabled} />
            <CommentLayer
              pins={commentPins}
              openId={openThreadId ?? (draft ? "draft" : undefined)}
              pulseId={pulse}
              onOpen={openComment}
            />
            {localStroke && localStroke.points.length > 0 && (
              <ViewportPortal>
                <LocalStroke>
                  <path
                    d={inkPath(
                      localStroke.points,
                      localStroke.strokeWidth,
                      false,
                    )}
                    fill={colors.stroke[localStroke.color] ?? theme.colors.text}
                  />
                </LocalStroke>
              </ViewportPortal>
            )}
            {lineFrom && lineTo && (
              <ViewportPortal>
                <LocalStroke>
                  {lineOrigin && (
                    <AttachOutline key={lineOrigin} id={lineOrigin} />
                  )}
                  {lineAttached && lineAttached !== lineOrigin && (
                    <AttachOutline key={lineAttached} id={lineAttached} />
                  )}
                  <line
                    x1={lineFrom.x}
                    y1={lineFrom.y}
                    x2={lineTo.x}
                    y2={lineTo.y}
                    stroke={theme.colors.primary}
                    strokeWidth={2}
                    strokeDasharray="6 4"
                  />
                  <circle
                    cx={lineTo.x}
                    cy={lineTo.y}
                    r={4}
                    fill={theme.colors.primary}
                  />
                </LocalStroke>
              </ViewportPortal>
            )}
            {!connecting && attachPreview && (
              <ViewportPortal>
                <LocalStroke>
                  <AttachOutline id={attachPreview} />
                </LocalStroke>
              </ViewportPortal>
            )}
            {isPlaceTool(tool) && placeGhost && (
              <ViewportPortal>
                <PlaceGhost
                  $tool={tool}
                  style={{
                    transform: `translate(${placeGhost.x}px, ${placeGhost.y}px)`,
                    width: placeGhost.width,
                    height: placeGhost.height,
                  }}
                />
              </ViewportPortal>
            )}
            {readOnly ? (
              <Panel position="top-left">
                <ToolBox>
                  <ReadOnlyNote>
                    {t("whiteboard.toolbar.viewingOnly", "Viewing only")}
                  </ReadOnlyNote>
                  {resolvedCount > 0 && (
                    <Button
                      size="sm"
                      variant={showResolved ? "secondary" : "outline-secondary"}
                      onClick={toggleShowResolved}
                      title={showResolvedTitle}
                      aria-label={showResolvedLabel}
                      aria-pressed={showResolved}
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
                    <ToolButton
                      tool="select"
                      active={tool === "select"}
                      onSelect={setTool}
                      title={t(
                        "whiteboard.toolbar.select",
                        "Select and move (Shift-drag to select an area, Ctrl/⌘-click to add)",
                      )}
                    >
                      <FontAwesomeIcon icon={faArrowPointer} />
                    </ToolButton>
                    <ToolButton
                      tool="pen"
                      active={tool === "pen"}
                      onSelect={setTool}
                      title={t(
                        "whiteboard.toolbar.pen",
                        "Draw (hold Space to pan)",
                      )}
                    >
                      <FontAwesomeIcon icon={faPen} />
                    </ToolButton>
                    <ToolButton
                      tool="eraser"
                      active={tool === "eraser"}
                      onSelect={setTool}
                      title={t("whiteboard.toolbar.eraser", "Erase strokes")}
                    >
                      <FontAwesomeIcon icon={faEraser} />
                    </ToolButton>
                    <ToolButton
                      tool="connector"
                      active={tool === "connector"}
                      onSelect={setTool}
                      title={t(
                        "whiteboard.toolbar.line",
                        "Line: drag between two things to connect them, or anywhere for a free line (Shift snaps the angle)",
                      )}
                    >
                      <LineStyleIcon kind="end" />
                    </ToolButton>
                  </ButtonGroup>
                  {tool === "connector" && (
                    <LineStyleControls
                      value={lineStyle}
                      onChange={updateLineStyle}
                    />
                  )}
                  {tool === "pen" && (
                    <>
                      <ColorPicker
                        value={penColor}
                        palette={colors.stroke}
                        onChange={setPenColor}
                        fallback={theme.colors.text}
                      />
                      <PenWidthSelect
                        size="sm"
                        value={penWidth}
                        onChange={onPenWidth}
                        aria-label={t(
                          "whiteboard.toolbar.penWidth",
                          "Pen width",
                        )}
                      >
                        {WhiteboardStrokeWidths.map((w) => (
                          <option key={w} value={w}>
                            {penWidthNames[w]}
                          </option>
                        ))}
                      </PenWidthSelect>
                    </>
                  )}
                  <ButtonGroup size="sm">
                    <ToolButton
                      tool="sticky"
                      active={tool === "sticky"}
                      onSelect={setTool}
                      title={t(
                        "whiteboard.toolbar.sticky",
                        "Sticky note: click to place, or drag to size",
                      )}
                    >
                      <FontAwesomeIcon icon={faNoteSticky} />
                    </ToolButton>
                    <ToolButton
                      tool="text"
                      active={tool === "text"}
                      onSelect={setTool}
                      title={t(
                        "whiteboard.toolbar.text",
                        "Text: click to place, or drag to size",
                      )}
                    >
                      <FontAwesomeIcon icon={faFont} />
                    </ToolButton>
                    <ToolButton
                      tool="frame"
                      active={tool === "frame"}
                      onSelect={setTool}
                      title={t(
                        "whiteboard.toolbar.frame",
                        "Frame: click to place, or drag to size",
                      )}
                    >
                      <FontAwesomeIcon icon={faObjectGroup} />
                    </ToolButton>
                  </ButtonGroup>
                  <ButtonGroup size="sm">
                    <ToolButton
                      tool="comment"
                      active={tool === "comment"}
                      onSelect={setTool}
                      title={t(
                        "whiteboard.toolbar.comment",
                        "Comment: click on something to start a thread about it",
                      )}
                    >
                      <FontAwesomeIcon icon={faComment} />
                    </ToolButton>
                    <Button
                      variant={showResolved ? "secondary" : "outline-secondary"}
                      onClick={toggleShowResolved}
                      title={showResolvedTitle}
                      aria-label={showResolvedLabel}
                      aria-pressed={showResolved}
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
                      title={feederArrowsTitle}
                      aria-label={feederArrowsTitle}
                      aria-pressed={showFeederArrows}
                    >
                      <FontAwesomeIcon icon={faDiagramProject} />
                    </Button>
                    <Button
                      variant={showHidden ? "secondary" : "outline-secondary"}
                      onClick={toggleHidden}
                      title={hiddenPuzzlesTitle}
                      aria-label={hiddenPuzzlesLabel}
                      aria-pressed={showHidden}
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
                    value={selectedLineStyle}
                    onChange={restyleLines}
                  />
                </ToolBox>
              </Panel>
            )}
            {!readOnly && tool === "select" && selectedUnitCount >= 2 && (
              <Panel position="top-center">
                <ToolBox>
                  <ButtonGroup
                    size="sm"
                    aria-label={t("whiteboard.arrange.align", "Align")}
                  >
                    {alignModes.map(([mode, title]) => (
                      <ArrangeButton
                        key={mode}
                        kind={mode}
                        title={title}
                        label={title}
                        onArrange={alignBy}
                      />
                    ))}
                  </ButtonGroup>
                  <ButtonGroup
                    size="sm"
                    aria-label={t(
                      "whiteboard.arrange.distribute",
                      "Distribute",
                    )}
                  >
                    {distributeAxes.map(([axis, title]) => (
                      <ArrangeButton
                        key={axis}
                        kind={axis}
                        title={
                          selectedUnitCount < 3
                            ? t(
                                "whiteboard.arrange.needThree",
                                "{{action}} (select three or more)",
                                {
                                  action: title,
                                  // React escapes attributes, so i18next's
                                  // escaping would only show entities. Goes
                                  // once both i18n inits stop escaping.
                                  interpolation: { escapeValue: false },
                                },
                              )
                            : title
                        }
                        label={title}
                        disabled={selectedUnitCount < 3}
                        onArrange={distributeBy}
                      />
                    ))}
                  </ButtonGroup>
                </ToolBox>
              </Panel>
            )}
            {(draft ?? openThreadData) && (
              <Panel position="top-right">
                <CommentPanel
                  key={
                    draft
                      ? `draft:${draft.node ?? ""}:${draft.x}:${draft.y}`
                      : (openThreadId ?? "")
                  }
                  huntId={huntId}
                  puzzleId={puzzleId}
                  thread={openThreadData}
                  draft={draft}
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
                  <strong>
                    {t("whiteboard.hidden.title", "Not on the board")}
                  </strong>
                  {hiddenCards.length === 0 && (
                    <div>
                      {t(
                        "whiteboard.hidden.none",
                        "Every puzzle is on the board.",
                      )}
                    </div>
                  )}
                  {hiddenCards.map((card) => (
                    <MissingCardRow
                      key={card.puzzle}
                      card={card}
                      onPutBack={putBack}
                    />
                  ))}
                </SidePanel>
              </Panel>
            )}
          </ReactFlow>
        </CanvasWrapper>
      </PeopleContext>
    </WhiteboardContext>
  );
};

const WhiteboardCanvas = (props: CanvasProps) => (
  <ReactFlowProvider>
    <CanvasInner {...props} />
  </ReactFlowProvider>
);

export default React.memo(WhiteboardCanvas);
