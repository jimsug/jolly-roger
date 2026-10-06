import { Meteor } from "meteor/meteor";
import { Random } from "meteor/random";
import { useTracker } from "meteor/react-meteor-data";
import { faArrowPointer } from "@fortawesome/free-solid-svg-icons/faArrowPointer";
import { faCircleCheck } from "@fortawesome/free-solid-svg-icons/faCircleCheck";
import { faClockRotateLeft } from "@fortawesome/free-solid-svg-icons/faClockRotateLeft";
import { faClone } from "@fortawesome/free-solid-svg-icons/faClone";
import { faComments } from "@fortawesome/free-solid-svg-icons/faComments";
import { faCompress } from "@fortawesome/free-solid-svg-icons/faCompress";
import { faCopy } from "@fortawesome/free-solid-svg-icons/faCopy";
import { faDiagramProject } from "@fortawesome/free-solid-svg-icons/faDiagramProject";
import { faEraser } from "@fortawesome/free-solid-svg-icons/faEraser";
import { faEyeSlash } from "@fortawesome/free-solid-svg-icons/faEyeSlash";
import { faFont } from "@fortawesome/free-solid-svg-icons/faFont";
import { faHighlighter } from "@fortawesome/free-solid-svg-icons/faHighlighter";
import { faImage } from "@fortawesome/free-solid-svg-icons/faImage";
import { faLink } from "@fortawesome/free-solid-svg-icons/faLink";
import { faLock } from "@fortawesome/free-solid-svg-icons/faLock";
import { faLockOpen } from "@fortawesome/free-solid-svg-icons/faLockOpen";
import { faNoteSticky } from "@fortawesome/free-solid-svg-icons/faNoteSticky";
import { faObjectGroup } from "@fortawesome/free-solid-svg-icons/faObjectGroup";
import { faPaste } from "@fortawesome/free-solid-svg-icons/faPaste";
import { faPen } from "@fortawesome/free-solid-svg-icons/faPen";
import { faRotateLeft } from "@fortawesome/free-solid-svg-icons/faRotateLeft";
import { faRotateRight } from "@fortawesome/free-solid-svg-icons/faRotateRight";
import { faShapes } from "@fortawesome/free-solid-svg-icons/faShapes";
import { faSignature } from "@fortawesome/free-solid-svg-icons/faSignature";
import { faSitemap } from "@fortawesome/free-solid-svg-icons/faSitemap";
import { faTrashCan } from "@fortawesome/free-solid-svg-icons/faTrashCan";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type {
  AriaLabelConfig,
  EdgeChange,
  NodeChange,
  NodeMouseHandler,
  OnBeforeDelete,
  OnConnectEnd,
  OnConnectStart,
  OnMove,
  OnMoveEnd,
  OnMoveStart,
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
  NodeToolbar,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
  useStoreApi,
  ViewportPortal,
} from "@xyflow/react";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import Modal from "react-bootstrap/Modal";
import Spinner from "react-bootstrap/Spinner";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { useTheme } from "styled-components";
import Flags from "../../../Flags";
import type { ChatMessageCommentAnchorType } from "../../../lib/models/ChatMessages";
import Hunts from "../../../lib/models/Hunts";
import Puzzles from "../../../lib/models/Puzzles";
import Tags from "../../../lib/models/Tags";
import WhiteboardEdges from "../../../lib/models/WhiteboardEdges";
import type {
  WhiteboardColor,
  WhiteboardShape,
  WhiteboardStrokeWidth,
} from "../../../lib/models/WhiteboardNodes";
import WhiteboardNodes, {
  WhiteboardShapes,
  WhiteboardStrokeWidths,
} from "../../../lib/models/WhiteboardNodes";
import type { WhiteboardEditPolicy } from "../../../lib/models/Whiteboards";
import type { WhiteboardVersionType } from "../../../lib/models/WhiteboardVersions";
import type {
  WhiteboardAccess,
  WhiteboardAccessReason,
} from "../../../lib/permission_stubs";
import whiteboardPresence from "../../../lib/publications/whiteboardPresence";
import type { Solvedness } from "../../../lib/solvedness";
import { computeSolvedness } from "../../../lib/solvedness";
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
import { collapsedAncestors } from "../../../lib/whiteboard/collapse";
import {
  commentPosition,
  isUnread,
  nextUnread,
  threadList,
} from "../../../lib/whiteboard/comments";
import type { AttachHit } from "../../../lib/whiteboard/connectors";
import {
  attachHit,
  centerOf,
  compareAttachHits,
  contains,
  snapAngle,
} from "../../../lib/whiteboard/connectors";
import { exportFileName } from "../../../lib/whiteboard/exportFiles";
import { feederFocus } from "../../../lib/whiteboard/feederFocus";
import type {
  Box,
  BoxChange,
  FrameAround,
} from "../../../lib/whiteboard/frameTools";
import {
  fitFrame,
  growFrameFor,
  tidyFrame,
} from "../../../lib/whiteboard/frameTools";
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
import { POINT_SIZE, roundMetas } from "../../../lib/whiteboard/layout";
import {
  MAX_BATCH,
  MAX_FRAME_DEPTH,
  MAX_LIVE_DRAG_NODES,
  MAX_LIVE_SELECTION,
} from "../../../lib/whiteboard/limits";
import type { LineStyle } from "../../../lib/whiteboard/lineStyle";
import type { BoardTarget } from "../../../lib/whiteboard/links";
import {
  boardLinkQuery,
  boardTargetKey,
  MAX_ZOOM,
  MIN_ZOOM,
} from "../../../lib/whiteboard/links";
import { miniMapColor } from "../../../lib/whiteboard/minimap";
import { finishedFrames } from "../../../lib/whiteboard/rounds";
import type { BoardSearchHit } from "../../../lib/whiteboard/search";
import {
  pickToRestore,
  restoreItemSet,
  versionDifferences,
} from "../../../lib/whiteboard/versions";
import deleteWhiteboardNodes from "../../../methods/deleteWhiteboardNodes";
import restoreWhiteboardItems from "../../../methods/restoreWhiteboardItems";
import restoreWhiteboardVersion from "../../../methods/restoreWhiteboardVersion";
import type { WhiteboardEdgeInput } from "../../../methods/upsertWhiteboardEdges";
import type { WhiteboardNodeInput } from "../../../methods/upsertWhiteboardNodes";
import {
  useWhiteboardFeederArrows,
  useWhiteboardLineStyle,
  useWhiteboardPenColor,
  useWhiteboardPenWidth,
  useWhiteboardShapeKind,
  useWhiteboardShowResolvedComments,
  useWhiteboardViewport,
} from "../../hooks/persisted-state";
import useBoardClipboard from "../../hooks/useBoardClipboard";
import useBoardFocus from "../../hooks/useBoardFocus";
import useBoardNavigation from "../../hooks/useBoardNavigation";
import useBoardNotices, { unannounced } from "../../hooks/useBoardNotices";
import useImageTool from "../../hooks/useImageTool";
import useLinkedTarget from "../../hooks/useLinkedTarget";
import useNotOnBoard from "../../hooks/useNotOnBoard";
import usePlaceTool from "../../hooks/usePlaceTool";
import useRemoteDrags from "../../hooks/useRemoteDrags";
import useRoundStates from "../../hooks/useRoundStates";
import useTypedSubscribe from "../../hooks/useTypedSubscribe";
import useWhiteboardComments, {
  useSeenComments,
} from "../../hooks/useWhiteboardComments";
import useWhiteboardLive from "../../hooks/useWhiteboardLive";
import useWhiteboardOthersEditing from "../../hooks/useWhiteboardOthersEditing";
import type {
  LineLabels,
  RemoteDrag,
  WhiteboardFlowEdge,
  WhiteboardFlowNode,
} from "../../hooks/useWhiteboardSync";
import useWhiteboardSync, {
  keepSelectedShapeDown,
  selectionUnits,
} from "../../hooks/useWhiteboardSync";
import useWhiteboardUndo from "../../hooks/useWhiteboardUndo";
import CopyToClipboardButton from "../CopyToClipboardButton";
import ArrangeToolbar from "./ArrangeToolbar";
import BoardNotices from "./BoardNotices";
import BoardSearch from "./BoardSearch";
import {
  BoardChangedError,
  boardPng,
  fetchBoardJson,
  saveBlob,
} from "./boardFiles";
import type { BoardWrite, CommitOptions, Done } from "./boardWrites";
import { sendAtOnce } from "./boardWrites";
import ChatLoadedContext from "./ChatLoadedContext";
import type { CollapseActions, FoldSummary } from "./CollapseContext";
import CollapseContext from "./CollapseContext";
import ColorPicker from "./ColorPicker";
import type { CommentPin } from "./CommentLayer";
import CommentLayer from "./CommentLayer";
import CommentList from "./CommentList";
import CommentPanel from "./CommentPanel";
import CursorLayer from "./CursorLayer";
import {
  AttachOutline,
  CanvasWrapper,
  CHANGED_CLASS,
  CommentHint,
  CommentPanelPlace,
  CommentToolButton,
  dragOnlySelected,
  inDialog,
  isTyping,
  KeyboardCatcher,
  LocalStroke,
  NO_ESCAPE,
  OutlineButton,
  PlaceGhost,
  PreviewBanner,
  PreviewItemBox,
  PuzzlePeopleProvider,
  ReadOnlyButtons,
  ReadOnlyNote,
  ReadOnlyReason,
  SidePanel,
  ToolBox,
  ToolButton,
  ToolSelect,
  UnreadBadge,
  UploadPlaceholder,
} from "./canvasChrome";
import colors from "./colors";
import type { DownloadKind } from "./DownloadButton";
import DownloadButton from "./DownloadButton";
import describeCommentTarget from "./describeCommentTarget";
import EditPolicyModal, { EditPolicyButton } from "./EditPolicyModal";
import FeederFocusContext from "./FeederFocusContext";
import FrameLabelLayer from "./FrameLabelLayer";
import FrameNode from "./FrameNode";
import frameToolBox from "./frameToolBox";
import type { VersionPreview } from "./HistoryPanel";
import HistoryPanel, { loadVersion, versionMoment } from "./HistoryPanel";
import ImageNode from "./ImageNode";
import InkNode from "./InkNode";
import KeepAboveKeyboard from "./KeepAboveKeyboard";
import LineStyleControls, { DEFAULT_LINE_STYLE } from "./LineStyleControls";
import LineStyleIcon from "./LineStyleIcon";
import LockLayoutButtons from "./LockLayoutButtons";
import { strokeOpacity } from "./marker";
import { MIN_SIZES } from "./NodeChrome";
import NodePulse from "./NodePulse";
import NotOnBoardPanel from "./NotOnBoardPanel";
import OutlinePanel from "./OutlinePanel";
import PointNode from "./PointNode";
import PuzzleCardNode from "./PuzzleCardNode";
import RemoteEditingContext from "./RemoteEditingContext";
import RemoteSelectionLayer from "./RemoteSelectionLayer";
import ResetLayoutModal, { ResetLayoutButton } from "./ResetLayoutModal";
import RoundStateContext from "./RoundStateContext";
import ShapeNode from "./ShapeNode";
import StickyNode from "./StickyNode";
import TextNode from "./TextNode";
import TouchTargetSize from "./TouchTargetSize";
import type { Tool } from "./tools";
import { isPlaceTool, PEN_WIDTH_KEYS, TOOLS_BY_KEY } from "./tools";
import { CLICK_SLOP, LongPress, movedPastSlop, TOUCH_SLOP } from "./touch";
import type { WhiteboardActions } from "./WhiteboardContext";
import WhiteboardContext from "./WhiteboardContext";
import WhiteboardEdge from "./WhiteboardEdge";
import type { ViewportMoves } from "./WhosHere";
import WhosHere, { ViewSender } from "./WhosHere";

const nodeTypes = {
  puzzle: PuzzleCardNode,
  frame: FrameNode,
  sticky: StickyNode,
  text: TextNode,
  ink: InkNode,
  point: PointNode,
  image: ImageNode,
  shape: ShapeNode,
};
const edgeTypes = { whiteboard: WhiteboardEdge };

// The panel at the top right, under any open thread: what isn't on the
// board, the list of comments, History or the Outline. Only one shows at a
// time.
type SidePanelKind = "hidden" | "comments" | "history" | "outline";

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

// A press with the Comment tool, or a finger with a sticky, text, frame or
// shape tool, which places one if it's let go without moving. A touch press
// leaves the board free to pan and pinch.
interface TapPress {
  point: XYPosition;
  clientX: number;
  clientY: number;
  pointerId: number;
  pointerType: string;
}

// Where nodes are being moved to, each in its frame (if any).
type NodeMoves = Map<string, { position: XYPosition; parent?: string }>;

// A node that has just been dropped, nudged or aligned, where it now is.
interface Landed {
  id: string;
  parent: string | undefined;
  position: XYPosition;
}

// One input per node, later fields winning.
function mergeInputs(inputs: WhiteboardNodeInput[]): WhiteboardNodeInput[] {
  const byId = new Map<string, WhiteboardNodeInput>();
  inputs.forEach((input) => {
    byId.set(input._id, { ...byId.get(input._id), ...input });
  });
  return [...byId.values()];
}

// The parts of the canvas that sit over the board, where presses are the
// controls' own rather than a tool's.
const OVERLAYS =
  ".react-flow__panel, .react-flow__controls, .react-flow__minimap, .react-flow__node-toolbar, .jr-comment-pin, .jr-whos-here";
// How close (in screen pixels) a line end has to be to something to attach to
// it: just outside its edge, or either side of a frame's border.
const ATTACH_MARGIN = 8;
const FRAME_ATTACH_MARGIN = 12;

// Frames on the mini map take their colour's strong version, which still
// shows when faded. Black's strong version is the theme's text colour, which
// isn't a fixed value, so black frames take their fill.
const MINI_MAP_FRAMES = {
  ...colors.stroke,
  black: colors.fill.black,
};

interface Drawing {
  stroke: string;
  color: WhiteboardColor;
  strokeWidth: WhiteboardStrokeWidth;
  segmenter: InkSegmenter;
  committed: number;
  parent?: string;
}

// The stroke being drawn, as it's shown until it's saved.
const strokeSoFar = (state: Drawing) => ({
  color: state.color,
  strokeWidth: state.strokeWidth,
  points: [...state.segmenter.points],
});

const NO_REMOTE_DRAGS = new Map<string, RemoteDrag>();
const NO_PINS: CommentPin[] = [];
const NO_CHANGES: ReadonlySet<string> = new Set();
const NO_FLOW_NODES: WhiteboardFlowNode[] = [];
const NO_SOLVEDNESS = new Map<string, Solvedness>();

// A set with ids added or taken away, or the same set if that changes
// nothing, so state built on it doesn't change for nothing.
function withIds(current: Set<string>, ids: string[], present: boolean) {
  if (ids.every((id) => current.has(id) === present)) return current;
  const next = new Set(current);
  ids.forEach((id) => (present ? next.add(id) : next.delete(id)));
  return next;
}

// Ids kept as one array between renders while they're the same, so state
// built on them doesn't change for nothing: a drag makes new node objects
// every frame.
function useStableIds(ids: string[]): string[] {
  const key = ids.join(" ");
  return useMemo(() => (key ? key.split(" ") : []), [key]);
}

// A value shown for `ms`, then dropped. Showing another restarts the clock,
// and unmounting stops it.
function useTimedValue<T>(ms: number): [T | undefined, (value: T) => void] {
  const [value, setValue] = useState<T>();
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback(
    (next: T) => {
      setValue(next);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setValue(undefined), ms);
    },
    [ms],
  );
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return [value, show];
}

// How far below the middle of the screen (as a share of the board's height)
// the board centres on a pin on a phone, so the pin sits above the comment
// sheet.
const SHEET_OFFSET = 0.3;
// How long a pin or node pulses after the board pans to it.
const PULSE_MS = 2200;

// The most frames a picture of the board waits for the nodes that were out
// of view to be drawn and measured, before it's taken anyway.
const EXPORT_WAIT_FRAMES = 120;
const nextFrame = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });

interface CanvasProps {
  boardId: string;
  huntId: string;
  // The board's backing puzzle, whose chat holds the comments.
  puzzleId: string;
  // What the viewer may do on the board (see whiteboardAccess), and why it
  // isn't more.
  access: WhiteboardAccess;
  accessReason: WhiteboardAccessReason | undefined;
  // Whether to offer the who-can-edit dialog, and what the board is set to.
  mayChangeEditPolicy: boolean;
  editPolicy: WhiteboardEditPolicy;
  editors: string[];
  // An operator (or admin), who can unlock anyone's lock and lock or unlock
  // every frame at once.
  isOperator: boolean;
  // Off on a phone, where it would cover half the board.
  showMiniMap: boolean;
  // A phone-sized screen (see WhiteboardPage): bigger targets, a tap places
  // a comment without stopping the board panning, and threads open in a
  // sheet along the bottom.
  compact: boolean;
  // A touch screen that isn't compact (see WhiteboardPage): the toolbar
  // gains buttons for what's otherwise done with keys, and Select area.
  coarse: boolean;
  // Whether the board's nodes and lines have arrived.
  boardLoaded: boolean;
  // Whether this viewer has hidden ink, which WhiteboardPage then has sent
  // as outlines without points.
  hideInk: boolean;
  onHideInkChange: (hideInk: boolean) => void;
  // Set to the canvas's way of showing a comment, for the board's chat.
  focusRef: React.RefObject<((threadId: string) => void) | undefined>;
  // A comment to show once the board has loaded (from a ?comment= link).
  initialComment?: string;
  onInitialCommentShown?: () => void;
  // A card, node or view to show once the board has loaded (from a ?puzzle=,
  // ?node= or ?v= link).
  initialTarget?: BoardTarget;
  onInitialTargetShown?: () => void;
}

const CanvasInner = ({
  boardId,
  huntId,
  puzzleId,
  access,
  accessReason,
  mayChangeEditPolicy,
  editPolicy,
  editors,
  isOperator,
  showMiniMap,
  compact,
  coarse,
  boardLoaded,
  hideInk,
  onHideInkChange: setHideInk,
  focusRef,
  initialComment,
  onInitialCommentShown,
  initialTarget,
  onInitialTargetShown,
}: CanvasProps) => {
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const flow = useReactFlow<WhiteboardFlowNode, WhiteboardFlowEdge>();
  const storeApi = useStoreApi<WhiteboardFlowNode, WhiteboardFlowEdge>();
  const wrapperRef = useRef<HTMLDivElement>(null);
  // An earlier version of the board being looked at, which can't be edited
  // or commented on.
  const [preview, setPreview] = useState<VersionPreview>();
  // A version is previewed without its ink while this viewer hides ink, as
  // the board is.
  const shownPreview = useMemo(
    () =>
      preview && hideInk
        ? { ...preview, nodes: preview.nodes.filter((n) => n.type !== "ink") }
        : preview,
    [preview, hideInk],
  );
  // The version being fetched to preview. Picking another, or going back to
  // now, drops it.
  const [previewLoading, setPreviewLoading] = useState<string>();
  const previewRequest = useRef(0);
  const backToNow = useCallback(() => {
    previewRequest.current += 1;
    setPreviewLoading(undefined);
    setPreview(undefined);
  }, []);
  // Restoring the version being previewed asks first. The confirmation
  // stays up until the server answers, and shows why if it refuses.
  const [confirmingRestore, setConfirmingRestore] = useState(false);
  const mayComment = access === "edit" || access === "comment";
  const readOnly = access !== "edit" || !!preview;
  const canComment = !preview && mayComment;

  // The hunt's puzzles and tags come from the puzzle page around the canvas,
  // which only shows it once they've loaded (puzzleForPuzzlePage), and the
  // board's nodes and lines from the whiteboard page. Who is on each puzzle
  // comes from PuzzlePeopleProvider.
  const rounds = useRoundStates(boardId, huntId);

  const liveEnabled = useTracker(
    () => !Flags.active("disable.whiteboard_live"),
    [],
  );
  useTypedSubscribe(liveEnabled ? whiteboardPresence : undefined, {
    boardId,
  });
  // Commenters send their cursor too; the server keeps only an editor's
  // drags and strokes.
  const live = useWhiteboardLive(boardId, liveEnabled && mayComment);
  // Someone looking at an earlier version isn't pointing at anything on the
  // board as it is, so their cursor comes off it until they're back.
  useEffect(() => {
    if (preview) live.setCursor(null);
  }, [preview, live]);
  // Who else is typing in what, so this viewer doesn't start typing there
  // too.
  const othersEditing = useWhiteboardOthersEditing(
    boardId,
    liveEnabled && !preview,
  );

  const { remoteDrags, isDraggedByOthers } = useRemoteDrags(
    boardId,
    liveEnabled,
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
  // Each puzzle's solvedness, for colouring its card on the mini map.
  const solvedness = useTracker(
    () =>
      showMiniMap
        ? new Map<string, Solvedness>(
            Puzzles.find(
              { hunt: huntId, kind: { $ne: "whiteboard" } },
              {
                projection: {
                  answers: 1,
                  expectedAnswerCount: 1,
                  completedWithNoAnswer: 1,
                },
              },
            ).map((p) => [p._id, computeSolvedness(p)]),
          )
        : undefined,
    [huntId, showMiniMap],
  );
  const miniMapNodeColor = useCallback(
    (node: WhiteboardFlowNode) =>
      miniMapColor(
        node.data.doc,
        {
          solvedness: theme.colors.miniMapSolvedness,
          frames: MINI_MAP_FRAMES,
        },
        (id) => solvedness?.get(id),
      ),
    [solvedness, theme],
  );

  // Each viewer's own pan and zoom for the board, and their tool settings.
  const [savedViewport, setSavedViewport] = useWhiteboardViewport(boardId);
  // Only the viewport the board opened at counts; it's fitted to the board
  // when there's none, unless a link says where to look.
  const [initialViewport] = useState(savedViewport);
  const [openedAt] = useState(boardTargetKey(initialTarget));
  // With no saved view and no link to follow, React Flow fits the board to
  // the first nodes it's given. Ink comes on its own subscription, often
  // after the cards, so the board is given no nodes until everything,
  // ink included, has arrived once.
  const fitsOnOpen = !initialViewport && !openedAt;
  const [loadedOnce, setLoadedOnce] = useState(boardLoaded);
  if (boardLoaded && !loadedOnce) {
    setLoadedOnce(true);
  }
  const [showFeederArrows, setShowFeederArrows] = useWhiteboardFeederArrows();
  const [tool, setTool] = useState<Tool>("select");
  const inkTool = tool === "pen" || tool === "eraser";
  // Hiding ink, here or in another window, puts the pen or the eraser down.
  if (hideInk && inkTool) {
    setTool("select");
  }
  // Picking up the pen or the eraser shows hidden ink again.
  const pickTool = useCallback(
    (next: Tool) => {
      setTool(next);
      if ((next === "pen" || next === "eraser") && hideInk) setHideInk(false);
    },
    [hideInk, setHideInk],
  );
  // A board that becomes read-only (say, the hunt is archived) puts any
  // drawing tool down, and the Comment tool too once commenting goes.
  if (readOnly && tool !== "select" && !(tool === "comment" && canComment)) {
    setTool("select");
  }
  const mayEdit = access === "edit";
  const [editingPolicy, setEditingPolicy] = useState(false);
  const openEditPolicy = useCallback(() => setEditingPolicy(true), []);
  const closeEditPolicy = useCallback(() => setEditingPolicy(false), []);
  const [penColor, setPenColor] = useWhiteboardPenColor();
  const [penWidth, setPenWidth] = useWhiteboardPenWidth();
  const [shapeKind, setShapeKind] = useWhiteboardShapeKind();
  const [sidePanel, setSidePanel] = useState<SidePanelKind>();
  // Closes a panel, if it's the one open.
  const closePanel = useCallback(
    (panel: SidePanelKind) =>
      setSidePanel((current) => (current === panel ? undefined : current)),
    [],
  );
  const [showResolved, setShowResolved] = useWhiteboardShowResolvedComments();
  const [openThread, setOpenThread] = useState<string>();
  const [draft, setDraft] = useState<ChatMessageCommentAnchorType>();
  // A pin, and a node or a point, marked for a moment after the board pans
  // to them.
  const [pulse, pulseComment] = useTimedValue<string>(PULSE_MS);
  const [nodePulse, pulseAt] = useTimedValue<{
    node?: string;
    point?: XYPosition;
  }>(PULSE_MS);
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
  // Where a press with the Comment tool (or a finger with a placing tool)
  // started, until it's let go there.
  const tapPress = useRef<TapPress | undefined>(undefined);
  // Set when a tap places a comment or a note, or a long press selects
  // something, until the next press, so the click the browser makes from
  // the tap afterwards doesn't also follow a link, take focus from what was
  // just opened, or select only what's under it.
  const tapped = useRef(false);
  // Fingers on the board and where each last was on screen.
  const touches = useRef(new Map<number, { x: number; y: number }>());
  // Two fingers panning and zooming the board while the tool in use takes
  // one finger for itself (see fingerPans), from where they started.
  const pinch = useRef<
    | {
        ids: [number, number];
        viewport: { x: number; y: number; zoom: number };
        mid: { x: number; y: number };
        distance: number;
      }
    | undefined
  >(undefined);
  // Fingers that have been part of a pinch, which do nothing more until
  // they're lifted.
  const spentTouches = useRef(new Set<number>());
  // A finger held on a node, which selects it after a while.
  const longPress = useRef(new LongPress());
  useEffect(() => {
    const pending = longPress.current;
    return () => pending.cancel();
  }, []);
  // On a touch screen, whether one finger on the empty board draws a box to
  // select what's in it rather than panning.
  const [selectArea, setSelectArea] = useState(false);
  const selectingArea = selectArea && coarse && !readOnly && tool === "select";
  // Whether one finger on the empty board pans it, which React Flow does.
  // The pen, the eraser, the line tool and Select area take a finger for
  // themselves, and two fingers pan and zoom (see startPinch). With a tool
  // that places something by tap, a finger that moves pans instead.
  const fingerPans =
    tool === "select"
      ? !selectingArea
      : (compact || coarse) && (tool === "comment" || isPlaceTool(tool));
  // The node a click-to-connect line starts from, and where the pointer is
  // while it waits for the next click.
  const clickConnectFrom = useRef<string | undefined>(undefined);
  const [clickConnectPointer, setClickConnectPointer] = useState<XYPosition>();
  // A comment just sent, to open once it comes back from the server.
  const sentDraft = useRef<
    { anchor: ChatMessageCommentAnchorType; at: number } | undefined
  >(undefined);
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
  const [localStroke, setLocalStroke] =
    useState<ReturnType<typeof strokeSoFar>>();
  const spaceHeld = useRef(false);
  const {
    notice,
    showNotice,
    dismissNotice,
    followNotice,
    saveError,
    reportRefusal,
    dismissSaveError,
    accessNotice,
    dismissAccessNotice,
  } = useBoardNotices({ mayEdit, accessReason, tidyLater });

  // A download being made. While a picture is drawn the board renders every
  // node, not just those in view, and leaves out cursors, others' selections
  // and drags, comment pins, a preview's highlights, this viewer's own
  // selection and anything they're part-way through drawing or placing.
  const [exporting, setExporting] = useState<DownloadKind>();
  const capturing = exporting === "png";

  // The viewer's own edits this visit, to undo and redo.
  const undoStale = useCallback(
    (action: "undo" | "redo") =>
      showNotice(
        action === "undo"
          ? t(
              "whiteboard.undo.stale",
              "Changed by someone else since, so it wasn't undone",
            )
          : t(
              "whiteboard.undo.staleRedo",
              "Changed by someone else since, so it wasn't redone",
            ),
      ),
    [showNotice, t],
  );
  // Losing edit access clears both stacks, but a spell offline or on a
  // phone-sized screen doesn't.
  const {
    record: recordEdit,
    undo: undoLast,
    redo: redoLast,
    canUndo,
    canRedo,
  } = useWhiteboardUndo(boardId, {
    editable: mayEdit || unannounced(accessReason),
    onRefused: reportRefusal,
    onStale: undoStale,
  });
  // Arrow-key nudges not yet saved are the latest edit, so they're saved
  // first, to be undone before anything older.
  const saveNudgesNow = useCallback(() => {
    window.clearTimeout(nudgeTimer.current);
    saveNudgesRef.current?.();
  }, []);
  const undo = useCallback(() => {
    saveNudgesNow();
    undoLast();
  }, [saveNudgesNow, undoLast]);
  const redo = useCallback(() => {
    saveNudgesNow();
    redoLast();
  }, [saveNudgesNow, redoLast]);
  // Collapsed frames this viewer has opened for themselves, and the nodes
  // they're dragging, resizing or typing in, which keep the frames around
  // them open (see useWhiteboardSync).
  const [peeked, setPeeked] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState<Set<string>>(() => new Set());
  const markBusy = useCallback(
    (ids: string[], isBusy: boolean) =>
      setBusy((current) => withIds(current, ids, isBusy)),
    [],
  );
  // The node or line whose text is being typed in, which others are told of.
  const [typingIn, setTypingIn] = useState<string>();
  const onEditingChange = useCallback(
    (id: string, editing: boolean, kind: "node" | "line") => {
      if (kind === "node") markBusy([id], editing);
      setTypingIn((current) => {
        if (editing) return id;
        return current === id ? undefined : current;
      });
    },
    [markBusy],
  );
  const peek = useCallback(
    (frameId: string) =>
      setPeeked((current) => withIds(current, [frameId], true)),
    [],
  );
  const unpeek = useCallback(
    (frameId: string) =>
      setPeeked((current) => withIds(current, [frameId], false)),
    [],
  );

  const {
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
  } = useWhiteboardSync({
    boardId,
    livePuzzleIds,
    showFeederArrows,
    // Other people's drags are on the board as it is, not the version, and
    // a picture of the board shows where things are, not where they're
    // being dragged.
    remoteDrags: preview || capturing ? NO_REMOTE_DRAGS : remoteDrags,
    erasingStrokes,
    lineColors,
    lineLabels,
    override: shownPreview,
    peeked,
    busy,
    hideInk,
  });

  // A frame that's no longer collapsed takes its peek with it, so folding it
  // again later folds it for this viewer too.
  useEffect(() => {
    const collapsed = new Set(
      nodeDocs.flatMap((d) => (d.collapsed ? [d._id] : [])),
    );
    setPeeked((current) =>
      withIds(
        current,
        [...current].filter((id) => !collapsed.has(id)),
        false,
      ),
    );
  }, [nodeDocs]);

  // Opens the collapsed frames around a node for this viewer, so it can be
  // shown; says whether there were any.
  const peekAround = useCallback(
    (nodeId: string) => {
      const byId = new Map(nodeDocs.map((d) => [d._id, d]));
      const frames = collapsedAncestors(byId, nodeId).filter(
        (id) => !peeked.has(id),
      );
      if (frames.length === 0) return false;
      setPeeked((current) => withIds(current, frames, true));
      return true;
    },
    [nodeDocs, peeked],
  );

  // The cards whose feeder arrows stand out: the one under the pointer and
  // any selected.
  const [hoveredCard, setHoveredCard] = useState<string>();
  const onNodeMouseEnter = useCallback<NodeMouseHandler<WhiteboardFlowNode>>(
    (_event, node) => {
      if (node.type === "puzzle") setHoveredCard(node.id);
    },
    [],
  );
  const onNodeMouseLeave = useCallback<NodeMouseHandler<WhiteboardFlowNode>>(
    (_event, node) => {
      setHoveredCard((current) => (current === node.id ? undefined : current));
    },
    [],
  );
  // What's selected, sent to others as it changes (nothing from a preview,
  // whose nodes aren't the board's). Line ends are left out: they're shown
  // by their line being selected.
  const liveSelection = useStableIds(
    preview
      ? []
      : nodes
          .filter((n) => n.selected && n.type !== "point")
          .map((n) => n.id)
          .toSorted()
          .slice(0, MAX_LIVE_SELECTION),
  );
  useEffect(() => {
    live.setSelection(liveSelection.length > 0 ? liveSelection : null);
  }, [liveSelection, live]);
  useEffect(() => {
    live.setEditing(preview ? null : (typingIn ?? null));
  }, [preview, typingIn, live]);
  // Place by tags hands the unlocked selected cards back to placement.
  const placeableCards = useStableIds(
    nodes
      .filter((n) => n.selected && n.type === "puzzle" && !n.data.doc.locked)
      .map((n) => n.id),
  );
  const feederFocusCards = useStableIds(
    feederFocus(
      [
        hoveredCard,
        ...nodes
          .filter((n) => n.selected && n.type === "puzzle")
          .map((n) => n.id),
      ],
      edges.filter((e) => e.data?.doc.auto),
    ),
  );
  const feederFocusIds = useMemo(
    () => new Set(feederFocusCards),
    [feederFocusCards],
  );

  // Saves an edit: records it to undo and sends it, and if the server says
  // no, drops what was shown ahead of it, says so and takes back what the
  // save had made.
  const commit = useCallback(
    (write: BoardWrite, options: CommitOptions = {}) => {
      const settled = recordEdit(write, options.group);
      sendAtOnce(boardId, write, (error) => {
        settled(error);
        if (error) {
          if (options.pendingNodes) clearPending(options.pendingNodes);
          if (options.pendingEdges) clearEdgePending(options.pendingEdges);
          reportRefusal(error);
          options.rollback?.();
        }
        options.onDone?.(error);
      });
    },
    [boardId, clearPending, clearEdgePending, reportRefusal, recordEdit],
  );

  const updateNodes = useCallback(
    (inputs: WhiteboardNodeInput[], onDone?: Done, group?: string) => {
      if (inputs.length === 0) {
        onDone?.();
        return;
      }
      commit(
        { upsertNodes: inputs },
        { group, pendingNodes: inputs.map((n) => n._id), onDone },
      );
    },
    [commit],
  );

  // Collapses or expands frames for everyone, showing it at once.
  const setFramesCollapsed = useCallback(
    (frameIds: string[], collapsed: boolean) => {
      markCollapsed(frameIds, collapsed);
      updateNodes(frameIds.map((_id) => ({ _id, collapsed })));
    },
    [markCollapsed, updateNodes],
  );
  const setCollapsed = useCallback(
    (frameId: string, collapsed: boolean) =>
      setFramesCollapsed([frameId], collapsed),
    [setFramesCollapsed],
  );

  // Deletes nodes and lines, as one edit to undo.
  const deleteItems = useCallback(
    (nodeIds: string[], edgeIds: string[]) => {
      if (nodeIds.length === 0 && edgeIds.length === 0) return;
      commit({ deleteNodes: nodeIds, deleteEdges: edgeIds });
    },
    [commit],
  );
  const deleteNodes = useCallback(
    (ids: string[]) => deleteItems(ids, []),
    [deleteItems],
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
    (input: WhiteboardEdgeInput, onDone?: Done) => {
      // Changes to a line show at once; a new line waits for the server.
      const existing = !!flow.getEdge(input._id);
      if (existing) {
        const { _id, ...change } = input;
        markEdgePending(_id, change);
      }
      commit(
        { upsertEdges: [input] },
        { pendingEdges: existing ? [input._id] : undefined, onDone },
      );
    },
    [flow, markEdgePending, commit],
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
      // A child someone else is dragging is theirs to save
      const draggedByOthers: string[] = [];
      all
        .filter((n) => n.parentId === id)
        .forEach((child) => {
          if (isDraggedByOthers(child.id)) {
            draggedByOthers.push(child.id);
            return;
          }
          const saved = child.data.doc.position;
          if (
            Math.abs(saved.x - child.position.x) > 0.01 ||
            Math.abs(saved.y - child.position.y) > 0.01
          ) {
            inputs.push({ _id: child.id, position: child.position });
            markPending(child.id, { position: child.position });
          }
        });
      if (draggedByOthers.length > 0) clearPending(draggedByOthers);
      updateNodes(inputs);
      markBusy([id], false);
    },
    [flow, markPending, clearPending, updateNodes, markBusy, isDraggedByOthers],
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
          markBusy([c.id], true);
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
      const apply = () =>
        setNodes((nds) => applyNodeChanges([...changes, ...extra], nds));
      // A resize step is drawn before the pointer event ends. Left queued, it
      // would be flushed by the re-render React Flow's ResizeObserver callback
      // makes on measuring the step before, changing the node's box inside
      // that delivery, which the browser reports as a ResizeObserver loop.
      if (resizing) {
        flushSync(apply);
      } else {
        apply();
      }
    },
    [flow, setNodes, markPending, markBusy],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<WhiteboardFlowEdge>[]) => {
      setEdges((eds) => applyEdgeChanges(changes, eds));
    },
    [setEdges],
  );

  const showLockRefused = useCallback(
    () => showNotice(t("whiteboard.lock.refused", "That's locked")),
    [showNotice, t],
  );

  // We delete on the server and let the echo update the canvas, so that
  // children of a deleted frame stay put rather than going with it. Locked
  // nodes stay, and say so.
  const onBeforeDelete: OnBeforeDelete<WhiteboardFlowNode, WhiteboardFlowEdge> =
    useCallback(
      ({ nodes: doomedNodes, edges: doomedEdges }) => {
        const selected = doomedNodes.filter((n) => n.selected);
        const unlocked = selected.filter((n) => !n.data.doc.locked);
        if (selected.length > 0 && unlocked.length === 0) {
          showLockRefused();
        } else if (unlocked.length < selected.length) {
          showNotice(
            t("whiteboard.lock.someLocked", "Some of those are locked"),
          );
        }
        deleteItems(
          unlocked.map((n) => n.id),
          doomedEdges.filter((e) => e.selected).map((e) => e.id),
        );
        return Promise.resolve(false);
      },
      [deleteItems, showLockRefused, showNotice, t],
    );

  // A node's box on the board as React Flow last laid it out. boxOf takes
  // the laid-out node itself, and liveRect goes by the node's own position.
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
  // at a time, rather than once per node. A collapsed frame is left out, so
  // nothing lands in it unseen: it's only its header on screen.
  const frameRects = useCallback(
    () =>
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

  // A node's box for the frame tools. Something someone else is dragging
  // counts where it's saved: where they have it is theirs to save.
  const toolBox = useCallback(
    (n: WhiteboardFlowNode): Box => {
      const found = frameToolBox(n);
      return isDraggedByOthers(n.id)
        ? { ...found, ...n.data.doc.position }
        : found;
    },
    [isDraggedByOthers],
  );

  // The frame tools' changes, less any to something someone else is
  // dragging other than the frame being worked on, which are theirs to save.
  const notDraggedByOthers = useCallback(
    (changes: BoxChange[], frameId: string) =>
      changes.filter((c) => c.id === frameId || !isDraggedByOthers(c.id)),
    [isDraggedByOthers],
  );

  // A frame, what's directly in it, and the frames around it (innermost
  // first) with what's directly in each, as the frame tools take them.
  const aroundFrame = useCallback(
    (frameId: string) => {
      const all = flow.getNodes();
      const byId = new Map(all.map((n) => [n.id, n]));
      const childrenOf = (id: string) => all.filter((n) => n.parentId === id);
      const ancestors: FrameAround[] = [];
      let parentId = byId.get(frameId)?.parentId;
      for (let i = 0; parentId && i < MAX_FRAME_DEPTH; i++) {
        const parent = byId.get(parentId);
        if (!parent) break;
        ancestors.push({
          frame: toolBox(parent),
          children: childrenOf(parent.id).map(toolBox),
        });
        parentId = parent.parentId;
      }
      return {
        frame: byId.get(frameId),
        children: childrenOf(frameId),
        ancestors,
      };
    },
    [flow, toolBox],
  );

  // Shows the frame tools' changes straight away and holds them until the
  // server has them, and gives them back as inputs to save.
  const showBoxChanges = useCallback(
    (changes: BoxChange[]): WhiteboardNodeInput[] => {
      if (changes.length === 0) return [];
      const byId = new Map(changes.map((c) => [c.id, c]));
      changes.forEach(({ id, ...change }) => markPending(id, change));
      setNodes((nds) =>
        nds.map((n) => {
          const change = byId.get(n.id);
          if (!change) return n;
          return {
            ...n,
            ...(change.position ? { position: change.position } : {}),
            ...(change.width !== undefined ? { width: change.width } : {}),
            ...(change.height !== undefined && !n.data.collapsed
              ? { height: change.height }
              : {}),
          };
        }),
      );
      return changes.map(({ id, ...change }) => ({ _id: id, ...change }));
    },
    [markPending, setNodes],
  );

  // Grows the frames that what has just landed in them overhangs on the
  // right or bottom, and the frames around those, never shrinking anything.
  // A frame that's locked, or that would make a locked frame around it grow,
  // stays as it is. Gives back the inputs to save with the move.
  const growForLanded = useCallback(
    (landed: Landed[]): WhiteboardNodeInput[] => {
      const byFrame = new Map<string, Box[]>();
      landed.forEach(({ id, parent, position }) => {
        const node = parent && flow.getNode(id);
        if (!parent || !node) return;
        byFrame.set(parent, [
          ...(byFrame.get(parent) ?? []),
          { ...frameToolBox(node), ...position },
        ]);
      });
      // Growing only reaches right and down, so where two frames grow the
      // same frame around them, the bigger size takes both.
      const grown = new Map<string, BoxChange>();
      byFrame.forEach((boxes, frameId) => {
        const { frame, ancestors } = aroundFrame(frameId);
        if (!frame || frame.data.collapsed) return;
        const result = growFrameFor(toolBox(frame), boxes, ancestors);
        if (result.locked.length > 0) return;
        result.changes.forEach(({ id, width, height }) => {
          const merged = { ...grown.get(id), id };
          if (width !== undefined) {
            merged.width = Math.max(width, merged.width ?? 0);
          }
          if (height !== undefined) {
            merged.height = Math.max(height, merged.height ?? 0);
          }
          grown.set(id, merged);
        });
      });
      return showBoxChanges([...grown.values()]);
    },
    [flow, toolBox, aroundFrame, showBoxChanges],
  );

  // Fit to contents: the frame shrinks or grows to just take what's in it,
  // and the frames around it grow if it would overhang them, with nothing
  // moving on the board.
  const fitToContents = useCallback(
    (frameId: string) => {
      const { frame, children, ancestors } = aroundFrame(frameId);
      if (!frame || frame.data.collapsed) return;
      const result = fitFrame(
        toolBox(frame),
        children.map(toolBox),
        ancestors,
        MIN_SIZES.frame,
      );
      if (result.locked.length > 0) {
        showLockRefused();
        return;
      }
      updateNodes(showBoxChanges(notDraggedByOthers(result.changes, frameId)));
    },
    [
      aroundFrame,
      toolBox,
      notDraggedByOthers,
      showBoxChanges,
      showLockRefused,
      updateNodes,
    ],
  );

  // Tidy: lays a frame's cards out as a new board would, metas first, going
  // round everything else in it, and grows the frame to take them.
  const tidyCards = useCallback(
    (frameId: string) => {
      const { frame, children, ancestors } = aroundFrame(frameId);
      if (!frame || frame.data.collapsed) return;
      const puzzles = Puzzles.find(
        { hunt: huntId },
        { projection: { tags: 1, createdAt: 1 } },
      ).fetch();
      const tags = Tags.find(
        { hunt: huntId },
        { projection: { name: 1 } },
      ).fetch();
      const metaPuzzles = roundMetas(frame.data.doc.tag, tags, puzzles);
      const createdAt = new Map(puzzles.map((p) => [p._id, +p.createdAt]));
      // A card someone else is dragging stays put like everything else
      const isCard = (n: WhiteboardFlowNode) =>
        n.type === "puzzle" && !isDraggedByOthers(n.id);
      const cards = children.filter(isCard);
      const result = tidyFrame(
        toolBox(frame),
        cards.map((n) => ({
          ...toolBox(n),
          createdAt:
            (n.data.doc.puzzle
              ? createdAt.get(n.data.doc.puzzle)
              : undefined) ?? Number.MAX_SAFE_INTEGER,
        })),
        new Set(
          cards
            .filter(
              (n) => n.data.doc.puzzle && metaPuzzles.has(n.data.doc.puzzle),
            )
            .map((n) => n.id),
        ),
        children.filter((n) => !isCard(n)).map(toolBox),
        ancestors,
      );
      if (result.locked.length > 0) {
        showLockRefused();
        return;
      }
      updateNodes(showBoxChanges(notDraggedByOthers(result.changes, frameId)));
    },
    [
      huntId,
      aroundFrame,
      toolBox,
      notDraggedByOthers,
      showBoxChanges,
      showLockRefused,
      updateNodes,
      isDraggedByOthers,
    ],
  );

  // Saves the nodes nudged with the arrow keys.
  const saveNudges = useCallback(() => {
    const inputs: WhiteboardNodeInput[] = [];
    const nudgedIds = new Set(nudged.current);
    const frames = frameRects();
    const moves: NodeMoves = new Map();
    const landed: Landed[] = [];
    // A nudge to something someone else is dragging is dropped: it's theirs
    // to save
    const draggedByOthers: string[] = [];
    nudgedIds.forEach((id) => {
      if (isDraggedByOthers(id)) {
        draggedByOthers.push(id);
        return;
      }
      const node = flow.getNode(id);
      if (!node) return;
      // Like a drop, something nudged into or out of a frame joins or leaves
      // it. Things carried along (free line ends, the rest of a stroke) and
      // things inside a frame that moved too keep their frame.
      const insideMoved = [...nudgedIds].some(
        (other) => other !== id && isWithin(id, other),
      );
      const carried = companions.current.has(id) || insideMoved;
      const rect = carried ? undefined : absoluteRect(id);
      if (rect) {
        const { parent, position } = placementFor(id, rect, nudgedIds, frames);
        if (parent !== node.parentId) {
          inputs.push({ _id: id, position, parent: parent ?? null });
          markPending(id, { position, parent: parent ?? null });
          moves.set(id, { position, parent });
          landed.push({ id, parent, position });
          return;
        }
      }
      inputs.push({ _id: id, position: node.position });
      markPending(id, { position: node.position });
      // Something moving with its frame stays where it was in it
      if (!insideMoved) {
        landed.push({ id, parent: node.parentId, position: node.position });
      }
    });
    nudged.current.clear();
    companions.current.clear();
    if (draggedByOthers.length > 0) clearPending(draggedByOthers);
    showMoves(moves);
    updateNodes(mergeInputs([...inputs, ...growForLanded(landed)]));
  }, [
    flow,
    frameRects,
    isWithin,
    absoluteRect,
    placementFor,
    markPending,
    clearPending,
    showMoves,
    growForLanded,
    updateNodes,
    isDraggedByOthers,
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

  const onNodeDragStart: OnNodeDrag<WhiteboardFlowNode> = useCallback(
    (_event, _node, dragged) => {
      dragActive.current = true;
      markBusy(
        dragged.map((n) => n.id),
        true,
      );
    },
    [markBusy],
  );

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
      const landed: Landed[] = [];

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
          landed.push({
            id: node.id,
            parent: node.parentId,
            position: node.position,
          });
          return;
        }
        inputs.push({ _id: node.id, position, parent: target ?? null });
        markPending(node.id, { position, parent: target ?? null });
        moves.set(node.id, { position, parent: target });
        landed.push({ id: node.id, parent: target, position });
      });

      dragActive.current = false;
      companions.current.forEach((id) => {
        const carried = flow.getNode(id);
        if (!carried || draggedIds.has(id)) return;
        inputs.push({ _id: id, position: carried.position });
        markPending(id, { position: carried.position });
        landed.push({
          id,
          parent: carried.parentId,
          position: carried.position,
        });
      });
      companions.current.clear();

      showMoves(moves);
      // Others drop their copy of the drag only once the saved positions
      // are on their way, so they never see the node jump back.
      updateNodes(mergeInputs([...inputs, ...growForLanded(landed)]), () => {
        if (!dragActive.current) live.setDrag(null);
      });
      markBusy([...draggedIds], false);
    },
    [
      flow,
      live,
      markBusy,
      attachDroppedEnd,
      isWithin,
      liveRect,
      placementFor,
      frameRects,
      markPending,
      showMoves,
      growForLanded,
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

  const onMoveEnd: OnMoveEnd = useCallback(
    (_event, viewport) => setSavedViewport(viewport),
    [setSavedViewport],
  );
  // Told of every pan and zoom, so following someone stops when the viewer
  // moves the board themselves (see WhosHere).
  const viewportMoves = useRef<ViewportMoves>(undefined);
  // How far down the top-right panels start, to clear who's here.
  const [whosHereHeight, setWhosHereHeight] = useState(0);
  const onMoveStart: OnMoveStart = useCallback(
    (event) => viewportMoves.current?.start(event),
    [],
  );
  const refreshAttachPreviewRef = useRef<() => void>(undefined);
  const onMove: OnMove = useCallback((event) => {
    refreshAttachPreviewRef.current?.();
    viewportMoves.current?.move(event);
  }, []);

  const paneCenter = useCallback(() => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return flow.screenToFlowPosition({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
  }, [flow]);

  const {
    placing,
    setPlacing,
    setHover,
    keyboardCatcher,
    catchKeyboard,
    clearKeyboardCatcher,
    placeNode,
    placementRect,
    placeGhost,
  } = usePlaceTool({
    tool,
    shapeKind,
    placementFor,
    updateNodes,
    tidyLater,
    setTool,
    setEditOnAppear,
  });

  const selectedUnitCount = useMemo(
    () => selectionUnits(nodes, edges).size,
    [nodes, edges],
  );
  const selectedLines = useMemo(
    () => edges.filter((e) => e.selected && !e.data?.doc.auto),
    [edges],
  );
  const [placingByTags, setPlacingByTags] = useState(false);
  const placeSelectedByTags = useCallback(() => {
    if (placeableCards.length === 0) return;
    setPlacingByTags(true);
    commit(
      { placeByTags: placeableCards },
      { onDone: () => setPlacingByTags(false) },
    );
  }, [placeableCards, commit]);
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
      const inputs = lines.map((e) => ({ _id: e.id, ...patch }));
      lines.forEach((e) => markEdgePending(e.id, patch));
      commit({ upsertEdges: inputs }, { pendingEdges: lines.map((e) => e.id) });
    },
    [selectedLines, markEdgePending, commit],
  );
  const updateLineStyle = useCallback(
    (patch: Partial<LineStyle>) =>
      setLineStyle((current) => ({ ...current, ...patch })),
    [setLineStyle],
  );

  // Lines up or evenly spaces the selection. Works in board coordinates and
  // shifts each node by the same amount in its own parent's coordinates.
  const arrange = useCallback(
    (kind: AlignMode | DistributeAxis) => {
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
        kind === "horizontal" || kind === "vertical"
          ? distributeItems(items, kind)
          : alignItems(items, kind);

      const moved: NodeMoves = new Map();
      const inputs: WhiteboardNodeInput[] = [];
      const landed: Landed[] = [];
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
          // Something someone else is dragging stays theirs to save
          if (isDraggedByOthers(m.id)) return;
          // Joins or leaves a frame as a drop would (see onNodeDragStop), but
          // not a frame being arranged, since it's moving too.
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
            landed.push({ id: m.id, parent, position });
            return;
          }
          const position = {
            x: round1(m.position.x + shift.dx),
            y: round1(m.position.y + shift.dy),
          };
          moved.set(m.id, { position, parent: m.parentId });
          inputs.push({ _id: m.id, position });
          markPending(m.id, { position });
          landed.push({ id: m.id, parent: m.parentId, position });
        });
      });
      showMoves(moved);
      updateNodes(mergeInputs([...inputs, ...growForLanded(landed)]));
    },
    [
      flow,
      absoluteRect,
      frameRects,
      placementFor,
      markPending,
      showMoves,
      growForLanded,
      updateNodes,
      isDraggedByOthers,
    ],
  );

  const {
    hiddenCards,
    hiddenFrames,
    hiddenArrows,
    tagNames,
    notOnBoardCount,
    putBack,
    putBackFrame,
    putBackArrow,
    putBackAllArrows,
  } = useNotOnBoard({
    boardId,
    huntId,
    livePuzzles,
    nodeDocs,
    paneCenter,
    updateNodes,
    commit,
  });

  // Ink: pointer samples become a stroke in flow coordinates. Long strokes
  // are saved in segments as they're drawn, so other people see them grow.
  const commitSegment = useCallback(
    (state: Drawing, points: InkPoint[]) => {
      const size = STROKE_SIZES[state.strokeWidth];
      const bounds = inkBounds(points, size);
      const parentRect = state.parent ? absoluteRect(state.parent) : undefined;
      updateNodes(
        [
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
        ],
        undefined,
        `stroke:${state.stroke}`,
      );
      state.committed += 1;
    },
    [absoluteRect, updateNodes],
  );

  const selfId = useTracker(() => Meteor.userId() ?? undefined, []);

  // What Lock (Ctrl+L) does to the selection: lock it if any of it is
  // unlocked, otherwise unlock it, which is for whoever locked each node or
  // an operator. A line's free end can't be locked.
  const lockSelection = useMemo(() => {
    const selected = nodes.filter((n) => n.selected && n.type !== "point");
    const unlocked = selected.filter((n) => !n.data.doc.locked);
    const lock = unlocked.length > 0 || selected.length === 0;
    return {
      lock,
      ids: (lock ? unlocked : selected).map((n) => n.id),
      blocked:
        !lock &&
        !isOperator &&
        selected.some((n) => n.data.doc.lockedBy !== selfId),
    };
  }, [nodes, isOperator, selfId]);
  const cantUnlock = t(
    "whiteboard.lock.cantUnlock",
    "Only the person who locked this, or an operator, can unlock it",
  );
  const toggleLock = useCallback(() => {
    const { lock, ids, blocked } = lockSelection;
    if (ids.length === 0) return;
    if (blocked) {
      showNotice(cantUnlock);
      return;
    }
    updateNodes(ids.map((_id) => ({ _id, locked: lock })));
  }, [lockSelection, updateNodes, showNotice, cantUnlock]);
  const threads = useWhiteboardComments(puzzleId);
  const [seenComments, markCommentSeen] = useSeenComments(boardId, threads);
  // The threads the Comments panel lists, and N steps through, leaving
  // resolved ones out unless they're being shown, as the pins do.
  const threadRows = useMemo(
    () =>
      threadList(threads.values(), {
        seen: seenComments,
        selfId,
        showResolved,
      }),
    [threads, seenComments, selfId, showResolved],
  );
  const unreadCount = useMemo(
    () => threadRows.filter((row) => row.unread).length,
    [threadRows],
  );

  // What each collapsed frame hides, for its header and far-zoom label.
  const foldedPuzzles = useMemo(() => {
    const docs = new Map(nodeDocs.map((d) => [d._id, d]));
    const byFrame = new Map<string, string[]>();
    folded.forEach((frameId, id) => {
      const puzzle = docs.get(id)?.puzzle;
      if (!puzzle) return;
      byFrame.set(frameId, [...(byFrame.get(frameId) ?? []), puzzle]);
    });
    return byFrame;
  }, [folded, nodeDocs]);
  const foldedPuzzleKey = [...foldedPuzzles.values()].flat().join(" ");
  const foldedSolvedness = useTracker(
    () =>
      foldedPuzzleKey
        ? new Map<string, Solvedness>(
            Puzzles.find(
              { _id: { $in: foldedPuzzleKey.split(" ") } },
              {
                projection: {
                  answers: 1,
                  expectedAnswerCount: 1,
                  completedWithNoAnswer: 1,
                },
              },
            ).map((p) => [p._id, computeSolvedness(p)]),
          )
        : NO_SOLVEDNESS,
    [foldedPuzzleKey],
  );
  const collapsedIds = useStableIds(
    nodes.filter((n) => n.data.collapsed).map((n) => n.id),
  );
  const foldSummaries = useMemo(() => {
    const summaries = new Map<string, FoldSummary>();
    const summaryOf = (frameId: string) => {
      let summary = summaries.get(frameId);
      if (!summary) {
        summary = {
          puzzles: [],
          solved: 0,
          unsolved: 0,
          items: 0,
          comments: 0,
        };
        summaries.set(frameId, summary);
      }
      return summary;
    };
    // An ink stroke counts once, however many segments it's saved in, and a
    // line's free end not at all.
    const docs = new Map(nodeDocs.map((d) => [d._id, d]));
    const strokes = new Set<string>();
    folded.forEach((frameId, id) => {
      const doc = docs.get(id);
      if (!doc || doc.type === "point") return;
      if (doc.stroke) {
        if (strokes.has(doc.stroke)) return;
        strokes.add(doc.stroke);
      }
      summaryOf(frameId).items += 1;
    });
    foldedPuzzles.forEach((puzzles, frameId) => {
      const summary = summaryOf(frameId);
      summary.puzzles = puzzles;
      puzzles.forEach((puzzle) => {
        const solvedness = foldedSolvedness.get(puzzle);
        if (solvedness === "solved") summary.solved += 1;
        else if (solvedness === "unsolved") summary.unsolved += 1;
      });
    });
    threads.forEach((thread) => {
      const node = thread.root.comment?.node;
      const frameId = node && folded.get(node);
      if (frameId && !thread.resolved) summaryOf(frameId).comments += 1;
    });
    // Every frame drawn folded has a summary, empty or not.
    collapsedIds.forEach((id) => summaryOf(id));
    return summaries;
  }, [
    folded,
    nodeDocs,
    foldedPuzzles,
    foldedSolvedness,
    threads,
    collapsedIds,
  ]);
  // A thread that has gone (deleted, say) counts as closed.
  const openThreadData = openThread ? threads.get(openThread) : undefined;
  const openThreadId = openThreadData?.root._id;
  // The thread N last went to, whose panel takes focus itself rather than
  // giving it to the composer, so that N goes on to the next one.
  const [steppedThread, setSteppedThread] = useState<string>();
  // An open thread or a comment being started takes the list's place.
  const commentListShown =
    sidePanel === "comments" && !draft && !openThreadData;

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

  // Brings a pin to the middle of the screen at the given zoom or, on a
  // phone, to the middle of the part above the comment sheet.
  const panToPin = useCallback(
    (at: XYPosition, zoom: number) => {
      const height = compact ? (wrapperRef.current?.clientHeight ?? 0) : 0;
      void flow.setCenter(at.x, at.y + (SHEET_OFFSET * height) / zoom, {
        zoom,
        duration: 400,
      });
    },
    [flow, compact],
  );

  const openComment = useCallback(
    (id: string) => {
      if (id === "draft") return;
      setOpenThread(id);
      setSteppedThread(undefined);
      setDraft(undefined);
      closePanel("hidden");
      if (!compact) return;
      const anchor = threads.get(id)?.root.comment;
      const at =
        anchor &&
        commentPosition(
          anchor,
          anchor.node ? absoluteRect(anchor.node) : undefined,
        );
      if (at) panToPin(at, flow.getZoom());
    },
    [closePanel, compact, threads, absoluteRect, panToPin, flow],
  );

  const closeComment = useCallback(() => {
    setOpenThread(undefined);
    setSteppedThread(undefined);
    setDraft(undefined);
  }, []);
  // Opens a panel in place of any thread, or comment being started.
  const openPanel = useCallback(
    (panel: SidePanelKind) => {
      setSidePanel(panel);
      closeComment();
    },
    [closeComment],
  );
  // A panel's toolbar button: closes it if it's open, else opens it.
  const togglePanel = useCallback(
    (panel: SidePanelKind) => {
      setSidePanel((current) => (current === panel ? undefined : panel));
      closeComment();
    },
    [closeComment],
  );

  // Closing a thread from its panel (Close, or Escape) puts focus back on
  // its pin, if the pin is still showing. Deleting it puts focus on what it
  // was on instead, since the pin goes with it.
  const refocusAfterThread = useRef<string | undefined>(undefined);
  const dismissComment = useCallback(() => {
    refocusAfterThread.current =
      openThreadId &&
      `.jr-comment-pin[data-thread="${CSS.escape(openThreadId)}"]`;
    closeComment();
  }, [openThreadId, closeComment]);
  const openThreadNode = openThreadData?.root.comment?.node;
  const closeDeletedComment = useCallback(() => {
    refocusAfterThread.current =
      openThreadNode &&
      `.react-flow__node[data-id="${CSS.escape(openThreadNode)}"]`;
    closeComment();
  }, [openThreadNode, closeComment]);
  useEffect(() => {
    const selector = refocusAfterThread.current;
    if (!selector || openThreadId) return;
    refocusAfterThread.current = undefined;
    wrapperRef.current
      ?.querySelector<HTMLElement>(selector)
      ?.focus({ preventScroll: true });
  }, [openThreadId]);

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

  // On a phone the Outline's sheet covers the bottom of the board, so picking
  // a row closes it as the board starts to move.
  const closeOutlineSheet = useCallback(() => {
    if (compact) closePanel("outline");
  }, [compact, closePanel]);
  const {
    showNode,
    showLine,
    setPendingLine,
    showOutlineFrame,
    fitWholeBoard,
  } = useBoardNavigation({
    wrapperRef,
    compact,
    absoluteRect,
    nodeCenter,
    pulseAt,
    nodeDocs,
    nodes,
    edges,
    shownLines,
    peekAround,
    closeOutlineSheet,
  });

  // Pans to a comment and opens it, if it's on the board, and says whether
  // it was.
  const showComment = useCallback(
    (threadId: string) => {
      const anchor = threads.get(threadId)?.root.comment;
      if (!anchor) return false;
      const at = commentPosition(
        anchor,
        anchor.node ? absoluteRect(anchor.node) : undefined,
      );
      if (!at) return false;
      closePanel("hidden");
      setDraft(undefined);
      setOpenThread(threadId);
      panToPin(at, Math.max(flow.getZoom(), 0.8));
      pulseComment(threadId);
      return true;
    },
    [threads, absoluteRect, panToPin, flow, closePanel, pulseComment],
  );

  const putBackSearchHit = useCallback(
    (hit: BoardSearchHit) => {
      if (readOnly) return;
      if (hit.kind === "frame" && hit.node) {
        putBackFrame({ id: hit.node });
        pulseAt({ node: hit.node });
        return;
      }
      if (!hit.puzzle) return;
      const id = putBack({
        id: hit.node,
        puzzle: hit.puzzle,
        title: hit.label,
      });
      pulseAt({ node: id });
    },
    [readOnly, putBack, putBackFrame, pulseAt],
  );
  const searchRef = useRef<HTMLInputElement>(null);

  // A link to what's selected (a card, or another node), or else to this
  // view, for pasting into chat.
  const linkToHere = useCallback(() => {
    const selected = flow.getNodes().filter((n) => n.selected);
    const [only] = selected.length === 1 ? selected : [];
    const query = boardLinkQuery(only?.data.doc, {
      ...paneCenter(),
      zoom: flow.getZoom(),
    });
    return Meteor.absoluteUrl(`hunts/${huntId}/whiteboard?${query}`);
  }, [flow, paneCenter, huntId]);

  // Once the board's chat has loaded, a thread that isn't in it is gone.
  const commentsLoaded = useContext(ChatLoadedContext);

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
      // Once loaded, a comment on something that isn't on the board (gone,
      // hidden, or a card whose puzzle has gone) is as ready as it will ever
      // be, and showComment then leaves it. Anything else waits to be laid
      // out, and inside a collapsed frame for pendingFocus's effect to open
      // the frame.
      const doc = WhiteboardNodes.findOne(anchor.node);
      const onBoard =
        !!doc &&
        !doc.hidden &&
        (doc.type !== "puzzle" ||
          (!!doc.puzzle && livePuzzleIds.has(doc.puzzle)));
      return !onBoard || !!flow.getInternalNode(anchor.node);
    },
    [threads, boardLoaded, flow, livePuzzleIds],
  );

  const focusComment = useCallback(
    (threadId: string) => {
      if (readyToShow(threadId)) showComment(threadId);
      else setPendingFocus(threadId);
    },
    [readyToShow, showComment],
  );

  // React Flow takes in new nodes before this component's effects run, so
  // this is rechecked whenever they change.
  useEffect(() => {
    if (!pendingFocus) return;
    if (commentsLoaded && !threads.has(pendingFocus)) {
      setPendingFocus(undefined);
      showNotice(t("whiteboard.link.commentGone", "That comment is gone."));
      if (pendingFocus === initialComment) onInitialCommentShown?.();
      return;
    }
    // A comment inside a collapsed frame opens the frame for this viewer
    // first, so it's seen in place.
    const anchorNode = threads.get(pendingFocus)?.root.comment?.node;
    if (boardLoaded && anchorNode && peekAround(anchorNode)) return;
    if (!readyToShow(pendingFocus)) return;
    setPendingFocus(undefined);
    if (!showComment(pendingFocus)) {
      // What the comment was on has been hidden or deleted.
      showNotice(
        t("whiteboard.link.nodeGone", "That isn't on the board any more."),
      );
    }
    if (pendingFocus === initialComment) onInitialCommentShown?.();
  }, [
    pendingFocus,
    commentsLoaded,
    threads,
    boardLoaded,
    peekAround,
    readyToShow,
    showComment,
    showNotice,
    t,
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

  const setPendingTarget = useLinkedTarget({
    initialTarget,
    onInitialTargetShown,
    initialViewport,
    openedAt,
    boardLoaded,
    livePuzzleIds,
    nodeDocs,
    nodes,
    peekAround,
    showNode,
    showNotice,
  });

  // What picking something the search found does: pan to it, or put a
  // puzzle that isn't on the board back and mark it there.
  const showSearchHit = useCallback(
    (hit: BoardSearchHit) => {
      if (hit.node) {
        // Something inside a collapsed frame is shown once the frame opens.
        if (peekAround(hit.node)) {
          setPendingTarget({ kind: "node", id: hit.node });
        } else {
          showNode(hit.node);
        }
      } else if (hit.edge) {
        // So is a line with an end inside one.
        const line = WhiteboardEdges.findOne(hit.edge);
        const opened = line
          ? [peekAround(line.source), peekAround(line.target)].includes(true)
          : false;
        if (opened) {
          setPendingLine(hit.edge);
        } else {
          showLine(hit.edge);
        }
      }
    },
    [peekAround, showNode, showLine, setPendingTarget, setPendingLine],
  );

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
        replies: thread.replyCount,
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

  // Whether a pointer event happened on the board itself. React passes on
  // events from dialogs drawn elsewhere on the page (the comment panel's
  // delete dialog) as though they were inside it.
  const onBoard = useCallback(
    (event: React.PointerEvent) =>
      event.target instanceof globalThis.Node &&
      !!wrapperRef.current?.contains(event.target),
    [],
  );

  // Locked ink isn't erased.
  const eraseAt = useCallback(
    (point: XYPosition) => {
      const hits: string[] = [];
      const all = flow.getNodes();
      const locked = new Set(
        all.flatMap((n) =>
          n.data.doc.locked && n.data.doc.stroke ? [n.data.doc.stroke] : [],
        ),
      );
      all.forEach((n) => {
        const stroke = n.data.doc.stroke;
        if (
          n.type !== "ink" ||
          !stroke ||
          erasingStrokes.has(stroke) ||
          locked.has(stroke)
        ) {
          return;
        }
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

  // A long press on a node adds it to the selection, leaving the rest
  // selected, so a second long press selects two.
  const selectByLongPress = useCallback(
    (id: string) => {
      const { nodeLookup, triggerNodeChanges } = storeApi.getState();
      const node = nodeLookup.get(id);
      if (!node || node.hidden) return;
      tapped.current = true;
      if (!node.selected) {
        triggerNodeChanges([{ type: "select", id, selected: true }]);
      }
    },
    [storeApi],
  );

  // Drops whatever one finger had started (a stroke, a note being placed, a
  // line, an erase, a long press or an area being selected) when a second
  // finger turns it into a pinch. A stroke long enough to have been saved
  // in part is finished where it got to instead.
  const dropFingerAction = useCallback(() => {
    longPress.current.cancel();
    tapPress.current = undefined;
    const state = drawing.current;
    if (state) {
      drawing.current = undefined;
      if (state.committed > 0) {
        const rest = state.segmenter.finish(true);
        if (rest) commitSegment(state, rest);
      }
      setLocalStroke(undefined);
      live.setStroke(null);
    }
    setPlacing(undefined);
    setConnecting(undefined);
    setErasingStrokes(new Set());
    // React Flow selects what the box covers as it's drawn, so that goes
    // too.
    const flowState = storeApi.getState();
    if (flowState.userSelectionRect) {
      flowState.resetSelectedElements();
      storeApi.setState({
        userSelectionRect: null,
        userSelectionActive: false,
      });
    }
  }, [commitSegment, live, storeApi, setPlacing]);

  // Two fingers pan and zoom the board while a tool takes one finger for
  // itself, which React Flow won't do then: the board point that was
  // between them stays between them, and the zoom follows how far apart
  // they are.
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
  }, [storeApi, flow, dropFingerAction]);
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

  const onPointerDownCapture = useCallback(
    (event: React.PointerEvent) => {
      tapped.current = false;
      if (event.pointerType === "touch") {
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
        // A second finger means a pinch, not a tap, a long press or a
        // stroke. React Flow pans and zooms unless the tool has the first
        // finger, when the canvas does.
        if (touches.current.size > 1) {
          longPress.current.cancel();
          tapPress.current = undefined;
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
          return;
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
              () => selectByLongPress(id),
            );
          }
        }
      }
      // A second pointer of another kind means the press isn't a tap either.
      if (tapPress.current && tapPress.current.pointerId !== event.pointerId) {
        tapPress.current = undefined;
        return;
      }
      if (
        !onBoard(event) ||
        (readOnly && tool !== "comment") ||
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
      const point = flowPoint(event);
      // On a touch screen a finger or a stylus places a note by tap, and one
      // that moves pans the board, which the browser does from its touch
      // events whatever's done with the pointer's.
      const placesByTap =
        coarse && isPlaceTool(tool) && event.pointerType !== "mouse";
      if (tool === "comment" || placesByTap) {
        tapPress.current = {
          point,
          clientX: event.clientX,
          clientY: event.clientY,
          pointerId: event.pointerId,
          pointerType: event.pointerType,
        };
        // A touch is left to React Flow too, so a finger that moves pans the
        // board (and a second one pinches) instead of placing anything.
        if (event.pointerType === "touch" || placesByTap) return;
      }
      event.preventDefault();
      event.stopPropagation();
      wrapperRef.current?.setPointerCapture(event.pointerId);
      if (tool === "comment") return;

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
      setLocalStroke(strokeSoFar(state));
    },
    [
      onBoard,
      readOnly,
      tool,
      coarse,
      fingerPans,
      startPinch,
      selectByLongPress,
      flowPoint,
      eraseAt,
      penColor,
      penWidth,
      frameAt,
      resolveEndpoint,
      setPlacing,
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

  // Where the pointer last was on screen while over the board itself (not
  // its toolbars and panels), for a paste to land at.
  const lastPointer = useRef<{ x: number; y: number } | undefined>(undefined);
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
      const at = { x: event.clientX, y: event.clientY };
      if (
        event.pointerType === "touch" &&
        touches.current.has(event.pointerId)
      ) {
        touches.current.set(event.pointerId, at);
        if (pinch.current?.ids.includes(event.pointerId)) {
          movePinch();
          return;
        }
        if (spentTouches.current.has(event.pointerId)) return;
        longPress.current.move(event.pointerId, at);
      }
      const press = tapPress.current;
      if (
        press &&
        press.pointerId === event.pointerId &&
        movedPastSlop(
          { x: press.clientX, y: press.clientY },
          at,
          press.pointerType,
        )
      ) {
        tapPress.current = undefined;
      }
      if (!onBoard(event)) return;
      const point = flowPoint(event);
      if (!preview && event.pointerType !== "touch") live.setCursor(point);
      if (clickConnectFrom.current) setClickConnectPointer(point);
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
        } else if (event.pointerType !== "touch") {
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
      setLocalStroke(strokeSoFar(state));
      live.setStroke({
        color: state.color,
        strokeWidth: state.strokeWidth,
        points: state.segmenter.points,
      });
    },
    [
      onBoard,
      movePinch,
      flowPoint,
      live,
      preview,
      tool,
      placing,
      connecting,
      targetFor,
      refreshAttachPreview,
      eraseAt,
      commitSegment,
      setPlacing,
      setHover,
    ],
  );

  // The browser lets go of pointer capture itself after pointerup and
  // pointercancel.
  const onPointerUp = useCallback(
    (event: React.PointerEvent) => {
      if (liftFinger(event)) return;
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
      if (tool === "comment" || (isPlaceTool(tool) && tapPress.current)) {
        const press = tapPress.current;
        if (!press || press.pointerId !== event.pointerId) return;
        tapPress.current = undefined;
        if (press.pointerType === "touch" || isPlaceTool(tool)) {
          tapped.current = true;
        }
        if (isPlaceTool(tool)) {
          // Shapes have nothing to type in
          if (tool !== "shape") {
            catchKeyboard();
          }
          placeNode(tool, placementRect(tool, press.point, press.point));
          return;
        }
        setDraft(commentAnchorAt(press.point));
        setOpenThread(undefined);
        closePanel("hidden");
        setTool("select");
        if (compact) panToPin(press.point, flow.getZoom());
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
      closePanel,
      compact,
      panToPin,
      liftFinger,
      catchKeyboard,
      setPlacing,
      setHover,
    ],
  );

  // A cancelled pointer (a touch taken over by a gesture, say) drops a line
  // being drawn or a comment being placed rather than finishing it; anything
  // else ends as usual.
  const onPointerCancel = useCallback(
    (event: React.PointerEvent) => {
      if (liftFinger(event)) return;
      if (connecting) {
        setConnecting(undefined);
        return;
      }
      if (
        tool === "comment" ||
        tapPress.current?.pointerId === event.pointerId
      ) {
        tapPress.current = undefined;
        return;
      }
      onPointerUp(event);
    },
    [liftFinger, connecting, tool, onPointerUp],
  );

  // A long press on a phone or tablet calls up the browser's own menu, which
  // shouldn't come with the selection it makes.
  const onContextMenu = useCallback((event: React.MouseEvent) => {
    if (longPress.current.waiting || tapped.current) event.preventDefault();
  }, []);

  // The browser follows a tap with mouse events and a click, which would
  // take focus from the composer of the comment the tap just placed, or
  // follow a link it was on.
  const onTapFollowUp = useCallback((event: React.MouseEvent) => {
    if (!tapped.current) return;
    event.preventDefault();
    if (event.type === "click") {
      event.stopPropagation();
      tapped.current = false;
    }
  }, []);

  const onPointerLeave = useCallback(() => {
    live.setCursor(null);
    setHover(undefined);
    lastPointer.current = undefined;
    setAttachPreview(undefined);
  }, [live, setHover]);

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

  // Selects just the nodes and lines that pass, through React Flow's store.
  const applySelection = useCallback(
    (
      wantNode: (node: WhiteboardFlowNode) => boolean,
      wantEdge: (edge: WhiteboardFlowEdge) => boolean,
    ) => {
      const { nodeLookup, edgeLookup, triggerNodeChanges, triggerEdgeChanges } =
        storeApi.getState();
      const nodeChanges: NodeChange<WhiteboardFlowNode>[] = [];
      nodeLookup.forEach((node) => {
        const selected = wantNode(node);
        if (!!node.selected !== selected) {
          nodeChanges.push({ type: "select", id: node.id, selected });
        }
      });
      const edgeChanges: EdgeChange<WhiteboardFlowEdge>[] = [];
      edgeLookup.forEach((edge) => {
        const selected = wantEdge(edge);
        if (!!edge.selected !== selected) {
          edgeChanges.push({ type: "select", id: edge.id, selected });
        }
      });
      triggerNodeChanges(nodeChanges);
      triggerEdgeChanges(edgeChanges);
    },
    [storeApi],
  );

  // Ctrl+A (Cmd+A on a Mac) selects everything on the board but frames,
  // whose contents are selected anyway, and no lines.
  const selectAll = useCallback(
    () =>
      applySelection(
        (node) => node.type !== "frame" && !node.hidden,
        () => false,
      ),
    [applySelection],
  );

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
    [readOnly, flow, flowPoint, showLockRefused],
  );

  const actions: WhiteboardActions = useMemo(
    () => ({
      readOnly,
      readOnlyForLayout: accessReason === "narrow",
      compact,
      coarse,
      updateNodes,
      updateEdge,
      persistResize,
      fitToContents,
      tidyCards,
      beginEndpointDrag,
      onEditingChange,
      editOnAppear,
      clearEditOnAppear,
    }),
    [
      readOnly,
      accessReason,
      compact,
      coarse,
      updateNodes,
      updateEdge,
      persistResize,
      fitToContents,
      tidyCards,
      beginEndpointDrag,
      onEditingChange,
      editOnAppear,
      clearEditOnAppear,
    ],
  );
  const collapseActions: CollapseActions = useMemo(
    () => ({
      summaries: foldSummaries,
      peeked,
      peek,
      unpeek,
      setCollapsed,
    }),
    [foldSummaries, peeked, peek, unpeek, setCollapsed],
  );

  // Drops the selection, leaving nodes and lines alone when there was none.
  const clearSelection = useCallback(() => {
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
  }, [setNodes, setEdges]);

  // Switching tools drops anything half-finished, and a drawing tool clears
  // the selection, whose resize handles and toolbars would otherwise get in
  // the way.
  useEffect(() => {
    if (tool !== "select") {
      clearSelection();
      setSelectArea(false);
    }
    setPlacing(undefined);
    setHover(undefined);
    setAttachPreview(undefined);
    tapPress.current = undefined;
    longPress.current.cancel();
    setConnecting(undefined);
    setErasingStrokes(new Set());
    cancelClickConnect();
  }, [tool, clearSelection, cancelClickConnect, setPlacing, setHover]);

  // What Escape does once nothing is open: drops a comment being started, a
  // line being drawn or joined, or an erase, turns off Select area and goes
  // back to Select. A touch screen has a Cancel button for it.
  const cancelTool = useCallback(() => {
    setDraft(undefined);
    setSelectArea(false);
    setConnecting(undefined);
    setErasingStrokes(new Set());
    cancelClickConnect();
    setTool("select");
  }, [cancelClickConnect]);

  const canvasActive = useBoardFocus(wrapperRef);

  const {
    imagesEnabled,
    imagesOff,
    uploads,
    addImages,
    imageInput,
    chooseImage,
    onImageChosen,
    onDragOver,
    onDrop,
  } = useImageTool({
    boardId,
    puzzleId,
    readOnly,
    paneCenter,
    placementFor,
    updateNodes,
    showNotice,
    reportRefusal,
  });

  const {
    duplicateSelection,
    canCopyByButton,
    canPasteByButton,
    copyByButton,
    pasteByButton,
  } = useBoardClipboard({
    boardId,
    huntId,
    readOnly,
    canvasActive,
    nodes,
    edges,
    applySelection,
    frameRects,
    frameAt,
    isWithin,
    absoluteRect,
    commit,
    showNotice,
    lastPointer,
    paneCenter,
    addImages,
  });
  // The touch screen toolbar's Delete, which leaves out anything locked, as
  // the Delete key does (see onBeforeDelete).
  const deleteSelection = useCallback(() => {
    const doomedNodes = flow.getNodes().filter((n) => n.selected);
    const doomedEdges = flow.getEdges().filter((e) => e.selected);
    if (doomedNodes.length === 0 && doomedEdges.length === 0) return;
    void flow.deleteElements({ nodes: doomedNodes, edges: doomedEdges });
  }, [flow]);
  const somethingSelected =
    nodes.some((n) => n.selected) || edges.some((e) => e.selected);
  const toggleSelectArea = useCallback(() => {
    setSelectArea((current) => !current);
    setTool("select");
  }, []);

  // Whether there's anything selected to duplicate from the node toolbar:
  // nodes but no cards, which can't be copied.
  const selectedNotEnds = nodes.filter((n) => n.selected && n.type !== "point");
  const duplicable = useStableIds(
    selectedNotEnds.some((n) => n.type === "puzzle")
      ? []
      : selectedNotEnds.map((n) => n.id),
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (inDialog(event.target)) return;
      if (event.code === "Space") spaceHeld.current = true;
      // / or Ctrl+F searches the board while it has focus. Elsewhere, and
      // from the search field itself, Ctrl+F is the browser's find.
      const modified = event.ctrlKey || event.metaKey;
      // Ctrl+key (Cmd+key on a Mac) with no other modifier, while the board
      // can be edited and has focus and nothing is being typed.
      const chord = (key: string) =>
        modified &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === key &&
        !readOnly &&
        canvasActive.current &&
        !isTyping(event.target);
      const wantsSearch =
        (event.key === "/" &&
          !modified &&
          !event.altKey &&
          !isTyping(event.target)) ||
        (modified &&
          !event.shiftKey &&
          !event.altKey &&
          event.key.toLowerCase() === "f" &&
          event.target !== searchRef.current);
      if (wantsSearch && canvasActive.current && searchRef.current) {
        event.preventDefault();
        searchRef.current.focus();
        searchRef.current.select();
        return;
      }
      // Escape closes an open thread first, then the Comments list, then
      // leaves a preview, then closes History or the Outline (which also
      // closes itself on Escape from inside it); then it drops a comment being
      // started, a line being drawn or joined, or an erase, and goes back to
      // Select. The thread's panel closes itself on Escape from inside it,
      // and the restore confirmation does the same. An open Feeders popover
      // takes Escape before any of this (FeedersButton).
      if (event.key === "Escape" && !isTyping(event.target)) {
        if (confirmingRestore) return;
        if (openThreadId) {
          dismissComment();
          return;
        }
        if (commentListShown) {
          setSidePanel(undefined);
          return;
        }
        if (preview || previewLoading) {
          backToNow();
          return;
        }
        if (sidePanel === "history" || sidePanel === "outline") {
          setSidePanel(undefined);
          return;
        }
        cancelTool();
        return;
      }
      // A tool's key picks it, and 1 to 4 set the pen's width, while the
      // board has focus and nothing is being typed.
      if (
        !modified &&
        !event.altKey &&
        canvasActive.current &&
        !isTyping(event.target)
      ) {
        const key = event.key.toLowerCase();
        const keyTool = TOOLS_BY_KEY.get(key);
        if (keyTool && (keyTool === "comment" ? canComment : !readOnly)) {
          event.preventDefault();
          pickTool(keyTool);
          return;
        }
        const width = PEN_WIDTH_KEYS.get(key);
        if (width && !readOnly) {
          event.preventDefault();
          setPenWidth(width);
          return;
        }
        // N goes to the next thread with something unread, for anyone who
        // can see the board.
        if (key === "n") {
          const next = nextUnread(threadRows, openThreadId);
          if (next) {
            event.preventDefault();
            setSteppedThread(next);
            focusComment(next);
          }
          return;
        }
      }
      // Ctrl+L (Cmd+L) locks or unlocks the selection. With nothing
      // selected it's left to the browser.
      if (chord("l") && tool === "select" && lockSelection.ids.length > 0) {
        event.preventDefault();
        toggleLock();
        return;
      }
      // Ctrl+D (Cmd+D) duplicates the selection. With nothing selected or
      // another tool it's left to the browser.
      if (
        chord("d") &&
        tool === "select" &&
        (flow.getNodes().some((n) => n.selected) ||
          flow.getEdges().some((e) => e.selected))
      ) {
        event.preventDefault();
        duplicateSelection();
        return;
      }
      if (chord("a")) {
        event.preventDefault();
        setTool("select");
        selectAll();
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
        note.dataset.id &&
        !flow.getNode(note.dataset.id)?.data.doc.locked
      ) {
        event.preventDefault();
        setEditOnAppear(note.dataset.id);
        return;
      }
      // Ctrl+Z (Cmd+Z) undoes the viewer's own last edit, and Ctrl+Shift+Z
      // (Cmd+Shift+Z) or Ctrl+Y redoes it, while the board has focus and
      // nothing is being typed. Text being typed has the browser's own.
      if (
        !readOnly &&
        modified &&
        !event.altKey &&
        canvasActive.current &&
        !isTyping(event.target)
      ) {
        const key = event.key.toLowerCase();
        if (key === "z" || (key === "y" && event.ctrlKey && !event.shiftKey)) {
          event.preventDefault();
          if (key === "z" && !event.shiftKey) {
            undo();
          } else {
            redo();
          }
        }
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
  }, [
    readOnly,
    canComment,
    tool,
    undo,
    redo,
    openThreadId,
    commentListShown,
    confirmingRestore,
    preview,
    previewLoading,
    backToNow,
    sidePanel,
    dismissComment,
    cancelTool,
    selectAll,
    setPenWidth,
    threadRows,
    focusComment,
    flow,
    lockSelection,
    toggleLock,
    duplicateSelection,
    pickTool,
    canvasActive,
  ]);

  // Double-clicking a card opens its puzzle, on any board, as long as nothing
  // sits over it there. Caught before React Flow's double-click zoom.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return undefined;
    const onDoubleClick = (event: MouseEvent) => {
      if (tool !== "select" || !(event.target instanceof Element)) return;
      if (
        event.target.closest(
          `${OVERLAYS}, .react-flow__edge, .react-flow__edgelabel-renderer, a, button, input, textarea, [contenteditable="true"]`,
        )
      ) {
        return;
      }
      const at = flow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      const under = commentAnchorAt(at).node;
      const doc = under ? flow.getNode(under)?.data.doc : undefined;
      if (doc?.type !== "puzzle" || !doc.puzzle) return;
      event.preventDefault();
      event.stopPropagation();
      void navigate(`/hunts/${huntId}/puzzles/${doc.puzzle}`);
    };
    wrapper.addEventListener("dblclick", onDoubleClick, true);
    return () => wrapper.removeEventListener("dblclick", onDoubleClick, true);
  }, [tool, flow, commentAnchorAt, navigate, huntId]);

  const toggleFeederArrows = useCallback(
    () => setShowFeederArrows((current) => !current),
    [setShowFeederArrows],
  );
  const toggleHideInk = useCallback(
    () => setHideInk(!hideInk),
    [hideInk, setHideInk],
  );
  const toggleHidden = useCallback(() => togglePanel("hidden"), [togglePanel]);
  const stopCommenting = useCallback(() => {
    tapPress.current = undefined;
    setTool("select");
  }, []);
  // With a thread (or a comment being started) in the list's place, the
  // button closes it and goes back to the list.
  const toggleCommentList = useCallback(() => {
    if (commentListShown) setSidePanel(undefined);
    else openPanel("comments");
  }, [commentListShown, openPanel]);
  const toggleHistory = useCallback(
    () => togglePanel("history"),
    [togglePanel],
  );
  const outlineButtonRef = useRef<HTMLButtonElement>(null);
  // The Outline's folded rows and the row last focused in it, kept while
  // the board is open.
  const [outlineFolded, setOutlineFolded] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [outlineCurrent, setOutlineCurrent] = useState<string>();
  // An open thread or a comment being started hides the Outline, and the
  // button then closes it and brings the Outline back.
  const outlineShown = sidePanel === "outline" && !draft && !openThreadData;
  const toggleOutline = useCallback(() => {
    if (outlineShown) setSidePanel(undefined);
    else openPanel("outline");
  }, [outlineShown, openPanel]);
  // Closing the Outline from inside it puts focus back on its button.
  const closeOutline = useCallback(() => {
    closePanel("outline");
    outlineButtonRef.current?.focus();
  }, [closePanel]);

  const showVersion = useCallback(
    (version: WhiteboardVersionType) => {
      previewRequest.current += 1;
      const request = previewRequest.current;
      const failed = (reason: string) =>
        showNotice(
          t(
            "whiteboard.history.loadFailed",
            "Couldn't load that version: {{reason}}",
            { reason, ...NO_ESCAPE },
          ),
        );
      // Versions are gzipped, and only newer browsers can unpack that
      if (typeof DecompressionStream === "undefined") {
        setPreviewLoading(undefined);
        failed(
          t(
            "whiteboard.history.browserTooOld",
            "this browser can't open saved versions",
          ),
        );
        return;
      }
      setPreviewLoading(version._id);
      closeComment();
      void loadVersion(boardId, version).then(
        (loaded) => {
          if (previewRequest.current !== request) return;
          setPreviewLoading(undefined);
          setPreview(loaded);
        },
        (error: unknown) => {
          if (previewRequest.current !== request) return;
          setPreviewLoading(undefined);
          if (error instanceof Meteor.Error) {
            failed(error.reason ?? error.message);
            return;
          }
          // oxlint-disable-next-line no-console
          console.error("Couldn't load a whiteboard version", error);
          failed(t("whiteboard.history.unreadable", "it couldn't be read"));
        },
      );
    },
    [boardId, closeComment, showNotice, t],
  );
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string>();
  const askRestore = useCallback(() => {
    setRestoreError(undefined);
    setConfirmingRestore(true);
  }, []);
  const cancelRestore = useCallback(() => {
    if (!restoring) setConfirmingRestore(false);
  }, [restoring]);
  const previewTime = preview
    ? versionMoment(preview.version.createdAt, t, i18n.language)
    : "";
  const restore = useCallback(() => {
    if (!preview) return;
    const versionId = preview.version._id;
    setRestoreError(undefined);
    setRestoring(true);
    restoreWhiteboardVersion.call({ boardId, versionId }, (error) => {
      setRestoring(false);
      if (error) {
        setRestoreError(error.reason ?? error.message);
        return;
      }
      setConfirmingRestore(false);
      setPreview((current) =>
        current?.version._id === versionId ? undefined : current,
      );
      showNotice(
        t("whiteboard.history.restored", "Board restored to {{time}}.", {
          time: previewTime,
        }),
        "success",
      );
    });
  }, [preview, boardId, showNotice, t, previewTime]);

  // Nodes keep their selection by id when the board is redrawn, so opening,
  // switching or leaving a preview starts with nothing selected. Otherwise a
  // pick in a preview would stay selected on the live board, where a viewer
  // who can't edit has no way to clear it, and a live selection would offer
  // a restore before anything was picked.
  const previewVersionId = preview?.version._id;
  useEffect(() => {
    clearSelection();
  }, [previewVersionId, clearSelection]);

  // In a preview, the board as it is now, so what the version has
  // differently can be marked. Nodes and lines are matched by what they are,
  // as a restore matches them. A lock is only marked for an operator, since
  // only their Restore this version changes locks.
  const liveBoard = useTracker(
    () =>
      preview
        ? {
            nodes: WhiteboardNodes.find({ board: boardId }).fetch(),
            edges: WhiteboardEdges.find({ board: boardId }).fetch(),
          }
        : undefined,
    [preview, boardId],
  );
  // Restoring a version replaces the board's ink with the version's, which a
  // viewer hiding ink can't see in the preview, so the banner says so.
  const inkHiddenInPreview =
    hideInk &&
    !!preview &&
    [...preview.nodes, ...(liveBoard?.nodes ?? [])].some(
      (n) => n.type === "ink",
    );
  const changed = useMemo(
    () =>
      shownPreview && liveBoard
        ? versionDifferences(liveBoard, shownPreview, { locks: isOperator })
        : NO_CHANGES,
    [shownPreview, liveBoard, isOperator],
  );
  const shownNodes = useMemo(() => {
    if (capturing) {
      return nodes.map((n) => (n.selected ? { ...n, selected: false } : n));
    }
    const shown = (
      changed.size === 0
        ? nodes
        : nodes.map((n) =>
            changed.has(n.id) ? { ...n, className: CHANGED_CLASS } : n,
          )
    ).map(keepSelectedShapeDown);
    return coarse ? shown.map(dragOnlySelected) : shown;
  }, [nodes, changed, capturing, coarse]);
  const shownEdges = useMemo(() => {
    if (capturing) {
      return edges.map((e) => (e.selected ? { ...e, selected: false } : e));
    }
    return changed.size === 0
      ? edges
      : edges.map((e) =>
          changed.has(e.id) ? { ...e, className: CHANGED_CLASS } : e,
        );
  }, [edges, changed, capturing]);

  // The one thing picked in a preview (a node, or a whole ink stroke), which
  // can be put back on its own, and whether it brings too much with it to
  // restore at once.
  const previewPick = useMemo(() => {
    if (!preview) return undefined;
    const pick = pickToRestore(
      nodes.filter((n) => n.selected).map((n) => n.data.doc),
    );
    if (!pick) return undefined;
    const items = restoreItemSet(preview, pick.ids);
    return {
      ...pick,
      tooBig:
        !items || items.nodes.size > MAX_BATCH || items.edges.size > MAX_BATCH,
    };
  }, [preview, nodes]);
  const [restoringItem, setRestoringItem] = useState(false);
  const restoreItem = useCallback(() => {
    if (!preview || !previewPick) return;
    setRestoringItem(true);
    restoreWhiteboardItems.call(
      {
        boardId,
        versionId: preview.version._id,
        nodeIds: previewPick.ids,
      },
      (error, result) => {
        setRestoringItem(false);
        if (error) {
          reportRefusal(error);
          return;
        }
        const restored = result?.restored;
        showNotice(
          restored
            ? t(
                "whiteboard.history.restoredItem",
                "Put back as it was at {{time}}.",
                { time: previewTime },
              )
            : t(
                "whiteboard.history.itemUnchanged",
                "That's already as it was at {{time}}.",
                { time: previewTime },
              ),
          restored ? "success" : "warning",
        );
      },
    );
  }, [
    preview,
    previewPick,
    boardId,
    reportRefusal,
    showNotice,
    t,
    previewTime,
  ]);

  // Reset layout records the board first so History can undo it, so it's
  // only offered while history is on.
  const historyOn = useTracker(
    () => !Flags.active("disable.whiteboard_versions"),
    [],
  );
  // Rounds that are finished and still open, for Collapse finished rounds.
  // A batch of nothing but collapses records no version, so it needs no
  // history.
  const finishedOpen = useMemo(
    () => finishedFrames(nodeDocs, rounds),
    [nodeDocs, rounds],
  );
  const collapseFinished = useCallback(
    () => setFramesCollapsed(finishedOpen, true),
    [setFramesCollapsed, finishedOpen],
  );
  const [resettingLayout, setResettingLayout] = useState(false);
  const openResetLayout = useCallback(() => setResettingLayout(true), []);
  const closeResetLayout = useCallback(() => setResettingLayout(false), []);
  const layoutReset = useCallback(() => {
    setResettingLayout(false);
    showNotice(
      t("whiteboard.reset.done", "Layout reset. Undo it from History."),
      "success",
      {
        label: t("whiteboard.reset.openHistory", "Open History"),
        onClick: () => openPanel("history"),
      },
    );
  }, [showNotice, t, openPanel]);

  // A phone-sized screen has no history (see historyButton), so a preview
  // or the panel open when the screen shrinks goes.
  useEffect(() => {
    if (!compact) return;
    backToNow();
    closePanel("history");
  }, [compact, backToNow, closePanel]);
  const onPenWidth = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const width = WhiteboardStrokeWidths.find(
        (w) => w === event.target.value,
      );
      if (width) setPenWidth(width);
    },
    [setPenWidth],
  );
  const onShapeKind = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const shape = WhiteboardShapes.find((k) => k === event.target.value);
      if (shape) setShapeKind(shape);
    },
    [setShapeKind],
  );
  const drawingTool = tool !== "select";
  // What the touch screen toolbar's Cancel drops, as Escape would.
  const toolInUse =
    drawingTool ||
    selectingArea ||
    !!draft ||
    !!connecting ||
    !!clickConnectStart;
  const deleteTitle = t("whiteboard.toolbar.delete", "Delete");
  const copyTitle = t("whiteboard.toolbar.copy", "Copy");
  const pasteTitle = t("whiteboard.toolbar.paste", "Paste");
  const duplicateTitle = t("whiteboard.duplicate.button", "Duplicate");
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
  // Being offline gets a banner of its own rather than a reason.
  const offlineText = t(
    "whiteboard.offline",
    "Offline: the board is view-only until you reconnect",
  );
  const accessReasons: Record<
    Exclude<WhiteboardAccessReason, "offline">,
    string
  > = {
    archived: t("whiteboard.toolbar.reason.archived", "This hunt is archived."),
    operators: t(
      "whiteboard.toolbar.reason.operators",
      "Only operators can edit this board.",
    ),
    operatorsAndEditors: t(
      "whiteboard.toolbar.reason.operatorsAndEditors",
      "Only operators and people they've chosen can edit this board.",
    ),
    narrow: t(
      "whiteboard.toolbar.reason.narrow",
      "Editing needs a wider screen. You can still comment.",
    ),
  };
  const boardNotices = (
    <BoardNotices
      offline={accessReason === "offline"}
      accessNotice={accessNotice}
      onDismissAccessNotice={dismissAccessNotice}
      saveError={saveError}
      onDismissSaveError={dismissSaveError}
      notice={notice}
      onDismissNotice={dismissNotice}
      onFollowNotice={followNotice}
    />
  );
  const outlineTitle = t("whiteboard.outline.title", "Outline");
  const searchTools = (
    <>
      <BoardSearch
        boardId={boardId}
        huntId={huntId}
        shownLines={shownLines}
        canPutBack={!readOnly}
        inputRef={searchRef}
        onShow={showSearchHit}
        onPutBack={putBackSearchHit}
      />
      <OutlineButton
        ref={outlineButtonRef}
        size="sm"
        variant={outlineShown ? "secondary" : "outline-secondary"}
        $compact={compact}
        onClick={toggleOutline}
        title={outlineTitle}
        aria-label={outlineTitle}
        aria-pressed={outlineShown}
      >
        <FontAwesomeIcon icon={faSitemap} />
      </OutlineButton>
      <CopyToClipboardButton
        size="sm"
        variant="outline-secondary"
        text={linkToHere}
        tooltipText={t(
          "whiteboard.toolbar.copyLinkHelp",
          "Copy a link to what's selected, or to this view",
        )}
        aria-label={t("whiteboard.toolbar.copyLink", "Copy link to here")}
      >
        <FontAwesomeIcon icon={faLink} />
      </CopyToClipboardButton>
    </>
  );
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
    marker: t("whiteboard.toolbar.penWidthMarker", "Highlighter"),
  };
  const shapeNames: Record<WhiteboardShape, string> = {
    rect: t("whiteboard.shape.rect", "Rectangle"),
    ellipse: t("whiteboard.shape.ellipse", "Ellipse"),
  };
  const feederArrowsTitle = t(
    "whiteboard.toolbar.feederArrows",
    "Show feeder arrows",
  );
  const hideInkTitle = t("whiteboard.toolbar.hideInk", "Hide ink");
  const hideInkButton = (
    <Button
      variant={hideInk ? "secondary" : "outline-secondary"}
      onClick={toggleHideInk}
      title={hideInkTitle}
      aria-label={hideInkTitle}
      aria-pressed={hideInk}
    >
      <FontAwesomeIcon icon={faSignature} />
    </Button>
  );
  const notOnBoardTitle = t(
    "whiteboard.toolbar.notOnBoard",
    "Not on the board",
  );
  const notOnBoardLabel =
    notOnBoardCount > 0
      ? t(
          "whiteboard.toolbar.notOnBoardCount",
          "Not on the board ({{count}})",
          { count: notOnBoardCount },
        )
      : notOnBoardTitle;
  const commentListTitle = t("whiteboard.toolbar.commentList", "Comments");
  const commentListHint = t(
    "whiteboard.toolbar.commentListHint",
    "Comments (N goes to the next unread)",
  );
  // On a board that can't be commented on there's no Comment tool to carry
  // the unread count, so this does.
  const listUnread = canComment ? 0 : unreadCount;
  const commentListButton = (
    <Button
      variant={commentListShown ? "secondary" : "outline-secondary"}
      onClick={toggleCommentList}
      title={commentListHint}
      aria-keyshortcuts="N"
      aria-label={
        listUnread > 0
          ? t(
              "whiteboard.toolbar.commentUnread",
              "{{title}} ({{count}} unread)",
              { title: commentListTitle, count: listUnread, ...NO_ESCAPE },
            )
          : commentListTitle
      }
      aria-pressed={commentListShown}
    >
      <FontAwesomeIcon icon={faComments} />
      <UnreadBadge count={listUnread} />
    </Button>
  );
  const huntName = useTracker(() => Hunts.findOne(huntId)?.name, [huntId]);
  // Downloads the board: a picture of it as it's shown (without ink while
  // ink is hidden, and the version while one is previewed), or its data as
  // it's stored, ink and all.
  const download = useCallback(
    async (kind: DownloadKind) => {
      if (kind === "json" && typeof DecompressionStream === "undefined") {
        showNotice(
          t(
            "whiteboard.download.browserTooOld",
            "Couldn't download the board: this browser can't unpack it.",
          ),
        );
        return;
      }
      setExporting(kind);
      try {
        if (kind === "json") {
          const json = await fetchBoardJson(boardId);
          saveBlob(
            new Blob([json], { type: "application/json" }),
            exportFileName(huntName, new Date(), "json"),
          );
          return;
        }
        const drawn = flow.getNodes().filter((n) => !n.hidden);
        // Nodes that were out of view are drawn now, and measured before
        // their lines are drawn.
        for (let frame = 0; frame < EXPORT_WAIT_FRAMES; frame++) {
          await nextFrame();
          if (
            drawn.every((n) => flow.getInternalNode(n.id)?.measured.width) &&
            frame > 1
          ) {
            break;
          }
        }
        const viewport = wrapperRef.current?.querySelector<HTMLElement>(
          ".react-flow__viewport",
        );
        if (!viewport) return;
        const png = await boardPng(
          viewport,
          flow.getNodesBounds(drawn),
          theme.colors.whiteboardBackground,
        );
        saveBlob(png, exportFileName(huntName, new Date(), "png"));
      } catch (error) {
        if (error instanceof BoardChangedError) {
          showNotice(
            t(
              "whiteboard.download.changed",
              "Couldn't download the board: it changed while it was downloading. Try again.",
            ),
          );
        } else if (error instanceof Meteor.Error) {
          showNotice(
            t(
              "whiteboard.download.failed",
              "Couldn't download the board: {{reason}}",
              { reason: error.reason ?? error.message, ...NO_ESCAPE },
            ),
          );
        } else {
          // oxlint-disable-next-line no-console
          console.error("Couldn't download the whiteboard", error);
          showNotice(
            t(
              "whiteboard.download.unknownError",
              "Couldn't download the board. Try again.",
            ),
          );
        }
      } finally {
        setExporting(undefined);
      }
    },
    [boardId, flow, huntName, showNotice, t, theme],
  );
  // Not on a phone, which shows the board read-only and small.
  const downloadButton = compact ? null : (
    <DownloadButton busy={!!exporting} onDownload={download} />
  );
  const historyTitle = t("whiteboard.history.title", "History");
  // Not on a phone, where the board can't be restored and a preview would
  // cover it.
  const historyButton = compact ? null : (
    <Button
      variant={sidePanel === "history" ? "secondary" : "outline-secondary"}
      onClick={toggleHistory}
      title={historyTitle}
      aria-label={historyTitle}
      aria-pressed={sidePanel === "history"}
    >
      <FontAwesomeIcon icon={faClockRotateLeft} />
    </Button>
  );
  const restoreBlocked =
    access === "edit"
      ? undefined
      : accessReason === "archived"
        ? t("whiteboard.history.archived", "This hunt is archived.")
        : accessReason === "offline"
          ? offlineText
          : t(
              "whiteboard.history.cantEdit",
              "Only people who can edit the board can restore it.",
            );
  // A frame with too much in it can't be put back in one go.
  const restoreItemBlocked =
    restoreBlocked ??
    (previewPick?.tooBig
      ? t("whiteboard.history.tooBig", "That's too much to restore at once.")
      : undefined);
  const restoreLabel = t(
    "whiteboard.history.restoreButton",
    "Restore this version",
  );
  let lockTitle: string;
  if (lockSelection.blocked) {
    lockTitle = cantUnlock;
  } else if (lockSelection.ids.length === 0) {
    lockTitle = t(
      "whiteboard.lock.nothingSelected",
      "Lock: select something to lock it [Ctrl/⌘+L]",
    );
  } else if (lockSelection.lock) {
    lockTitle = t(
      "whiteboard.lock.lockTitle",
      "Lock what's selected, so it can't be moved, resized, edited or deleted [Ctrl/⌘+L]",
    );
  } else {
    lockTitle = t(
      "whiteboard.lock.unlockTitle",
      "Unlock what's selected [Ctrl/⌘+L]",
    );
  }
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
      <RemoteEditingContext value={othersEditing}>
        <PuzzlePeopleProvider huntId={huntId}>
          <FeederFocusContext value={feederFocusIds}>
            <RoundStateContext value={rounds}>
              <CollapseContext value={collapseActions}>
                <CanvasWrapper
                  ref={wrapperRef}
                  $tool={tool}
                  $readOnly={readOnly}
                  $whosHereHeight={whosHereHeight}
                  $coarse={coarse}
                  $clickConnecting={!!clickConnectStart}
                  onPointerDownCapture={onPointerDownCapture}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerCancel}
                  onPointerLeave={onPointerLeave}
                  onMouseDownCapture={onTapFollowUp}
                  onClickCapture={onTapFollowUp}
                  onContextMenu={onContextMenu}
                  onDragOver={onDragOver}
                  onDrop={onDrop}
                >
                  {coarse && !readOnly && (
                    <KeyboardCatcher
                      ref={keyboardCatcher}
                      tabIndex={-1}
                      aria-hidden
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      onBlur={clearKeyboardCatcher}
                    />
                  )}
                  <ReactFlow<WhiteboardFlowNode, WhiteboardFlowEdge>
                    nodes={
                      fitsOnOpen && !loadedOnce ? NO_FLOW_NODES : shownNodes
                    }
                    edges={shownEdges}
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
                    onNodeMouseEnter={onNodeMouseEnter}
                    onNodeMouseLeave={onNodeMouseLeave}
                    onMoveStart={onMoveStart}
                    onMove={onMove}
                    onMoveEnd={onMoveEnd}
                    connectionMode={ConnectionMode.Loose}
                    // onConnectEnd decides where a line from a handle ends, so the
                    // line being dragged shouldn't snap to a nearby handle either.
                    connectionRadius={0}
                    colorMode={theme.basicMode === "dark" ? "dark" : "light"}
                    defaultViewport={initialViewport}
                    fitView={fitsOnOpen}
                    minZoom={MIN_ZOOM}
                    maxZoom={MAX_ZOOM}
                    nodesDraggable={!readOnly && !drawingTool}
                    nodesConnectable={!readOnly && !drawingTool}
                    // A preview can't be changed, but a node in it can be picked
                    // to restore on its own.
                    elementsSelectable={
                      (!readOnly || !!preview) && !drawingTool
                    }
                    panOnDrag={fingerPans}
                    selectionOnDrag={selectingArea}
                    // A finger wobbles, so on a touch screen a node only moves
                    // once it's dragged as far as a tap could go.
                    nodeDragThreshold={coarse ? TOUCH_SLOP : 1}
                    deleteKeyCode={readOnly ? null : ["Backspace", "Delete"]}
                    onlyRenderVisibleElements={!capturing}
                    ariaLabelConfig={ariaLabelConfig}
                  >
                    <Background />
                    {coarse && <TouchTargetSize wrapperRef={wrapperRef} />}
                    {coarse && typingIn && (
                      <KeepAboveKeyboard nodeId={typingIn} />
                    )}
                    <Controls showInteractive={false} />
                    {showMiniMap && (
                      <MiniMap<WhiteboardFlowNode>
                        pannable
                        zoomable
                        nodeColor={miniMapNodeColor}
                      />
                    )}
                    <FrameLabelLayer />
                    {!preview && !capturing && (
                      <RemoteSelectionLayer
                        boardId={boardId}
                        liveEnabled={liveEnabled}
                      />
                    )}
                    {!preview && !capturing && (
                      <CursorLayer
                        boardId={boardId}
                        liveEnabled={liveEnabled}
                      />
                    )}
                    <ViewSender
                      enabled={liveEnabled && mayComment && !preview}
                      setView={live.setView}
                    />
                    {liveEnabled && (
                      <WhosHere
                        boardId={boardId}
                        sending={mayComment}
                        paused={!!preview}
                        compact={compact}
                        setFollowedUser={live.setFollowedUser}
                        movesRef={viewportMoves}
                        onHeight={setWhosHereHeight}
                      />
                    )}
                    <CommentLayer
                      pins={preview || capturing ? NO_PINS : commentPins}
                      openId={openThreadId ?? (draft ? "draft" : undefined)}
                      pulseId={pulse}
                      onOpen={openComment}
                    />
                    {nodePulse && !capturing && (
                      <NodePulse
                        node={nodePulse.node}
                        point={nodePulse.point}
                      />
                    )}
                    {!capturing &&
                      localStroke &&
                      localStroke.points.length > 0 && (
                        <ViewportPortal>
                          <LocalStroke
                            $marker={localStroke.strokeWidth === "marker"}
                          >
                            <path
                              d={inkPath(
                                localStroke.points,
                                localStroke.strokeWidth,
                                false,
                              )}
                              fill={
                                colors.stroke[localStroke.color] ??
                                theme.colors.text
                              }
                              fillOpacity={strokeOpacity(
                                localStroke.strokeWidth,
                              )}
                            />
                          </LocalStroke>
                        </ViewportPortal>
                      )}
                    {!capturing && lineFrom && lineTo && (
                      <ViewportPortal>
                        <LocalStroke>
                          {lineOrigin && (
                            <AttachOutline key={lineOrigin} id={lineOrigin} />
                          )}
                          {lineAttached && lineAttached !== lineOrigin && (
                            <AttachOutline
                              key={lineAttached}
                              id={lineAttached}
                            />
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
                    {!capturing && clickConnectStart && clickConnectOrigin && (
                      <ViewportPortal>
                        <LocalStroke className="jr-click-connect">
                          <AttachOutline id={clickConnectStart.nodeId} />
                          {clickConnectPointer && (
                            <line
                              x1={clickConnectOrigin.x}
                              y1={clickConnectOrigin.y}
                              x2={clickConnectPointer.x}
                              y2={clickConnectPointer.y}
                              stroke={theme.colors.primary}
                              strokeWidth={2}
                              strokeDasharray="6 4"
                            />
                          )}
                        </LocalStroke>
                      </ViewportPortal>
                    )}
                    {!capturing && !connecting && attachPreview && (
                      <ViewportPortal>
                        <LocalStroke>
                          <AttachOutline id={attachPreview} />
                        </LocalStroke>
                      </ViewportPortal>
                    )}
                    {!capturing && uploads.length > 0 && (
                      <ViewportPortal>
                        {uploads.map((upload) => (
                          <UploadPlaceholder
                            key={upload.id}
                            className="jr-image-uploading"
                            aria-label={t(
                              "whiteboard.image.uploading",
                              "Uploading image",
                            )}
                            style={{
                              transform: `translate(${upload.x}px, ${upload.y}px)`,
                              width: upload.width,
                              height: upload.height,
                            }}
                          >
                            <Spinner animation="border" />
                          </UploadPlaceholder>
                        ))}
                      </ViewportPortal>
                    )}
                    {!capturing && isPlaceTool(tool) && placeGhost && (
                      <ViewportPortal>
                        <PlaceGhost
                          $tool={tool}
                          $ellipse={tool === "shape" && shapeKind === "ellipse"}
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
                          {searchTools}
                          <ReadOnlyNote>
                            <span>
                              {t(
                                "whiteboard.toolbar.viewingOnly",
                                "Viewing only",
                              )}
                            </span>
                            {accessReason && accessReason !== "offline" && (
                              <ReadOnlyReason>
                                {accessReasons[accessReason]}
                              </ReadOnlyReason>
                            )}
                          </ReadOnlyNote>
                          <ReadOnlyButtons size="sm" $compact={compact}>
                            {canComment && (
                              <CommentToolButton
                                active={tool === "comment"}
                                unread={unreadCount}
                                onSelect={pickTool}
                              />
                            )}
                            {commentListButton}
                            {resolvedCount > 0 && (
                              <Button
                                variant={
                                  showResolved
                                    ? "secondary"
                                    : "outline-secondary"
                                }
                                onClick={toggleShowResolved}
                                title={showResolvedTitle}
                                aria-label={showResolvedLabel}
                                aria-pressed={showResolved}
                              >
                                <FontAwesomeIcon icon={faCircleCheck} />{" "}
                                {resolvedCount}
                              </Button>
                            )}
                            {hideInkButton}
                            {historyButton}
                            {downloadButton}
                          </ReadOnlyButtons>
                          {mayChangeEditPolicy && !compact && (
                            <EditPolicyButton
                              policy={editPolicy}
                              onClick={openEditPolicy}
                            />
                          )}
                        </ToolBox>
                        {compact && tool === "comment" && (
                          <CommentHint>
                            <span>
                              {t(
                                "whiteboard.toolbar.commentHint",
                                "Tap where your comment goes",
                              )}
                            </span>
                            <Button
                              variant="outline-secondary"
                              onClick={stopCommenting}
                            >
                              {t("common.cancel", "Cancel")}
                            </Button>
                          </CommentHint>
                        )}
                        {boardNotices}
                      </Panel>
                    ) : (
                      <Panel position="top-left">
                        <ToolBox>
                          {searchTools}
                          <ButtonGroup size="sm">
                            <ToolButton
                              tool="select"
                              active={tool === "select"}
                              onSelect={pickTool}
                              title={
                                coarse
                                  ? t(
                                      "whiteboard.toolbar.selectTouch",
                                      "Select and move (long press to add)",
                                    )
                                  : t(
                                      "whiteboard.toolbar.select",
                                      "Select and move (Shift-drag to select an area, Ctrl/⌘-click to add; Ctrl/⌘+C, Ctrl/⌘+V and Ctrl/⌘+D copy, paste and duplicate)",
                                    )
                              }
                            >
                              <FontAwesomeIcon icon={faArrowPointer} />
                            </ToolButton>
                            <ToolButton
                              tool="pen"
                              active={tool === "pen"}
                              onSelect={pickTool}
                              title={
                                coarse
                                  ? t(
                                      "whiteboard.toolbar.penTouch",
                                      "Draw (two fingers pan)",
                                    )
                                  : t(
                                      "whiteboard.toolbar.pen",
                                      "Draw (hold Space to pan)",
                                    )
                              }
                            >
                              <FontAwesomeIcon
                                icon={
                                  penWidth === "marker" ? faHighlighter : faPen
                                }
                              />
                            </ToolButton>
                            <ToolButton
                              tool="eraser"
                              active={tool === "eraser"}
                              onSelect={pickTool}
                              title={t(
                                "whiteboard.toolbar.eraser",
                                "Erase strokes",
                              )}
                            >
                              <FontAwesomeIcon icon={faEraser} />
                            </ToolButton>
                            <ToolButton
                              tool="connector"
                              active={tool === "connector"}
                              onSelect={pickTool}
                              title={t(
                                "whiteboard.toolbar.line",
                                "Line: drag between two things to connect them, or anywhere for a free line (Shift snaps the angle)",
                              )}
                            >
                              <LineStyleIcon kind="end" />
                            </ToolButton>
                          </ButtonGroup>
                          {coarse && (
                            <Button
                              size="sm"
                              variant={
                                selectingArea
                                  ? "secondary"
                                  : "outline-secondary"
                              }
                              onClick={toggleSelectArea}
                              aria-pressed={selectingArea}
                              title={t(
                                "whiteboard.toolbar.selectAreaHelp",
                                "Drag on the board to draw a box and select what's inside it, instead of panning",
                              )}
                            >
                              {t(
                                "whiteboard.toolbar.selectArea",
                                "Select area",
                              )}
                            </Button>
                          )}
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
                              <ToolSelect
                                size="sm"
                                value={penWidth}
                                onChange={onPenWidth}
                                title={t(
                                  "whiteboard.toolbar.penWidthKeys",
                                  "Pen width [1, 2, 3, 4]",
                                )}
                                aria-label={t(
                                  "whiteboard.toolbar.penWidth",
                                  "Pen width",
                                )}
                                aria-keyshortcuts="1 2 3 4"
                              >
                                {WhiteboardStrokeWidths.map((w) => (
                                  <option key={w} value={w}>
                                    {penWidthNames[w]}
                                  </option>
                                ))}
                              </ToolSelect>
                            </>
                          )}
                          <ButtonGroup size="sm">
                            <ToolButton
                              tool="sticky"
                              active={tool === "sticky"}
                              onSelect={pickTool}
                              title={
                                coarse
                                  ? t(
                                      "whiteboard.toolbar.stickyTouch",
                                      "Sticky note: tap to place",
                                    )
                                  : t(
                                      "whiteboard.toolbar.sticky",
                                      "Sticky note: click to place, or drag to size",
                                    )
                              }
                            >
                              <FontAwesomeIcon icon={faNoteSticky} />
                            </ToolButton>
                            <ToolButton
                              tool="text"
                              active={tool === "text"}
                              onSelect={pickTool}
                              title={
                                coarse
                                  ? t(
                                      "whiteboard.toolbar.textTouch",
                                      "Text: tap to place",
                                    )
                                  : t(
                                      "whiteboard.toolbar.text",
                                      "Text: click to place, or drag to size",
                                    )
                              }
                            >
                              <FontAwesomeIcon icon={faFont} />
                            </ToolButton>
                            <ToolButton
                              tool="frame"
                              active={tool === "frame"}
                              onSelect={pickTool}
                              title={
                                coarse
                                  ? t(
                                      "whiteboard.toolbar.frameTouch",
                                      "Frame: tap to place",
                                    )
                                  : t(
                                      "whiteboard.toolbar.frame",
                                      "Frame: click to place, or drag to size",
                                    )
                              }
                            >
                              <FontAwesomeIcon icon={faObjectGroup} />
                            </ToolButton>
                            <ToolButton
                              tool="shape"
                              active={tool === "shape"}
                              onSelect={pickTool}
                              title={
                                coarse
                                  ? t(
                                      "whiteboard.toolbar.shapeTouch",
                                      "Shape: tap to place",
                                    )
                                  : t(
                                      "whiteboard.toolbar.shape",
                                      "Shape: click to place, or drag to size",
                                    )
                              }
                            >
                              <FontAwesomeIcon icon={faShapes} />
                            </ToolButton>
                          </ButtonGroup>
                          {tool === "shape" && (
                            <ToolSelect
                              size="sm"
                              value={shapeKind}
                              onChange={onShapeKind}
                              aria-label={t(
                                "whiteboard.toolbar.shapeKind",
                                "Shape",
                              )}
                            >
                              {WhiteboardShapes.map((k) => (
                                <option key={k} value={k}>
                                  {shapeNames[k]}
                                </option>
                              ))}
                            </ToolSelect>
                          )}
                          {/* A disabled button gets no hover, so the reason
                            goes on a wrapper */}
                          <span
                            title={imagesEnabled ? undefined : imagesOff}
                            className="d-inline-block"
                          >
                            <Button
                              size="sm"
                              variant="outline-secondary"
                              onClick={chooseImage}
                              disabled={!imagesEnabled}
                              title={
                                imagesEnabled
                                  ? t(
                                      "whiteboard.toolbar.imageHelp",
                                      "Image: pick a file to add in the middle of the view, or paste or drop one on the board",
                                    )
                                  : imagesOff
                              }
                              aria-label={t(
                                "whiteboard.toolbar.image",
                                "Image",
                              )}
                            >
                              <FontAwesomeIcon icon={faImage} />
                            </Button>
                          </span>
                          <input
                            ref={imageInput}
                            className="jr-image-tool-input"
                            type="file"
                            accept="image/*"
                            multiple
                            hidden
                            onChange={onImageChosen}
                          />
                          <ButtonGroup size="sm">
                            <Button
                              variant="outline-secondary"
                              onClick={undo}
                              disabled={!canUndo}
                              title={t(
                                "whiteboard.toolbar.undoKeys",
                                "Undo your last change [Ctrl/⌘+Z]",
                              )}
                              aria-label={t("whiteboard.toolbar.undo", "Undo")}
                              aria-keyshortcuts="Control+Z Meta+Z"
                            >
                              <FontAwesomeIcon icon={faRotateLeft} />
                            </Button>
                            <Button
                              variant="outline-secondary"
                              onClick={redo}
                              disabled={!canRedo}
                              title={t(
                                "whiteboard.toolbar.redoKeys",
                                "Redo what you last undid [Ctrl/⌘+Shift+Z or Ctrl+Y]",
                              )}
                              aria-label={t("whiteboard.toolbar.redo", "Redo")}
                              aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y"
                            >
                              <FontAwesomeIcon icon={faRotateRight} />
                            </Button>
                          </ButtonGroup>
                          {coarse && (
                            <ButtonGroup size="sm">
                              <Button
                                variant="outline-secondary"
                                onClick={deleteSelection}
                                disabled={!somethingSelected}
                                title={deleteTitle}
                                aria-label={deleteTitle}
                              >
                                <FontAwesomeIcon icon={faTrashCan} />
                              </Button>
                              {canCopyByButton && (
                                <Button
                                  variant="outline-secondary"
                                  onClick={copyByButton}
                                  disabled={!somethingSelected}
                                  title={copyTitle}
                                  aria-label={copyTitle}
                                >
                                  <FontAwesomeIcon icon={faCopy} />
                                </Button>
                              )}
                              {canPasteByButton && (
                                <Button
                                  variant="outline-secondary"
                                  onClick={pasteByButton}
                                  title={pasteTitle}
                                  aria-label={pasteTitle}
                                >
                                  <FontAwesomeIcon icon={faPaste} />
                                </Button>
                              )}
                              <Button
                                variant="outline-secondary"
                                onClick={duplicateSelection}
                                disabled={!somethingSelected}
                                title={duplicateTitle}
                                aria-label={duplicateTitle}
                              >
                                <FontAwesomeIcon icon={faClone} />
                              </Button>
                            </ButtonGroup>
                          )}
                          {coarse && toolInUse && (
                            <Button
                              size="sm"
                              variant="outline-secondary"
                              onClick={cancelTool}
                            >
                              {t("common.cancel", "Cancel")}
                            </Button>
                          )}
                          <span title={lockTitle} className="d-inline-block">
                            <Button
                              size="sm"
                              variant="outline-secondary"
                              onClick={toggleLock}
                              disabled={
                                lockSelection.ids.length === 0 ||
                                lockSelection.blocked
                              }
                              title={lockTitle}
                              aria-label={
                                lockSelection.lock
                                  ? t("whiteboard.lock.lock", "Lock")
                                  : t("whiteboard.lock.unlock", "Unlock")
                              }
                              aria-keyshortcuts="Control+L Meta+L"
                            >
                              <FontAwesomeIcon
                                icon={lockSelection.lock ? faLock : faLockOpen}
                              />
                            </Button>
                          </span>
                          <ButtonGroup size="sm">
                            <CommentToolButton
                              active={tool === "comment"}
                              unread={unreadCount}
                              onSelect={pickTool}
                            />
                            {commentListButton}
                            <Button
                              variant={
                                showResolved ? "secondary" : "outline-secondary"
                              }
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
                                showFeederArrows
                                  ? "secondary"
                                  : "outline-secondary"
                              }
                              onClick={toggleFeederArrows}
                              title={feederArrowsTitle}
                              aria-label={feederArrowsTitle}
                              aria-pressed={showFeederArrows}
                            >
                              <FontAwesomeIcon icon={faDiagramProject} />
                            </Button>
                            {hideInkButton}
                            <Button
                              variant={
                                sidePanel === "hidden"
                                  ? "secondary"
                                  : "outline-secondary"
                              }
                              onClick={toggleHidden}
                              title={notOnBoardTitle}
                              aria-label={notOnBoardLabel}
                              aria-pressed={sidePanel === "hidden"}
                            >
                              <FontAwesomeIcon icon={faEyeSlash} />
                              {notOnBoardCount > 0 && ` ${notOnBoardCount}`}
                            </Button>
                            {historyButton}
                            {downloadButton}
                            {historyOn && (
                              <ResetLayoutButton onClick={openResetLayout} />
                            )}
                            {isOperator && (
                              <LockLayoutButtons
                                boardId={boardId}
                                onRefused={reportRefusal}
                              />
                            )}
                            {finishedOpen.length > 0 && (
                              <Button
                                variant="outline-secondary"
                                onClick={collapseFinished}
                                title={t(
                                  "whiteboard.toolbar.collapseFinishedTitle",
                                  "Fold every round whose metas are solved",
                                )}
                                aria-label={t(
                                  "whiteboard.toolbar.collapseFinished",
                                  "Collapse finished rounds",
                                )}
                              >
                                <FontAwesomeIcon icon={faCompress} />
                              </Button>
                            )}
                          </ButtonGroup>
                          {mayChangeEditPolicy && (
                            <EditPolicyButton
                              policy={editPolicy}
                              onClick={openEditPolicy}
                            />
                          )}
                        </ToolBox>
                        {boardNotices}
                      </Panel>
                    )}
                    {!readOnly &&
                      tool === "select" &&
                      placeableCards.length > 0 && (
                        <NodeToolbar
                          nodeId={placeableCards}
                          isVisible
                          position={Position.Top}
                        >
                          <ToolBox>
                            <Button
                              size="sm"
                              variant="outline-secondary"
                              onClick={placeSelectedByTags}
                              disabled={placingByTags}
                              title={t(
                                "whiteboard.placeByTags.title",
                                "Move back to where its tags put it, and keep it in step from now on",
                              )}
                            >
                              {t(
                                "whiteboard.placeByTags.button",
                                "Place by tags",
                              )}
                            </Button>
                          </ToolBox>
                        </NodeToolbar>
                      )}
                    {!readOnly &&
                      tool === "select" &&
                      duplicable.length > 0 && (
                        <NodeToolbar
                          nodeId={duplicable}
                          isVisible
                          position={Position.Bottom}
                        >
                          <ToolBox>
                            <Button
                              size="sm"
                              variant="outline-secondary"
                              onClick={duplicateSelection}
                              aria-keyshortcuts="Control+D Meta+D"
                              title={t(
                                "whiteboard.duplicate.title",
                                "Duplicate what's selected, a little below and to the right [Ctrl/⌘+D]",
                              )}
                            >
                              {t("whiteboard.duplicate.button", "Duplicate")}
                            </Button>
                          </ToolBox>
                        </NodeToolbar>
                      )}
                    {preview && !compact && previewPick && (
                      <NodeToolbar
                        nodeId={previewPick.ids[0]}
                        isVisible
                        position={Position.Top}
                      >
                        <PreviewItemBox>
                          <Button
                            size="sm"
                            variant="primary"
                            disabled={!!restoreItemBlocked || restoringItem}
                            onClick={restoreItem}
                          >
                            {previewPick.frame
                              ? t(
                                  "whiteboard.history.restoreFrame",
                                  "Restore this frame and everything in it as it was at {{time}}",
                                  { time: previewTime },
                                )
                              : t(
                                  "whiteboard.history.restoreItem",
                                  "Restore this item",
                                )}
                          </Button>
                          {restoreItemBlocked && (
                            <ReadOnlyReason>
                              {restoreItemBlocked}
                            </ReadOnlyReason>
                          )}
                        </PreviewItemBox>
                      </NodeToolbar>
                    )}
                    {!readOnly &&
                      tool === "select" &&
                      selectedLines.length > 0 && (
                        <Panel position="bottom-center">
                          <ToolBox>
                            <LineStyleControls
                              value={selectedLineStyle}
                              onChange={restyleLines}
                            />
                          </ToolBox>
                        </Panel>
                      )}
                    {!readOnly &&
                      tool === "select" &&
                      selectedUnitCount >= 2 && (
                        <ArrangeToolbar
                          selectedUnitCount={selectedUnitCount}
                          onArrange={arrange}
                        />
                      )}
                    {preview && !compact && (
                      <Panel position="top-center">
                        <PreviewBanner>
                          <span>
                            {t(
                              "whiteboard.history.previewBanner",
                              "Viewing the board as it was at {{time}}.",
                              { time: previewTime },
                            )}
                          </span>
                          <Button
                            size="sm"
                            variant="primary"
                            disabled={!!restoreBlocked || restoring}
                            onClick={askRestore}
                          >
                            {restoreLabel}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline-secondary"
                            onClick={backToNow}
                          >
                            {t("whiteboard.history.backToNow", "Back to now")}
                          </Button>
                          {restoreBlocked && (
                            <ReadOnlyReason>{restoreBlocked}</ReadOnlyReason>
                          )}
                          {inkHiddenInPreview && (
                            <ReadOnlyReason>
                              {t(
                                "whiteboard.history.inkHidden",
                                "Ink is hidden, so it isn't shown here. Restoring this version still puts its drawing back as it was.",
                              )}
                            </ReadOnlyReason>
                          )}
                        </PreviewBanner>
                      </Panel>
                    )}
                    {sidePanel === "history" &&
                      !compact &&
                      !draft &&
                      !openThreadData && (
                        <Panel position="top-right">
                          <SidePanel className="nodrag nowheel nopan">
                            <strong>{historyTitle}</strong>
                            <HistoryPanel
                              boardId={boardId}
                              previewId={preview?.version._id}
                              loadingId={previewLoading}
                              onPreview={showVersion}
                              onBackToNow={backToNow}
                            />
                          </SidePanel>
                        </Panel>
                      )}
                    {(draft ?? openThreadData) && (
                      <CommentPanelPlace compact={compact}>
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
                          canComment={canComment}
                          compact={compact}
                          offline={accessReason === "offline"}
                          focusPanel={
                            !!openThreadId && openThreadId === steppedThread
                          }
                          onClose={dismissComment}
                          onDeleted={closeDeletedComment}
                          onDraftSent={onDraftSent}
                          onError={reportRefusal}
                        />
                      </CommentPanelPlace>
                    )}
                    {outlineShown && (
                      <CommentPanelPlace compact={compact}>
                        <OutlinePanel
                          nodes={nodeDocs}
                          tagNames={tagNames}
                          rounds={rounds}
                          compact={compact}
                          folded={outlineFolded}
                          setFolded={setOutlineFolded}
                          current={outlineCurrent}
                          setCurrent={setOutlineCurrent}
                          onShow={showOutlineFrame}
                          onFitAll={fitWholeBoard}
                          onClose={closeOutline}
                        />
                      </CommentPanelPlace>
                    )}
                    {commentListShown && (
                      <Panel position="top-right">
                        <SidePanel className="nodrag nowheel nopan">
                          <strong>{commentListTitle}</strong>
                          <CommentList
                            rows={threadRows}
                            onShow={focusComment}
                          />
                        </SidePanel>
                      </Panel>
                    )}
                    {sidePanel === "hidden" &&
                      !readOnly &&
                      !draft &&
                      !openThreadData && (
                        <NotOnBoardPanel
                          title={notOnBoardTitle}
                          hiddenCards={hiddenCards}
                          hiddenFrames={hiddenFrames}
                          hiddenArrows={hiddenArrows}
                          showFeederArrows={showFeederArrows}
                          onPutBack={putBack}
                          onPutBackFrame={putBackFrame}
                          onPutBackArrow={putBackArrow}
                          onPutBackAllArrows={putBackAllArrows}
                        />
                      )}
                  </ReactFlow>
                </CanvasWrapper>
                {/* Outside the wrapper, whose pointer handlers would otherwise see
            presses in the dialog through React's tree. */}
                {resettingLayout && (
                  <ResetLayoutModal
                    boardId={boardId}
                    onHide={closeResetLayout}
                    onDone={layoutReset}
                  />
                )}
                {editingPolicy && (
                  <EditPolicyModal
                    boardId={boardId}
                    huntId={huntId}
                    initialPolicy={editPolicy}
                    initialEditors={editors}
                    onHide={closeEditPolicy}
                  />
                )}
                <Modal
                  show={confirmingRestore}
                  onHide={cancelRestore}
                  backdrop={restoring ? "static" : true}
                  keyboard={!restoring}
                >
                  <Modal.Header closeButton={!restoring}>
                    <Modal.Title>
                      {t(
                        "whiteboard.history.confirmTitle",
                        "Restore the board to {{time}}?",
                        { time: previewTime },
                      )}
                    </Modal.Title>
                  </Modal.Header>
                  <Modal.Body>
                    {t(
                      "whiteboard.history.confirmBody",
                      "Changes since then, by anyone, are undone. Comments are kept. The board as it is now is saved in history, so you can come back to it.",
                    )}
                    {restoreError && (
                      <Alert variant="danger" className="mt-3 mb-0">
                        {t(
                          "whiteboard.history.restoreFailed",
                          "Couldn't restore the board: {{reason}}",
                          { reason: restoreError, ...NO_ESCAPE },
                        )}
                      </Alert>
                    )}
                  </Modal.Body>
                  <Modal.Footer>
                    <Button
                      variant="secondary"
                      onClick={cancelRestore}
                      disabled={restoring}
                    >
                      {t("common.cancel", "Cancel")}
                    </Button>
                    <Button
                      variant="primary"
                      onClick={restore}
                      disabled={restoring}
                      aria-busy={restoring}
                    >
                      {restoring
                        ? t("whiteboard.history.restoring", "Restoring…")
                        : restoreLabel}
                    </Button>
                  </Modal.Footer>
                </Modal>
              </CollapseContext>
            </RoundStateContext>
          </FeederFocusContext>
        </PuzzlePeopleProvider>
      </RemoteEditingContext>
    </WhiteboardContext>
  );
};

const WhiteboardCanvas = (props: CanvasProps) => (
  <ReactFlowProvider>
    <CanvasInner {...props} />
  </ReactFlowProvider>
);

export default React.memo(WhiteboardCanvas);
