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
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import Spinner from "react-bootstrap/Spinner";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { useTheme } from "styled-components";
import Flags from "../../../Flags";
import Hunts from "../../../lib/models/Hunts";
import Puzzles from "../../../lib/models/Puzzles";
import WhiteboardEdges from "../../../lib/models/WhiteboardEdges";
import type {
  WhiteboardShape,
  WhiteboardStrokeWidth,
} from "../../../lib/models/WhiteboardNodes";
import {
  WhiteboardShapes,
  WhiteboardStrokeWidths,
} from "../../../lib/models/WhiteboardNodes";
import type { WhiteboardEditPolicy } from "../../../lib/models/Whiteboards";
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
import type { AttachHit } from "../../../lib/whiteboard/connectors";
import {
  attachHit,
  centerOf,
  compareAttachHits,
  snapAngle,
} from "../../../lib/whiteboard/connectors";
import { exportFileName } from "../../../lib/whiteboard/exportFiles";
import { feederFocus } from "../../../lib/whiteboard/feederFocus";
import { inkPath, round1 } from "../../../lib/whiteboard/ink";
import { POINT_SIZE } from "../../../lib/whiteboard/layout";
import {
  MAX_BATCH,
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
} from "../../../lib/whiteboard/versions";
import deleteWhiteboardNodes from "../../../methods/deleteWhiteboardNodes";
import type { WhiteboardEdgeInput } from "../../../methods/upsertWhiteboardEdges";
import type { WhiteboardNodeInput } from "../../../methods/upsertWhiteboardNodes";
import {
  useWhiteboardFeederArrows,
  useWhiteboardLineStyle,
  useWhiteboardPenColor,
  useWhiteboardPenWidth,
  useWhiteboardShapeKind,
  useWhiteboardViewport,
} from "../../hooks/persisted-state";
import useBoardClipboard from "../../hooks/useBoardClipboard";
import useBoardComments from "../../hooks/useBoardComments";
import useBoardFocus from "../../hooks/useBoardFocus";
import useBoardGeometry from "../../hooks/useBoardGeometry";
import useBoardKeys from "../../hooks/useBoardKeys";
import useBoardNavigation from "../../hooks/useBoardNavigation";
import useBoardNotices, { unannounced } from "../../hooks/useBoardNotices";
import type { Landed } from "../../hooks/useFrameTools";
import useFrameTools from "../../hooks/useFrameTools";
import useImageTool from "../../hooks/useImageTool";
import useInk from "../../hooks/useInk";
import useLinkedComment from "../../hooks/useLinkedComment";
import useLinkedTarget from "../../hooks/useLinkedTarget";
import useNotOnBoard from "../../hooks/useNotOnBoard";
import usePlaceTool from "../../hooks/usePlaceTool";
import useRemoteDrags from "../../hooks/useRemoteDrags";
import useRoundStates from "../../hooks/useRoundStates";
import useTimedValue from "../../hooks/useTimedValue";
import useTouchGestures from "../../hooks/useTouchGestures";
import useTypedSubscribe from "../../hooks/useTypedSubscribe";
import useVersionPreview from "../../hooks/useVersionPreview";
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
  KeyboardCatcher,
  LocalStroke,
  NO_ESCAPE,
  OutlineButton,
  OVERLAYS,
  PlaceGhost,
  PULSE_MS,
  PuzzlePeopleProvider,
  ReadOnlyButtons,
  ReadOnlyNote,
  ReadOnlyReason,
  SidePanel,
  type SidePanelKind,
  ToolBox,
  ToolButton,
  ToolSelect,
  UnreadBadge,
  UploadPlaceholder,
} from "./canvasChrome";
import colors from "./colors";
import type { DownloadKind } from "./DownloadButton";
import DownloadButton from "./DownloadButton";
import EditPolicyModal, { EditPolicyButton } from "./EditPolicyModal";
import FeederFocusContext from "./FeederFocusContext";
import FrameLabelLayer from "./FrameLabelLayer";
import FrameNode from "./FrameNode";
import HistoryPanel from "./HistoryPanel";
import ImageNode from "./ImageNode";
import InkNode from "./InkNode";
import KeepAboveKeyboard from "./KeepAboveKeyboard";
import LineStyleControls, { DEFAULT_LINE_STYLE } from "./LineStyleControls";
import LineStyleIcon from "./LineStyleIcon";
import LockLayoutButtons from "./LockLayoutButtons";
import { strokeOpacity } from "./marker";
import NodePulse from "./NodePulse";
import NotOnBoardPanel from "./NotOnBoardPanel";
import OutlinePanel from "./OutlinePanel";
import PointNode from "./PointNode";
import PreviewChrome, { RestoreVersionModal } from "./PreviewChrome";
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
import { isPlaceTool } from "./tools";
import { CLICK_SLOP, movedPastSlop, TOUCH_SLOP } from "./touch";
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

// One input per node, later fields winning.
function mergeInputs(inputs: WhiteboardNodeInput[]): WhiteboardNodeInput[] {
  const byId = new Map<string, WhiteboardNodeInput>();
  inputs.forEach((input) => {
    byId.set(input._id, { ...byId.get(input._id), ...input });
  });
  return [...byId.values()];
}

type MarkPending = (
  id: string,
  change: { position: XYPosition; parent?: string | null },
) => void;

// Nodes dropped, nudged or arranged: what to save for each, which to show
// in a new frame straight away, and where each landed for the frames to
// grow round (saveMoves). Each mover walks its own nodes.
class Mover {
  readonly inputs: WhiteboardNodeInput[] = [];
  readonly moves: NodeMoves = new Map();
  readonly landed: Landed[] = [];

  constructor(private readonly markPending: MarkPending) {}

  // Saved where it is, in the frame it's in.
  stay(id: string, parent: string | undefined, position: XYPosition) {
    this.inputs.push({ _id: id, position });
    this.markPending(id, { position });
    this.landed.push({ id, parent, position });
  }

  // Saved where it is, having moved with its frame, so it hasn't landed
  // anywhere new.
  follow(id: string, position: XYPosition) {
    this.inputs.push({ _id: id, position });
    this.markPending(id, { position });
  }

  // Shifted within its frame, shown there at once.
  shift(id: string, parent: string | undefined, position: XYPosition) {
    this.moves.set(id, { position, parent });
    this.stay(id, parent, position);
  }

  // Put into another frame, or out of one, shown there at once.
  reparent(id: string, parent: string | undefined, position: XYPosition) {
    this.inputs.push({ _id: id, position, parent: parent ?? null });
    this.markPending(id, { position, parent: parent ?? null });
    this.moves.set(id, { position, parent });
    this.landed.push({ id, parent, position });
  }
}

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

const NO_REMOTE_DRAGS = new Map<string, RemoteDrag>();
const NO_PINS: CommentPin[] = [];
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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const flow = useReactFlow<WhiteboardFlowNode, WhiteboardFlowEdge>();
  const storeApi = useStoreApi<WhiteboardFlowNode, WhiteboardFlowEdge>();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const {
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
  } = useBoardGeometry(wrapperRef);
  const mayComment = access === "edit" || access === "comment";
  const mayEdit = access === "edit";
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
  const [sidePanel, setSidePanel] = useState<SidePanelKind>();
  // Closes a panel, if it's the one open.
  const closePanel = useCallback(
    (panel: SidePanelKind) =>
      setSidePanel((current) => (current === panel ? undefined : current)),
    [],
  );
  const selfId = useTracker(() => Meteor.userId() ?? undefined, []);
  const {
    threads,
    threadRows,
    unreadCount,
    resolvedCount,
    showResolved,
    toggleShowResolved,
    openThreadData,
    openThreadId,
    steppedThread,
    setSteppedThread,
    draft,
    clearDraft,
    startDraft,
    onDraftSent,
    pulse,
    commentPins,
    commentTarget,
    commentAnchorAt,
    openComment,
    closeComment,
    dismissComment,
    closeDeletedComment,
    showComment,
  } = useBoardComments({
    boardId,
    puzzleId,
    compact,
    wrapperRef,
    selfId,
    absoluteRect,
    closePanel,
  });
  const {
    preview,
    shownPreview,
    previewLoading,
    backToNow,
    confirmingRestore,
    showVersion,
    changed,
    inkHiddenInPreview,
    previewTime,
    restoreBlocked,
    restoring,
    restoreError,
    askRestore,
    cancelRestore,
    restore,
    restoringItem,
    restoreItem,
  } = useVersionPreview({
    boardId,
    hideInk,
    isOperator,
    access,
    accessReason,
    closeComment,
    showNotice,
    reportRefusal,
  });
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
  const [editingPolicy, setEditingPolicy] = useState(false);
  const openEditPolicy = useCallback(() => setEditingPolicy(true), []);
  const closeEditPolicy = useCallback(() => setEditingPolicy(false), []);
  const [penColor, setPenColor] = useWhiteboardPenColor();
  const [penWidth, setPenWidth] = useWhiteboardPenWidth();
  const [shapeKind, setShapeKind] = useWhiteboardShapeKind();
  // A node or a point marked for a moment after the board pans to it.
  const [nodePulse, pulseAt] = useTimedValue<{
    node?: string;
    point?: XYPosition;
  }>(PULSE_MS);
  // Where a press with the Comment tool (or a finger with a placing tool)
  // started, until it's let go there.
  const tapPress = useRef<TapPress | undefined>(undefined);
  // Set when a tap places a comment or a note, or a long press selects
  // something, until the next press, so the click the browser makes from
  // the tap afterwards doesn't also follow a link, take focus from what was
  // just opened, or select only what's under it.
  const tapped = useRef(false);
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
  // The strokes under the eraser, faded until they're deleted (useInk).
  const [erasingStrokes, setErasingStrokes] = useState<Set<string>>(new Set());
  // Whether Space is held, which pans the board instead of drawing; the
  // keys set it.
  const spaceHeld = useRef(false);

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

  const { growForLanded, fitToContents, tidyCards } = useFrameTools({
    huntId,
    isDraggedByOthers,
    markPending,
    setNodes,
    updateNodes,
    showLockRefused,
  });

  // Shows a mover's moves and saves them, with the frames they grew.
  const saveMoves = useCallback(
    (mover: Mover, onDone?: Done) => {
      showMoves(mover.moves);
      updateNodes(
        mergeInputs([...mover.inputs, ...growForLanded(mover.landed)]),
        onDone,
      );
    },
    [showMoves, growForLanded, updateNodes],
  );

  // Saves the nodes nudged with the arrow keys.
  const saveNudges = useCallback(() => {
    const mover = new Mover(markPending);
    const nudgedIds = new Set(nudged.current);
    const frames = frameRects();
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
          mover.reparent(id, parent, position);
          return;
        }
      }
      // Something moving with its frame stays where it was in it
      if (insideMoved) {
        mover.follow(id, node.position);
      } else {
        mover.stay(id, node.parentId, node.position);
      }
    });
    nudged.current.clear();
    companions.current.clear();
    if (draggedByOthers.length > 0) clearPending(draggedByOthers);
    saveMoves(mover);
  }, [
    flow,
    frameRects,
    isWithin,
    absoluteRect,
    placementFor,
    markPending,
    clearPending,
    saveMoves,
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
      const mover = new Mover(markPending);

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
          mover.stay(node.id, node.parentId, node.position);
          return;
        }
        mover.reparent(node.id, target, position);
      });

      dragActive.current = false;
      companions.current.forEach((id) => {
        const carried = flow.getNode(id);
        if (!carried || draggedIds.has(id)) return;
        mover.stay(id, carried.parentId, carried.position);
      });
      companions.current.clear();

      // Others drop their copy of the drag only once the saved positions
      // are on their way, so they never see the node jump back.
      saveMoves(mover, () => {
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
      saveMoves,
    ],
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

      const mover = new Mover(markPending);
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
            mover.reparent(m.id, placed.parent, {
              x: round1(placed.position.x),
              y: round1(placed.position.y),
            });
            return;
          }
          mover.shift(m.id, m.parentId, {
            x: round1(m.position.x + shift.dx),
            y: round1(m.position.y + shift.dy),
          });
        });
      });
      saveMoves(mover);
    },
    [
      flow,
      absoluteRect,
      frameRects,
      placementFor,
      markPending,
      saveMoves,
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

  const {
    localStroke,
    startStroke,
    extendStroke,
    endStroke,
    dropStroke,
    eraseAt,
    finishErasing,
  } = useInk({
    penColor,
    penWidth,
    erasingStrokes,
    setErasingStrokes,
    absoluteRect,
    frameAt,
    flowPoint,
    updateNodes,
    deleteNodes,
    tidyLater,
    setLiveStroke: live.setStroke,
  });

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
  // An open thread or a comment being started takes the list's place.
  const commentListShown =
    sidePanel === "comments" && !draft && !openThreadData;

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

  const focusComment = useLinkedComment({
    initialComment,
    onInitialCommentShown,
    focusRef,
    boardLoaded,
    livePuzzleIds,
    threads,
    nodes,
    peekAround,
    showComment,
    showNotice,
  });

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
    tapPress.current = undefined;
    dropStroke();
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
  }, [dropStroke, storeApi, setPlacing]);

  const {
    fingerDown,
    fingerMove,
    liftFinger,
    cancelLongPress,
    longPressWaiting,
  } = useTouchGestures({
    wrapperRef,
    tool,
    readOnly,
    fingerPans,
    onBoard,
    dropFingerAction,
    onLongPress: selectByLongPress,
  });

  const onPointerDownCapture = useCallback(
    (event: React.PointerEvent) => {
      tapped.current = false;
      // A second finger means a pinch, not a tap, a long press or a stroke.
      if (event.pointerType === "touch" && fingerDown(event)) {
        tapPress.current = undefined;
        return;
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

      startStroke(point, event);
    },
    [
      onBoard,
      readOnly,
      tool,
      coarse,
      fingerDown,
      flowPoint,
      eraseAt,
      startStroke,
      resolveEndpoint,
      setPlacing,
      spaceHeld,
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
      if (fingerMove(event, at)) return;
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
      extendStroke(event);
    },
    [
      onBoard,
      fingerMove,
      flowPoint,
      live,
      preview,
      tool,
      placing,
      connecting,
      targetFor,
      refreshAttachPreview,
      eraseAt,
      extendStroke,
      setPlacing,
      setHover,
      spaceHeld,
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
        startDraft(press.point);
        setTool("select");
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
      endStroke();
    },
    [
      tool,
      placing,
      connecting,
      flow,
      startDraft,
      moveLineEnd,
      createLine,
      endpointPosition,
      targetFor,
      finishErasing,
      placeNode,
      placementRect,
      flowPoint,
      endStroke,
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
  const onContextMenu = useCallback(
    (event: React.MouseEvent) => {
      if (longPressWaiting() || tapped.current) event.preventDefault();
    },
    [longPressWaiting],
  );

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
    cancelLongPress();
    setConnecting(undefined);
    setErasingStrokes(new Set());
    cancelClickConnect();
  }, [
    tool,
    clearSelection,
    cancelClickConnect,
    cancelLongPress,
    setPlacing,
    setHover,
  ]);

  // What Escape does once nothing is open: drops a comment being started, a
  // line being drawn or joined, or an erase, turns off Select area and goes
  // back to Select. A touch screen has a Cancel button for it.
  const cancelTool = useCallback(() => {
    clearDraft();
    setSelectArea(false);
    setConnecting(undefined);
    setErasingStrokes(new Set());
    cancelClickConnect();
    setTool("select");
  }, [clearDraft, cancelClickConnect]);

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

  useBoardKeys({
    wrapperRef,
    searchRef,
    canvasActive,
    spaceHeld,
    handlers: {
      readOnly,
      canComment,
      tool,
      confirmingRestore,
      openThreadId,
      commentListShown,
      preview: !!preview,
      previewLoading: !!previewLoading,
      sidePanel,
      threadRows,
      lockSelection,
      setSidePanel,
      dismissComment,
      backToNow,
      cancelTool,
      pickTool,
      setPenWidth,
      setSteppedThread,
      focusComment,
      toggleLock,
      duplicateSelection,
      setTool,
      selectAll,
      setEditOnAppear,
      undo,
      redo,
    },
  });

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

  // Nodes keep their selection by id when the board is redrawn, so opening,
  // switching or leaving a preview starts with nothing selected. Otherwise a
  // pick in a preview would stay selected on the live board, where a viewer
  // who can't edit has no way to clear it, and a live selection would offer
  // a restore before anything was picked.
  const previewVersionId = preview?.version._id;
  useEffect(() => {
    clearSelection();
  }, [previewVersionId, clearSelection]);

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
                      <PreviewChrome
                        previewTime={previewTime}
                        restoreBlocked={restoreBlocked}
                        inkHidden={inkHiddenInPreview}
                        restoring={restoring}
                        onRestore={askRestore}
                        onBackToNow={backToNow}
                        pick={previewPick}
                        restoringItem={restoringItem}
                        onRestoreItem={restoreItem}
                      />
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
                <RestoreVersionModal
                  show={confirmingRestore}
                  previewTime={previewTime}
                  restoring={restoring}
                  error={restoreError}
                  onCancel={cancelRestore}
                  onRestore={restore}
                />
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
