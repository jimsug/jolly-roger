import { Meteor } from "meteor/meteor";
import { Random } from "meteor/random";
import { useTracker } from "meteor/react-meteor-data";
import { faArrowPointer } from "@fortawesome/free-solid-svg-icons/faArrowPointer";
import { faCircleCheck } from "@fortawesome/free-solid-svg-icons/faCircleCheck";
import { faClockRotateLeft } from "@fortawesome/free-solid-svg-icons/faClockRotateLeft";
import { faComment } from "@fortawesome/free-solid-svg-icons/faComment";
import { faComments } from "@fortawesome/free-solid-svg-icons/faComments";
import { faDiagramProject } from "@fortawesome/free-solid-svg-icons/faDiagramProject";
import { faEraser } from "@fortawesome/free-solid-svg-icons/faEraser";
import { faEyeSlash } from "@fortawesome/free-solid-svg-icons/faEyeSlash";
import { faFont } from "@fortawesome/free-solid-svg-icons/faFont";
import { faLink } from "@fortawesome/free-solid-svg-icons/faLink";
import { faNoteSticky } from "@fortawesome/free-solid-svg-icons/faNoteSticky";
import { faObjectGroup } from "@fortawesome/free-solid-svg-icons/faObjectGroup";
import { faPen } from "@fortawesome/free-solid-svg-icons/faPen";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type {
  AriaLabelConfig,
  EdgeChange,
  NodeChange,
  NodeMouseHandler,
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
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import FormSelect from "react-bootstrap/FormSelect";
import Modal from "react-bootstrap/Modal";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import styled, { css, useTheme } from "styled-components";
import Flags from "../../../Flags";
import type { ChatMessageCommentAnchorType } from "../../../lib/models/ChatMessages";
import Puzzles from "../../../lib/models/Puzzles";
import Tags from "../../../lib/models/Tags";
import WhiteboardEdges from "../../../lib/models/WhiteboardEdges";
import type {
  WhiteboardColor,
  WhiteboardStrokeWidth,
} from "../../../lib/models/WhiteboardNodes";
import WhiteboardNodes, {
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
import { feederFocus } from "../../../lib/whiteboard/feederFocus";
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
  frameLabel,
  POINT_SIZE,
} from "../../../lib/whiteboard/layout";
import {
  MAX_BATCH,
  MAX_FRAME_DEPTH,
  MAX_LIVE_DRAG_NODES,
} from "../../../lib/whiteboard/limits";
import type { LineStyle } from "../../../lib/whiteboard/lineStyle";
import type { BoardTarget } from "../../../lib/whiteboard/links";
import {
  boardLinkQuery,
  boardTargetKey,
  MAX_ZOOM,
  MIN_ZOOM,
} from "../../../lib/whiteboard/links";
import type { SeenDrag } from "../../../lib/whiteboard/liveDrags";
import { liveDrags, seeDrags } from "../../../lib/whiteboard/liveDrags";
import { miniMapColor } from "../../../lib/whiteboard/minimap";
import type { BoardSearchHit } from "../../../lib/whiteboard/search";
import deleteWhiteboardEdges from "../../../methods/deleteWhiteboardEdges";
import deleteWhiteboardNodes from "../../../methods/deleteWhiteboardNodes";
import restoreWhiteboardVersion from "../../../methods/restoreWhiteboardVersion";
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
import useKeyboardInset from "../../hooks/useKeyboardInset";
import usePuzzlePeople from "../../hooks/usePuzzlePeople";
import useRoundStates from "../../hooks/useRoundStates";
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
import CopyToClipboardButton from "../CopyToClipboardButton";
import ArrangeIcon from "./ArrangeIcon";
import BoardSearch from "./BoardSearch";
import ChatLoadedContext from "./ChatLoadedContext";
import ColorPicker from "./ColorPicker";
import type { CommentPin } from "./CommentLayer";
import CommentLayer from "./CommentLayer";
import CommentList from "./CommentList";
import CommentPanel from "./CommentPanel";
import CursorLayer from "./CursorLayer";
import colors from "./colors";
import describeCommentTarget from "./describeCommentTarget";
import EditPolicyModal, { EditPolicyButton } from "./EditPolicyModal";
import FeederFocusContext from "./FeederFocusContext";
import FrameLabelLayer from "./FrameLabelLayer";
import FrameNode from "./FrameNode";
import { boxOf } from "./floatingEdgeParams";
import type { VersionPreview } from "./HistoryPanel";
import HistoryPanel, { loadVersion, versionMoment } from "./HistoryPanel";
import InkNode from "./InkNode";
import LineStyleControls, { DEFAULT_LINE_STYLE } from "./LineStyleControls";
import LineStyleIcon from "./LineStyleIcon";
import { MIN_SIZES } from "./NodeChrome";
import NodePulse from "./NodePulse";
import PeopleContext from "./PeopleContext";
import PointNode from "./PointNode";
import PuzzleCardNode from "./PuzzleCardNode";
import RoundStateContext from "./RoundStateContext";
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

// The key that picks each tool, and the pen widths' keys.
const TOOL_KEYS: Record<Tool, string> = {
  select: "V",
  pen: "P",
  eraser: "E",
  connector: "L",
  sticky: "S",
  text: "T",
  frame: "F",
  comment: "C",
};
const TOOLS_BY_KEY = new Map(
  (Object.entries(TOOL_KEYS) as [Tool, string][]).map(([tool, key]) => [
    key.toLowerCase(),
    tool,
  ]),
);
const PEN_WIDTH_KEYS = new Map<string, WhiteboardStrokeWidth>([
  ["1", "thin"],
  ["2", "medium"],
  ["3", "thick"],
]);

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

// A press with the Comment tool, which places a comment if it's let go
// without moving. A touch press leaves the board free to pan and pinch.
interface CommentPress {
  point: XYPosition;
  clientX: number;
  clientY: number;
  pointerId: number;
  pointerType: string;
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
// A finger wobbles more than a mouse or pen does, so a touch gets more room
// before it counts as a pan rather than a tap.
const TOUCH_SLOP = 10;
// The parts of the canvas that sit over the board, where presses are the
// controls' own rather than a tool's.
const OVERLAYS =
  ".react-flow__panel, .react-flow__controls, .react-flow__minimap, .react-flow__node-toolbar, .jr-comment-pin";
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

  /* On a phone a thread opens in a sheet along the bottom, as wide as the
     board, clear of the keyboard and short of the top of both the screen
     and the board. */
  .react-flow__panel.bottom.center.jr-comment-sheet {
    left: 0;
    right: 0;
    display: flex;
    flex-direction: column;
    max-height: min(
      60%,
      100% - var(--kb-inset, 0px) - 8px,
      var(--vv-height, 100dvh) - 48px
    );
    margin: 0;
    transform: none;
  }

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

  /* The handle a click-to-connect line starts from, until the next click. */
  .react-flow__handle.clickconnecting {
    opacity: 1;
    background: ${({ theme }) => theme.colors.primary};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.background},
      0 0 0 5px ${({ theme }) => theme.colors.primary};
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

const HiddenSection = styled.div`
  margin-top: 8px;
  font-weight: 600;
`;

const HiddenNone = styled.div`
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const ReadOnlyNote = styled.div`
  display: flex;
  flex-direction: column;
  padding: 0 4px;
  font-size: 13px;
`;

const ReadOnlyReason = styled.span`
  color: ${({ theme }) => theme.colors.textSecondary};
`;

// Where a thread's panel goes: the top right of the board or, on a phone, a
// sheet along its bottom that rises above the keyboard. It stays the same
// element either way, so the screen changing size mid-reply doesn't throw
// away what's been typed.
const CommentPanelPlace = ({
  compact,
  children,
}: {
  compact: boolean;
  children: React.ReactNode;
}) => {
  const { inset, height } = useKeyboardInset();
  const style = useMemo(
    () =>
      compact
        ? ({
            bottom: inset,
            "--kb-inset": `${inset}px`,
            "--vv-height": height === undefined ? undefined : `${height}px`,
          } as React.CSSProperties)
        : undefined,
    [compact, inset, height],
  );
  return (
    <Panel
      position={compact ? "bottom-center" : "top-right"}
      className={compact ? "jr-comment-sheet" : undefined}
      style={style}
    >
      {children}
    </Panel>
  );
};

// The read-only toolbar's buttons, finger-sized on a phone.
const ReadOnlyButtons = styled(ButtonGroup)<{ $compact: boolean }>`
  ${({ $compact }) =>
    $compact &&
    css`
      > .btn {
        min-width: 44px;
        min-height: 44px;
      }
    `}
`;

const CommentHint = styled.output`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  padding: 6px 6px 6px 10px;
  border-radius: 8px;
  background: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.border};
  box-shadow: 0 2px 6px rgb(0 0 0 / 12%);

  .btn {
    min-height: 44px;
  }
`;

const PreviewBanner = styled.output`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  max-width: 560px;
  padding: 6px 10px;
  border-radius: 8px;
  background: ${({ theme }) => theme.colors.background};
  border: 2px solid ${({ theme }) => theme.colors.primary};
  box-shadow: 0 2px 6px rgb(0 0 0 / 12%);
  font-size: 13px;
`;

const AccessNotice = styled(Alert)`
  max-width: 320px;
  margin: 6px 0 0;
  padding: 6px 36px 6px 10px;
  font-size: 13px;

  .btn-close {
    padding: 10px;
  }
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

// A tool on the toolbar. Its title says what it does and which key picks
// it, and names it for screen readers too.
const ToolButton = ({
  tool,
  active,
  title,
  label = title,
  onSelect,
  children,
}: {
  tool: Tool;
  active: boolean;
  title: string;
  // The name for screen readers, when it says more than the title.
  label?: string;
  onSelect: (tool: Tool) => void;
  children: React.ReactNode;
}) => {
  const { t } = useTranslation();
  const onClick = useCallback(() => onSelect(tool), [onSelect, tool]);
  const withKey = t("whiteboard.toolbar.withKey", "{{title}} [{{key}}]", {
    title,
    key: TOOL_KEYS[tool],
    // React escapes attributes, so i18next's escaping would only show
    // entities. Goes once both i18n inits stop escaping.
    interpolation: { escapeValue: false },
  });
  return (
    <Button
      variant={active ? "primary" : "outline-secondary"}
      onClick={onClick}
      title={withKey}
      aria-label={label}
      aria-keyshortcuts={TOOL_KEYS[tool]}
      aria-pressed={active}
    >
      {children}
    </Button>
  );
};

// How many threads have something the viewer hasn't read, on the button
// that leads to them.
const UnreadBadge = ({ count }: { count: number }) =>
  count > 0 ? (
    <Badge pill bg="danger" className="ms-1 jr-unread-comments">
      {count > 99 ? "99+" : count}
    </Badge>
  ) : null;

// The Comment tool, on the full toolbar and on a board that can only be
// commented on, with the count of unread threads.
const CommentToolButton = ({
  active,
  unread,
  onSelect,
}: {
  active: boolean;
  unread: number;
  onSelect: (tool: Tool) => void;
}) => {
  const { t } = useTranslation();
  const title = t(
    "whiteboard.toolbar.comment",
    "Comment: click on something to start a thread about it",
  );
  return (
    <ToolButton
      tool="comment"
      active={active}
      onSelect={onSelect}
      title={title}
      label={
        unread > 0
          ? t(
              "whiteboard.toolbar.commentUnread",
              "{{title}} ({{count}} unread)",
              {
                title,
                count: unread,
                // React escapes attributes, so i18next's escaping would only
                // show entities. Goes once both i18n inits stop escaping.
                interpolation: { escapeValue: false },
              },
            )
          : title
      }
    >
      <FontAwesomeIcon icon={faComment} />
      <UnreadBadge count={unread} />
    </ToolButton>
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

// A seeded frame someone removed.
interface HiddenFrame {
  id: string;
  title: string;
}

// A feeder arrow someone removed, named by the puzzles it joins.
interface HiddenArrow {
  id: string;
  title: string;
}

// Something in the "Not on the board" panel, with a way to put it back.
const PutBackRow = <Item extends { title: string }>({
  item,
  onPutBack,
}: {
  item: Item;
  onPutBack: (item: Item) => void;
}) => {
  const { t } = useTranslation();
  const onClick = useCallback(() => onPutBack(item), [onPutBack, item]);
  return (
    <HiddenRow>
      <span title={item.title}>{item.title}</span>
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

const NO_REMOTE_DRAGS = new Map<string, RemoteDrag>();
const NO_PINS: CommentPin[] = [];

// Reasons for less access that come from the screen or the connection, not
// from anyone's choice, and aren't announced.
const unannounced = (reason: WhiteboardAccessReason | undefined) =>
  reason === "narrow" || reason === "offline";

// How far below the middle of the screen (as a share of the board's height)
// the board centres on a pin on a phone, so the pin sits above the comment
// sheet.
const SHEET_OFFSET = 0.3;
// How long a pin or node pulses after the board pans to it.
const PULSE_MS = 2200;
// How long a note about a link that couldn't be followed stays up.
const NOTICE_MS = 8000;

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
  // Off on a phone, where it would cover half the board.
  showMiniMap: boolean;
  // A phone-sized screen (see WhiteboardPage): bigger targets, a tap places
  // a comment without stopping the board panning, and threads open in a
  // sheet along the bottom.
  compact: boolean;
  // Whether the board's nodes and lines have arrived.
  boardLoaded: boolean;
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
  showMiniMap,
  compact,
  boardLoaded,
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
  const wrapperRef = useRef<HTMLDivElement>(null);
  // An earlier version of the board being looked at, which can't be edited
  // or commented on.
  const [preview, setPreview] = useState<VersionPreview>();
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
  // board's nodes and lines from the whiteboard page.
  const people = usePuzzlePeople(huntId);
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
  // Only drags that are still moving count (see LIVE_DRAG_TIMEOUT_MS), and
  // what they show is never saved by anything done here (remoteDragged).
  const seenDrags = useRef(new Map<string, SeenDrag>());
  const remoteDragged = useRef(new Set<string>());
  const [remoteDrags, setRemoteDrags] = useState(
    () => new Map<string, RemoteDrag>(),
  );
  useEffect(() => {
    let timer: number | undefined;
    const update = () => {
      const now = Date.now();
      seenDrags.current = seeDrags(seenDrags.current, drags, now);
      const { live, staleAt } = liveDrags(seenDrags.current, now);
      remoteDragged.current = new Set(live.keys());
      setRemoteDrags((previous) =>
        previous.size === 0 && live.size === 0 ? previous : live,
      );
      if (staleAt !== undefined) {
        timer = window.setTimeout(update, staleAt - now);
      }
    };
    update();
    return () => window.clearTimeout(timer);
  }, [drags]);

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
  const [showFeederArrows, setShowFeederArrows] = useWhiteboardFeederArrows();
  const [tool, setTool] = useState<Tool>("select");
  // A board that becomes read-only (say, the hunt is archived) puts any
  // drawing tool down, and the Comment tool too once commenting goes.
  if (readOnly && tool !== "select" && !(tool === "comment" && canComment)) {
    setTool("select");
  }
  // Says so when the viewer's edit rights come or go while the board is
  // open. A screen becoming phone-sized (compact, see WhiteboardPage) or
  // ceasing to be isn't news, and losing the connection has its own
  // banner. The reason is tracked even when edit rights don't change, so a
  // later change is judged against the current one. Time offline isn't
  // tracked, so a change made meanwhile is announced on reconnecting.
  const mayEdit = access === "edit";
  const [seenAccess, setSeenAccess] = useState({
    mayEdit,
    reason: accessReason,
  });
  const [accessNotice, setAccessNotice] = useState<"lost" | "gained">();
  if (
    accessReason !== "offline" &&
    (seenAccess.mayEdit !== mayEdit || seenAccess.reason !== accessReason)
  ) {
    setSeenAccess({ mayEdit, reason: accessReason });
    if (
      seenAccess.mayEdit !== mayEdit &&
      !unannounced(seenAccess.reason) &&
      !unannounced(accessReason)
    ) {
      setAccessNotice(mayEdit ? "gained" : "lost");
    }
  }
  const dismissAccessNotice = useCallback(() => setAccessNotice(undefined), []);
  const [editingPolicy, setEditingPolicy] = useState(false);
  const openEditPolicy = useCallback(() => setEditingPolicy(true), []);
  const closeEditPolicy = useCallback(() => setEditingPolicy(false), []);
  const [penColor, setPenColor] = useWhiteboardPenColor();
  const [penWidth, setPenWidth] = useWhiteboardPenWidth();
  // The panel at the top right, under any open thread: what isn't on the
  // board, or the list of comments. Only one shows at a time.
  const [sidePanel, setSidePanel] = useState<
    "hidden" | "comments" | "history"
  >();
  const closeHiddenPanel = useCallback(
    () =>
      setSidePanel((current) => (current === "hidden" ? undefined : current)),
    [],
  );
  const [showResolved, setShowResolved] = useWhiteboardShowResolvedComments();
  const [openThread, setOpenThread] = useState<string>();
  const [draft, setDraft] = useState<ChatMessageCommentAnchorType>();
  const [pulse, setPulse] = useState<string | undefined>();
  const pulseTimer = useRef<number | undefined>(undefined);
  const [nodePulse, setNodePulse] = useState<{
    node?: string;
    point?: XYPosition;
  }>();
  const nodePulseTimer = useRef<number | undefined>(undefined);
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
  // Where a press with the Comment tool started, until it's let go there.
  const commentPress = useRef<CommentPress | undefined>(undefined);
  // Set when a tap places a comment, until the next press, so the click the
  // browser makes from the tap afterwards doesn't also follow a link or take
  // focus from the new comment's composer.
  const commentTapped = useRef(false);
  // The node a click-to-connect line starts from, and where the pointer is
  // while it waits for the next click.
  const clickConnectFrom = useRef<string | undefined>(undefined);
  const [clickConnectPointer, setClickConnectPointer] = useState<XYPosition>();
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
  // The last save the server refused, shown until dismissed or replaced.
  const [saveError, setSaveError] = useState<{ id: number; reason: string }>();
  const reportRefusal = useCallback((error?: Meteor.Error) => {
    if (!error) return;
    setSaveError({ id: Date.now(), reason: error.reason ?? error.message });
  }, []);
  const dismissSaveError = useCallback(() => setSaveError(undefined), []);

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
    // Other people's drags are on the board as it is, not the version.
    remoteDrags: preview ? NO_REMOTE_DRAGS : remoteDrags,
    erasingStrokes,
    lineColors,
    lineLabels,
    override: preview,
  });

  // The cards whose feeder arrows stand out: the one under the pointer and
  // any selected. Kept as a string between renders so a drag, which makes
  // new node objects every frame, doesn't redraw every line.
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
  const feederFocusKey = feederFocus(
    [
      hoveredCard,
      ...nodes
        .filter((n) => n.selected && n.type === "puzzle")
        .map((n) => n.id),
    ],
    edges.filter((e) => e.data?.doc.auto),
  ).join(" ");
  const feederFocusIds = useMemo(
    () => new Set(feederFocusKey ? feederFocusKey.split(" ") : []),
    [feederFocusKey],
  );

  const updateNodes = useCallback(
    (
      inputs: WhiteboardNodeInput[],
      onDone?: (error?: Meteor.Error) => void,
    ) => {
      if (inputs.length === 0) {
        onDone?.();
        return;
      }
      const batches = chunks(inputs, MAX_BATCH);
      let outstanding = batches.length;
      let refused: Meteor.Error | undefined;
      batches.forEach((batch) => {
        upsertWhiteboardNodes.call({ boardId, nodes: batch }, (error) => {
          if (error) {
            clearPending(batch.map((n) => n._id));
            reportRefusal(error);
            refused ??= error;
          }
          outstanding -= 1;
          if (outstanding === 0) onDone?.(refused);
        });
      });
    },
    [boardId, clearPending, reportRefusal],
  );

  const deleteNodes = useCallback(
    (ids: string[]) => {
      chunks(ids, MAX_BATCH).forEach((batch) => {
        deleteWhiteboardNodes.call({ boardId, nodeIds: batch }, reportRefusal);
      });
    },
    [boardId, reportRefusal],
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
    (input: WhiteboardEdgeInput, onDone?: (error?: Meteor.Error) => void) => {
      // Changes to a line show at once; a new line waits for the server.
      const existing = !!flow.getEdge(input._id);
      if (existing) {
        const { _id, ...change } = input;
        markEdgePending(_id, change);
      }
      upsertWhiteboardEdges.call({ boardId, edges: [input] }, (error) => {
        if (error) {
          if (existing) clearEdgePending([input._id]);
          reportRefusal(error);
        }
        onDone?.(error);
      });
    },
    [boardId, flow, markEdgePending, clearEdgePending, reportRefusal],
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
      // A child someone else is dragging shows where they have it, which is
      // theirs to save
      const draggedByOthers: string[] = [];
      all
        .filter((n) => n.parentId === id)
        .forEach((child) => {
          if (remoteDragged.current.has(child.id)) {
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
    },
    [flow, markPending, clearPending, updateNodes],
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
            deleteWhiteboardEdges.call(
              { boardId, edgeIds: batch },
              reportRefusal,
            ),
          );
        }
        return Promise.resolve(false);
      },
      [boardId, deleteNodes, reportRefusal],
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
    // Something someone else is dragging shows where they have it, which is
    // theirs to save, so a nudge made from there is dropped
    const draggedByOthers: string[] = [];
    nudgedIds.forEach((id) => {
      if (remoteDragged.current.has(id)) {
        draggedByOthers.push(id);
        return;
      }
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
    if (draggedByOthers.length > 0) clearPending(draggedByOthers);
    showMoves(moves);
    updateNodes(inputs);
  }, [
    flow,
    frameRects,
    isWithin,
    absoluteRect,
    placementFor,
    markPending,
    clearPending,
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
        upsertWhiteboardNodes.call({ boardId, nodes: points }, reportRefusal);
      }
      upsertWhiteboardEdges.call({ boardId, edges: [edge] }, (error) => {
        if (!error) return;
        reportRefusal(error);
        if (points.length > 0) {
          deleteWhiteboardNodes.call({
            boardId,
            nodeIds: points.map((p) => p._id),
          });
        }
      });
    },
    [boardId, lineStyle, pointPlacement, reportRefusal],
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
      upsertWhiteboardNodes.call(
        {
          boardId,
          nodes: [{ _id, type: "point", ...pointPlacement(endpoint) }],
        },
        reportRefusal,
      );
      upsertWhiteboardEdges.call(
        { boardId, edges: [{ _id: edgeId, [end]: _id }] },
        (edgeError) => {
          if (edgeError) {
            reportRefusal(edgeError);
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
      reportRefusal,
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
          if (error) {
            clearEdgePending(lines.map((e) => e.id));
            reportRefusal(error);
          }
        },
      );
    },
    [boardId, selectedLines, markEdgePending, clearEdgePending, reportRefusal],
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
          // Something someone else is dragging stays theirs to save
          if (remoteDragged.current.has(m.id)) return;
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

  // Frames for rounds that someone removed. Only seeded frames are kept when
  // they're removed; anything made on the board is deleted outright.
  const tagNames = useTracker(
    () =>
      new Map(
        Tags.find({ hunt: huntId }, { projection: { name: 1 } }).map((tag) => [
          tag._id,
          tag.name,
        ]),
      ),
    [huntId],
  );
  const hiddenFrames = useMemo(
    (): HiddenFrame[] =>
      nodeDocs
        .filter((d) => d.type === "frame" && d.hidden)
        .map((d) => ({
          id: d._id,
          title:
            frameLabel(d, d.tag ? tagNames.get(d.tag) : undefined) ??
            t("whiteboard.frame.placeholder", "Frame"),
        }))
        .toSorted((a, b) => a.title.localeCompare(b.title)),
    [nodeDocs, tagNames, t],
  );

  // Feeder arrows someone removed, between puzzles that are still live.
  const hiddenArrowDocs = useTracker(
    () =>
      WhiteboardEdges.find(
        { board: boardId, auto: true, hidden: true },
        { projection: { feeder: 1, meta: 1 } },
      ).fetch(),
    [boardId],
  );
  const hiddenArrows = useMemo((): HiddenArrow[] => {
    const titles = new Map(livePuzzles.map((p) => [p._id, p.title]));
    return hiddenArrowDocs
      .flatMap((e) => {
        const feeder = e.feeder && titles.get(e.feeder);
        const meta = e.meta && titles.get(e.meta);
        if (!feeder || !meta) return [];
        return [
          {
            id: e._id,
            title: t("whiteboard.hidden.arrow", "{{feeder}} → {{meta}}", {
              feeder,
              meta,
              // React escapes text, so i18next's escaping would only show
              // entities. Goes once both i18n inits stop escaping.
              interpolation: { escapeValue: false },
            }),
          },
        ];
      })
      .toSorted((a, b) => a.title.localeCompare(b.title));
  }, [hiddenArrowDocs, livePuzzles, t]);
  const notOnBoardCount =
    hiddenCards.length + hiddenFrames.length + hiddenArrows.length;

  // Puts a card back at the middle of the screen, and says which node it is.
  const putBack = useCallback(
    (card: MissingCard) => {
      const center = paneCenter();
      const position = {
        x: Math.round(center.x - CARD_WIDTH / 2),
        y: Math.round(center.y - CARD_HEIGHT / 2),
      };
      const _id = card.id ?? Random.id();
      updateNodes([
        card.id
          ? { _id, hidden: false, parent: null, position }
          : {
              _id,
              type: "puzzle",
              puzzle: card.puzzle,
              position,
              width: CARD_WIDTH,
              height: CARD_HEIGHT,
            },
      ]);
      return _id;
    },
    [paneCenter, updateNodes],
  );

  // Puts a removed frame back, empty and at the top level, at the middle of
  // the screen.
  const putBackFrame = useCallback(
    (id: string) => {
      const doc = nodeDocs.find((d) => d._id === id);
      if (!doc) return;
      const center = paneCenter();
      updateNodes([
        {
          _id: id,
          hidden: false,
          parent: null,
          position: {
            x: Math.round(center.x - (doc.width ?? 0) / 2),
            y: Math.round(center.y - (doc.height ?? 0) / 2),
          },
        },
      ]);
    },
    [nodeDocs, paneCenter, updateNodes],
  );
  const putBackHiddenFrame = useCallback(
    (frame: HiddenFrame) => putBackFrame(frame.id),
    [putBackFrame],
  );

  // Brings back removed feeder arrows.
  const putBackArrows = useCallback(
    (ids: string[]) => {
      chunks(ids, MAX_BATCH).forEach((batch) => {
        upsertWhiteboardEdges.call(
          {
            boardId,
            edges: batch.map((_id) => ({ _id, hidden: false })),
          },
          reportRefusal,
        );
      });
    },
    [boardId, reportRefusal],
  );
  const putBackArrow = useCallback(
    (arrow: HiddenArrow) => putBackArrows([arrow.id]),
    [putBackArrows],
  );
  // Only the arrows the panel lists: one between puzzles that aren't live
  // may be on its way out, and would fail the whole batch.
  const putBackAllArrows = useCallback(
    () => putBackArrows(hiddenArrows.map((a) => a.id)),
    [putBackArrows, hiddenArrows],
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
      closeHiddenPanel();
      // On a phone the thread's sheet covers the bottom of the board, so the
      // board moves the pin up out of its way.
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
    [closeHiddenPanel, compact, threads, absoluteRect, panToPin, flow],
  );

  const closeComment = useCallback(() => {
    setOpenThread(undefined);
    setSteppedThread(undefined);
    setDraft(undefined);
  }, []);

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

  // Brings a point on the board to the middle of the screen, zooming in far
  // enough to read a card.
  const panTo = useCallback(
    (at: XYPosition) => {
      void flow.setCenter(at.x, at.y, {
        zoom: Math.max(flow.getZoom(), 0.8),
        duration: 400,
      });
    },
    [flow],
  );

  // Marks a node, or a point, for a moment after the board pans to it.
  const pulseAt = useCallback(
    (target: { node?: string; point?: XYPosition }) => {
      setNodePulse(target);
      window.clearTimeout(nodePulseTimer.current);
      nodePulseTimer.current = window.setTimeout(
        () => setNodePulse(undefined),
        PULSE_MS,
      );
    },
    [],
  );

  // Pans to a node and marks it, if it's on the board.
  const showNode = useCallback(
    (id: string) => {
      const rect = absoluteRect(id);
      if (!rect) return false;
      panTo(centerOf(rect));
      pulseAt({ node: id });
      return true;
    },
    [absoluteRect, panTo, pulseAt],
  );

  // Pans to the middle of a line and marks it.
  const showLine = useCallback(
    (id: string) => {
      const edge = flow.getEdge(id);
      const from = edge && nodeCenter(edge.source);
      const to = edge && nodeCenter(edge.target);
      if (!from || !to) return;
      const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
      panTo(middle);
      pulseAt({ point: middle });
    },
    [flow, nodeCenter, panTo, pulseAt],
  );

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
      closeHiddenPanel();
      setDraft(undefined);
      setOpenThread(threadId);
      panToPin(at, Math.max(flow.getZoom(), 0.8));
      setPulse(threadId);
      window.clearTimeout(pulseTimer.current);
      pulseTimer.current = window.setTimeout(
        () => setPulse(undefined),
        PULSE_MS,
      );
      return true;
    },
    [threads, absoluteRect, panToPin, flow, closeHiddenPanel],
  );

  // What picking something the search found does: pan to it, or put a
  // puzzle that isn't on the board back and mark it there.
  const showSearchHit = useCallback(
    (hit: BoardSearchHit) => {
      if (hit.node) showNode(hit.node);
      else if (hit.edge) showLine(hit.edge);
    },
    [showNode, showLine],
  );
  const putBackSearchHit = useCallback(
    (hit: BoardSearchHit) => {
      if (readOnly) return;
      if (hit.kind === "frame" && hit.node) {
        putBackFrame(hit.node);
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
  const drawnEdges = useMemo(() => new Set(edges.map((e) => e.id)), [edges]);

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

  // A short message under the toolbar, gone after a while: a link that
  // couldn't be followed, a version that couldn't be loaded, or a restore
  // that worked.
  const [notice, setNotice] = useState<{
    id: number;
    text: string;
    variant: "warning" | "success";
  }>();
  const showNotice = useCallback(
    (text: string, variant: "warning" | "success" = "warning") => {
      const id = Date.now();
      setNotice({ id, text, variant });
      tidyLater(
        () =>
          setNotice((current) => (current?.id === id ? undefined : current)),
        NOTICE_MS,
      );
    },
    [tidyLater],
  );
  const dismissNotice = useCallback(() => setNotice(undefined), []);

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
      // Once loaded, a comment on something that's gone is as ready as it
      // will ever be (showComment then leaves it).
      const doc = WhiteboardNodes.findOne(anchor.node);
      return !doc || !!doc.hidden || !!flow.getInternalNode(anchor.node);
    },
    [threads, boardLoaded, flow],
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

  // A ?puzzle=, ?node= or ?v= link waits in the same way for the board to
  // load, and for the node it names to be laid out.
  const [pendingTarget, setPendingTarget] = useState(initialTarget);
  const [linkedTarget, setLinkedTarget] = useState(
    boardTargetKey(initialTarget),
  );
  if (boardTargetKey(initialTarget) !== linkedTarget) {
    setLinkedTarget(boardTargetKey(initialTarget));
    if (initialTarget) setPendingTarget(initialTarget);
  }
  useEffect(() => {
    if (!pendingTarget || !boardLoaded || !flow.viewportInitialized) return;
    const done = () => {
      setPendingTarget(undefined);
      if (boardTargetKey(pendingTarget) === boardTargetKey(initialTarget)) {
        onInitialTargetShown?.();
      }
    };
    if (pendingTarget.kind === "view") {
      void flow.setCenter(pendingTarget.x, pendingTarget.y, {
        zoom: pendingTarget.zoom,
      });
      done();
      return;
    }
    const doc =
      pendingTarget.kind === "puzzle"
        ? nodeDocs.find(
            (d) => d.type === "puzzle" && d.puzzle === pendingTarget.id,
          )
        : nodeDocs.find((d) => d._id === pendingTarget.id);
    const gone =
      !doc ||
      !!doc.hidden ||
      (doc.type === "puzzle" && !livePuzzleIds.has(doc.puzzle ?? ""));
    if (gone) {
      showNotice(
        pendingTarget.kind === "puzzle"
          ? t("whiteboard.link.puzzleGone", "That puzzle isn't on the board.")
          : t("whiteboard.link.nodeGone", "That isn't on the board any more."),
      );
      // The board skipped fitting itself to open here, so it does now.
      if (!initialViewport && boardTargetKey(pendingTarget) === openedAt) {
        void flow.fitView();
      }
      done();
      return;
    }
    if (showNode(doc._id)) done();
  }, [
    pendingTarget,
    boardLoaded,
    flow,
    nodeDocs,
    livePuzzleIds,
    showNode,
    showNotice,
    t,
    initialTarget,
    initialViewport,
    openedAt,
    onInitialTargetShown,
    nodes,
  ]);

  useEffect(
    () => () => {
      window.clearTimeout(pulseTimer.current);
      window.clearTimeout(nodePulseTimer.current);
    },
    [],
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

  // Whether a pointer event happened on the board itself. React passes on
  // events from dialogs drawn elsewhere on the page (the comment panel's
  // delete dialog) as though they were inside it.
  const onBoard = useCallback(
    (event: React.PointerEvent) =>
      event.target instanceof globalThis.Node &&
      !!wrapperRef.current?.contains(event.target),
    [],
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
      commentTapped.current = false;
      // A second finger means a pinch, not a tap.
      if (
        commentPress.current &&
        commentPress.current.pointerId !== event.pointerId
      ) {
        commentPress.current = undefined;
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
      if (tool === "comment") {
        commentPress.current = {
          point,
          clientX: event.clientX,
          clientY: event.clientY,
          pointerId: event.pointerId,
          pointerType: event.pointerType,
        };
        // A touch is left to React Flow too, so a finger that moves pans the
        // board (and a second one pinches) instead of placing a comment.
        if (event.pointerType === "touch") return;
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
      setLocalStroke({
        color: state.color,
        strokeWidth: state.strokeWidth,
        points: [...state.segmenter.points],
      });
    },
    [
      onBoard,
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
      const press = commentPress.current;
      if (
        press &&
        press.pointerId === event.pointerId &&
        Math.hypot(
          event.clientX - press.clientX,
          event.clientY - press.clientY,
        ) > (press.pointerType === "touch" ? TOUCH_SLOP : CLICK_SLOP)
      ) {
        commentPress.current = undefined;
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
      onBoard,
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
        if (!press || press.pointerId !== event.pointerId) return;
        commentPress.current = undefined;
        if (press.pointerType === "touch") commentTapped.current = true;
        setDraft(commentAnchorAt(press.point));
        setOpenThread(undefined);
        closeHiddenPanel();
        setTool("select");
        // The new comment's sheet would cover a pin low on a phone's screen,
        // so the board moves it up, as it does for a pin that's opened.
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
      closeHiddenPanel,
      compact,
      panToPin,
    ],
  );

  // A cancelled pointer (a touch taken over by a gesture, say) drops a line
  // being drawn or a comment being placed rather than finishing it; anything
  // else ends as usual.
  const onPointerCancel = useCallback(
    (event: React.PointerEvent) => {
      if (connecting) {
        setConnecting(undefined);
        return;
      }
      if (tool === "comment") {
        commentPress.current = undefined;
        return;
      }
      onPointerUp(event);
    },
    [connecting, tool, onPointerUp],
  );

  // The browser follows a tap with mouse events and a click, which would
  // take focus from the composer of the comment the tap just placed, or
  // follow a link it was on.
  const onTapFollowUp = useCallback((event: React.MouseEvent) => {
    if (!commentTapped.current) return;
    event.preventDefault();
    if (event.type === "click") {
      event.stopPropagation();
      commentTapped.current = false;
    }
  }, []);

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
  // handle clicked (React Flow's click-to-connect). Until then a dashed line
  // runs from the handle to the pointer, and Escape lets go of it.
  const storeApi = useStoreApi<WhiteboardFlowNode, WhiteboardFlowEdge>();
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

  // Ctrl+A (Cmd+A on a Mac) selects everything on the board but frames,
  // whose contents are selected anyway, and no lines.
  const selectAll = useCallback(() => {
    const { nodeLookup, edgeLookup, triggerNodeChanges, triggerEdgeChanges } =
      storeApi.getState();
    const nodeChanges: NodeChange<WhiteboardFlowNode>[] = [];
    nodeLookup.forEach((node) => {
      const selected = node.type !== "frame" && !node.hidden;
      if (!!node.selected !== selected) {
        nodeChanges.push({ type: "select", id: node.id, selected });
      }
    });
    const edgeChanges: EdgeChange<WhiteboardFlowEdge>[] = [];
    edgeLookup.forEach((edge) => {
      if (edge.selected) {
        edgeChanges.push({ type: "select", id: edge.id, selected: false });
      }
    });
    triggerNodeChanges(nodeChanges);
    triggerEdgeChanges(edgeChanges);
  }, [storeApi]);

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
      readOnlyForLayout: accessReason === "narrow",
      compact,
      updateNodes,
      updateEdge,
      persistResize,
      beginEndpointDrag,
      editOnAppear,
      clearEditOnAppear,
    }),
    [
      readOnly,
      accessReason,
      compact,
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
    cancelClickConnect();
  }, [tool, setNodes, setEdges, cancelClickConnect]);

  // Whether the board has focus: the last press or focus was on it.
  const canvasActive = useRef(false);
  useEffect(() => {
    const track = (event: Event) => {
      canvasActive.current =
        event.target instanceof globalThis.Node &&
        !!wrapperRef.current?.contains(event.target);
    };
    window.addEventListener("pointerdown", track, true);
    window.addEventListener("focusin", track, true);
    return () => {
      window.removeEventListener("pointerdown", track, true);
      window.removeEventListener("focusin", track, true);
    };
  }, []);

  useEffect(() => {
    const isTyping = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
    // A dialog over the page (deleting a comment, who can edit) has its own
    // keys.
    const inDialog = (target: EventTarget | null) =>
      target instanceof Element && !!target.closest(".modal");
    const onKeyDown = (event: KeyboardEvent) => {
      if (inDialog(event.target)) return;
      if (event.code === "Space") spaceHeld.current = true;
      // / or Ctrl+F searches the board while it has focus. Elsewhere, and
      // from the search field itself, Ctrl+F is the browser's find.
      const modified = event.ctrlKey || event.metaKey;
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
      // leaves a preview, then closes History; then it drops a comment being
      // started, a line being drawn or joined, or an erase, and goes back to
      // Select. The thread's panel closes itself on Escape from inside it,
      // and the restore confirmation does the same.
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
        if (sidePanel === "history") {
          setSidePanel(undefined);
          return;
        }
        setDraft(undefined);
        setConnecting(undefined);
        setErasingStrokes(new Set());
        cancelClickConnect();
        setTool("select");
        return;
      }
      // A tool's key picks it, and 1, 2 and 3 set the pen's width, while the
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
          setTool(keyTool);
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
      if (
        modified &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === "a" &&
        !readOnly &&
        canvasActive.current &&
        !isTyping(event.target)
      ) {
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
  }, [
    readOnly,
    canComment,
    tool,
    flow,
    deleteNodes,
    openThreadId,
    commentListShown,
    confirmingRestore,
    preview,
    previewLoading,
    backToNow,
    sidePanel,
    dismissComment,
    cancelClickConnect,
    selectAll,
    setPenWidth,
    threadRows,
    focusComment,
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
  const toggleHidden = useCallback(() => {
    setSidePanel((current) => (current === "hidden" ? undefined : "hidden"));
    closeComment();
  }, [closeComment]);
  const stopCommenting = useCallback(() => {
    commentPress.current = undefined;
    setTool("select");
  }, []);
  // With a thread (or a comment being started) in the list's place, the
  // button closes it and goes back to the list.
  const toggleCommentList = useCallback(() => {
    if (commentListShown) {
      setSidePanel(undefined);
      return;
    }
    setSidePanel("comments");
    closeComment();
  }, [commentListShown, closeComment]);
  const toggleHistory = useCallback(() => {
    setSidePanel((current) => (current === "history" ? undefined : "history"));
    closeComment();
  }, [closeComment]);

  const showVersion = useCallback(
    (version: WhiteboardVersionType) => {
      previewRequest.current += 1;
      const request = previewRequest.current;
      const failed = (reason: string) =>
        showNotice(
          t(
            "whiteboard.history.loadFailed",
            "Couldn't load that version: {{reason}}",
            {
              reason,
              // React escapes text, so i18next's escaping would only show
              // entities. Goes once both i18n inits stop escaping.
              interpolation: { escapeValue: false },
            },
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

  // A phone-sized screen has no history (see historyButton), so a preview
  // or the panel open when the screen shrinks goes.
  useEffect(() => {
    if (!compact) return;
    backToNow();
    setSidePanel((current) => (current === "history" ? undefined : current));
  }, [compact, backToNow]);
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
  // Being offline gets a banner of its own rather than a reason.
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
  const noticeAlert = notice ? (
    <AccessNotice
      variant={notice.variant}
      dismissible
      closeLabel={t("common.close", "Close")}
      onClose={dismissNotice}
    >
      {notice.text}
    </AccessNotice>
  ) : null;
  const searchTools = (
    <>
      <BoardSearch
        boardId={boardId}
        huntId={huntId}
        drawnEdges={drawnEdges}
        canPutBack={!readOnly}
        inputRef={searchRef}
        onShow={showSearchHit}
        onPutBack={putBackSearchHit}
      />
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
  const saveErrorAlert = saveError ? (
    <AccessNotice
      key={saveError.id}
      variant="danger"
      dismissible
      closeLabel={t("common.close", "Close")}
      onClose={dismissSaveError}
    >
      {t("whiteboard.save.refused", "Couldn't save: {{reason}}", {
        reason: saveError.reason,
        // React escapes text, so i18next's escaping would only show
        // entities. Goes once both i18n inits stop escaping.
        interpolation: { escapeValue: false },
      })}
    </AccessNotice>
  ) : null;
  const offlineAlert =
    accessReason === "offline" ? (
      <AccessNotice variant="warning">
        {t(
          "whiteboard.offline",
          "Offline: the board is view-only until you reconnect",
        )}
      </AccessNotice>
    ) : null;
  const accessNoticeAlert = accessNotice ? (
    <AccessNotice
      variant="info"
      dismissible
      closeLabel={t("common.close", "Close")}
      onClose={dismissAccessNotice}
    >
      {accessNotice === "lost"
        ? t("whiteboard.access.lost", "You can no longer edit this board.")
        : t("whiteboard.access.gained", "You can now edit this board.")}
    </AccessNotice>
  ) : null;
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
              {
                title: commentListTitle,
                count: listUnread,
                // React escapes attributes, so i18next's escaping would only
                // show entities. Goes once both i18n inits stop escaping.
                interpolation: { escapeValue: false },
              },
            )
          : commentListTitle
      }
      aria-pressed={commentListShown}
    >
      <FontAwesomeIcon icon={faComments} />
      <UnreadBadge count={listUnread} />
    </Button>
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
          ? t(
              "whiteboard.offline",
              "Offline: the board is view-only until you reconnect",
            )
          : t(
              "whiteboard.history.cantEdit",
              "Only people who can edit the board can restore it.",
            );
  const restoreLabel = t(
    "whiteboard.history.restoreButton",
    "Restore this version",
  );
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
        <FeederFocusContext value={feederFocusIds}>
          <RoundStateContext value={rounds}>
            <CanvasWrapper
              ref={wrapperRef}
              $tool={tool}
              $readOnly={readOnly}
              onPointerDownCapture={onPointerDownCapture}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
              onPointerLeave={onPointerLeave}
              onMouseDownCapture={onTapFollowUp}
              onClickCapture={onTapFollowUp}
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
                onNodeMouseEnter={onNodeMouseEnter}
                onNodeMouseLeave={onNodeMouseLeave}
                onMove={onMove}
                onMoveEnd={onMoveEnd}
                connectionMode={ConnectionMode.Loose}
                // onConnectEnd decides where a line from a handle ends, so the
                // line being dragged shouldn't snap to a nearby handle either.
                connectionRadius={0}
                colorMode={theme.basicMode === "dark" ? "dark" : "light"}
                defaultViewport={initialViewport}
                fitView={!initialViewport && !openedAt}
                minZoom={MIN_ZOOM}
                maxZoom={MAX_ZOOM}
                nodesDraggable={!readOnly && !drawingTool}
                nodesConnectable={!readOnly && !drawingTool}
                elementsSelectable={!readOnly && !drawingTool}
                panOnDrag={!drawingTool || (compact && tool === "comment")}
                selectionOnDrag={false}
                deleteKeyCode={readOnly ? null : ["Backspace", "Delete"]}
                onlyRenderVisibleElements
                ariaLabelConfig={ariaLabelConfig}
              >
                <Background />
                <Controls showInteractive={false} />
                {showMiniMap && (
                  <MiniMap<WhiteboardFlowNode>
                    pannable
                    zoomable
                    nodeColor={miniMapNodeColor}
                  />
                )}
                <FrameLabelLayer />
                {!preview && (
                  <CursorLayer boardId={boardId} liveEnabled={liveEnabled} />
                )}
                <CommentLayer
                  pins={preview ? NO_PINS : commentPins}
                  openId={openThreadId ?? (draft ? "draft" : undefined)}
                  pulseId={pulse}
                  onOpen={openComment}
                />
                {nodePulse && (
                  <NodePulse node={nodePulse.node} point={nodePulse.point} />
                )}
                {localStroke && localStroke.points.length > 0 && (
                  <ViewportPortal>
                    <LocalStroke>
                      <path
                        d={inkPath(
                          localStroke.points,
                          localStroke.strokeWidth,
                          false,
                        )}
                        fill={
                          colors.stroke[localStroke.color] ?? theme.colors.text
                        }
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
                {clickConnectStart && clickConnectOrigin && (
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
                      {searchTools}
                      <ReadOnlyNote>
                        <span>
                          {t("whiteboard.toolbar.viewingOnly", "Viewing only")}
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
                            onSelect={setTool}
                          />
                        )}
                        {commentListButton}
                        {resolvedCount > 0 && (
                          <Button
                            variant={
                              showResolved ? "secondary" : "outline-secondary"
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
                        {historyButton}
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
                    {offlineAlert}
                    {accessNoticeAlert}
                    {saveErrorAlert}
                    {noticeAlert}
                  </Panel>
                ) : (
                  <Panel position="top-left">
                    <ToolBox>
                      {searchTools}
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
                            title={t(
                              "whiteboard.toolbar.penWidthKeys",
                              "Pen width [1, 2, 3]",
                            )}
                            aria-label={t(
                              "whiteboard.toolbar.penWidth",
                              "Pen width",
                            )}
                            aria-keyshortcuts="1 2 3"
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
                        <CommentToolButton
                          active={tool === "comment"}
                          unread={unreadCount}
                          onSelect={setTool}
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
                      </ButtonGroup>
                      {mayChangeEditPolicy && (
                        <EditPolicyButton
                          policy={editPolicy}
                          onClick={openEditPolicy}
                        />
                      )}
                    </ToolBox>
                    {offlineAlert}
                    {accessNoticeAlert}
                    {saveErrorAlert}
                    {noticeAlert}
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
                {commentListShown && (
                  <Panel position="top-right">
                    <SidePanel className="nodrag nowheel nopan">
                      <strong>{commentListTitle}</strong>
                      <CommentList rows={threadRows} onShow={focusComment} />
                    </SidePanel>
                  </Panel>
                )}
                {sidePanel === "hidden" &&
                  !readOnly &&
                  !draft &&
                  !openThreadData && (
                    <Panel position="top-right">
                      <SidePanel>
                        <strong>{notOnBoardTitle}</strong>
                        <HiddenSection>
                          {t("whiteboard.hidden.puzzles", "Puzzles")}
                        </HiddenSection>
                        {hiddenCards.length === 0 && (
                          <HiddenNone>
                            {t(
                              "whiteboard.hidden.none",
                              "Every puzzle is on the board.",
                            )}
                          </HiddenNone>
                        )}
                        {hiddenCards.map((card) => (
                          <PutBackRow
                            key={card.puzzle}
                            item={card}
                            onPutBack={putBack}
                          />
                        ))}
                        <HiddenSection>
                          {t("whiteboard.hidden.frames", "Frames")}
                        </HiddenSection>
                        {hiddenFrames.length === 0 && (
                          <HiddenNone>
                            {t(
                              "whiteboard.hidden.noFrames",
                              "Every round's frame is on the board.",
                            )}
                          </HiddenNone>
                        )}
                        {hiddenFrames.map((frame) => (
                          <PutBackRow
                            key={frame.id}
                            item={frame}
                            onPutBack={putBackHiddenFrame}
                          />
                        ))}
                        <HiddenSection>
                          {t("whiteboard.hidden.arrows", "Feeder arrows")}
                        </HiddenSection>
                        {!showFeederArrows && hiddenArrows.length > 0 && (
                          <HiddenNone>
                            {t(
                              "whiteboard.hidden.arrowsOff",
                              "Feeder arrows are hidden for you; turn them on in the toolbar to see these.",
                            )}
                          </HiddenNone>
                        )}
                        {hiddenArrows.length === 0 ? (
                          <HiddenNone>
                            {t(
                              "whiteboard.hidden.noArrows",
                              "Every feeder arrow is on the board.",
                            )}
                          </HiddenNone>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline-secondary"
                            onClick={putBackAllArrows}
                          >
                            {t(
                              "whiteboard.hidden.putBackAllArrows",
                              "Put back all feeder arrows",
                            )}
                          </Button>
                        )}
                        {hiddenArrows.map((arrow) => (
                          <PutBackRow
                            key={arrow.id}
                            item={arrow}
                            onPutBack={putBackArrow}
                          />
                        ))}
                      </SidePanel>
                    </Panel>
                  )}
              </ReactFlow>
            </CanvasWrapper>
            {/* Outside the wrapper, whose pointer handlers would otherwise see
            presses in the dialog through React's tree. */}
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
                      {
                        reason: restoreError,
                        // React escapes text, so i18next's escaping would
                        // only show entities. Goes once both i18n inits stop
                        // escaping.
                        interpolation: { escapeValue: false },
                      },
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
          </RoundStateContext>
        </FeederFocusContext>
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
