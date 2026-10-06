import { faComment } from "@fortawesome/free-solid-svg-icons/faComment";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Panel, useInternalNode } from "@xyflow/react";
import React, { useCallback, useMemo } from "react";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import FormSelect from "react-bootstrap/FormSelect";
import { useTranslation } from "react-i18next";
import styled, { css, useTheme } from "styled-components";
import useKeyboardInset from "../../hooks/useKeyboardInset";
import usePuzzleViewers from "../../hooks/usePuzzleViewers";
import type { WhiteboardFlowNode } from "../../hooks/useWhiteboardSync";
import colors from "./colors";
import { boxOf } from "./floatingEdgeParams";
import { MARKER_CLASS, markerBlend } from "./marker";
import PeopleContext from "./PeopleContext";
import type { PlaceTool, Tool } from "./tools";
import { TOOL_KEYS } from "./tools";

// The parts of the canvas around the board: its wrapper, the toolbars' and
// panels' boxes, the overlays drawn over the board while something is
// placed, drawn or uploaded, and the small buttons the toolbars share.

// For text React renders, which it escapes itself, so i18next's escaping
// would only show entities. Goes once both i18n inits stop escaping.
export const NO_ESCAPE = { interpolation: { escapeValue: false } };

export const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
// A dialog over the page (deleting a comment, who can edit) has its own keys.
export const inDialog = (target: EventTarget | null) =>
  target instanceof Element && !!target.closest(".modal");
// Whether something is on the board itself, rather than a panel over it.
export const onTheBoard = (target: EventTarget | null) =>
  target instanceof Element && !!target.closest(".react-flow__renderer");

// Marks what a preview has differently from the board as it is now.
export const CHANGED_CLASS = "jr-changed";

// An invisible target for a finger, `size` across, centred on the handle,
// resize corner or grip it's the ::after of.
const touchTarget = (size: string) => css`
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: ${size};
  height: ${size};
  transform: translate(-50%, -50%);
`;

export const CanvasWrapper = styled.div<{
  $tool: Tool;
  $readOnly: boolean;
  $whosHereHeight: number;
  $coarse: boolean;
  $clickConnecting: boolean;
}>`
  /* stylelint-disable selector-class-pattern -- React Flow's class names */
  position: relative;
  width: 100%;
  height: 100%;
  cursor: ${({ $tool }) => ($tool === "select" ? "auto" : "crosshair")};

  /* The board's background, which a downloaded picture uses too. */
  --xy-background-color: ${({ theme }) => theme.colors.whiteboardBackground};

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

  /* A highlighter stroke blends with what's under it (see marker.ts). */
  .react-flow__node-ink:has(.${MARKER_CLASS}) {
    mix-blend-mode: ${({ theme }) => markerBlend(theme)};
  }

  /* In a preview, what the version has differently from the board. */
  .react-flow__node.${CHANGED_CLASS} {
    outline: 3px solid ${({ theme }) => theme.colors.whiteboardPreviewChanged};
    outline-offset: 4px;
    border-radius: 8px;
  }

  .react-flow__edge.${CHANGED_CLASS} .react-flow__edge-path {
    filter: drop-shadow(
      0 0 3px ${({ theme }) => theme.colors.whiteboardPreviewChanged}
    );
  }

  /* On a puzzle page the chat toggle sits at the pane's top left, so the
     toolbar starts clear of it (see PuzzlePane). */
  .react-flow__panel.top.left {
    margin-left: max(15px, var(--jr-pane-left-inset, 0px));
  }

  /* The panels at the top right open below who's here (see WhosHere). */
  ${({ $whosHereHeight }) =>
    $whosHereHeight > 0 &&
    css`
      .react-flow__panel.top.right {
        top: ${$whosHereHeight}px;
      }
    `}

  /* On a phone a thread, or the Outline, opens in a sheet along the bottom,
     as wide as the board, clear of the keyboard and short of the top of
     both the screen and the board. */
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

  /* On a touch screen, for someone who can edit, a long press on the board
     selects rather than calling up the browser's own menu. A finger gets a
     44px target on a selected node's handles and resize corners (sized by
     TouchTargetSize, which allows for the zoom) and on a line's grips,
     without them looking any bigger. There's no hover to show where a
     click-to-connect line can end, so every handle shows until it's
     joined. */
  ${({ $coarse, $readOnly, $clickConnecting }) =>
    $coarse &&
    css`
      ${
        !$readOnly &&
        css`
        .react-flow__node,
        .react-flow__pane {
          -webkit-touch-callout: none;
        }
      `
      }

      .react-flow__node.selected .react-flow__handle::after {
        ${touchTarget("var(--jr-touch-target, 44px)")}
      }

      .react-flow__resize-control.handle::after {
        ${touchTarget("var(--jr-resize-target, 44px)")}
      }

      .jr-line-grip::after {
        ${touchTarget("44px")}
      }

      ${
        $clickConnecting &&
        css`
        .react-flow__handle {
          opacity: 1;
        }

        .react-flow__handle::after {
          ${touchTarget("var(--jr-touch-target, 44px)")}
        }
      `
      }
    `}
`;

export const ToolBox = styled.div`
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

export const SidePanel = styled.div`
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

// The pen's width, or the Shape tool's shape, beside the tool.
export const ToolSelect = styled(FormSelect)`
  width: auto;
`;

export const ReadOnlyNote = styled.div`
  display: flex;
  flex-direction: column;
  padding: 0 4px;
  font-size: 13px;
`;

export const ReadOnlyReason = styled.span`
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export const PreviewItemBox = styled(ToolBox)`
  max-width: 320px;
  font-size: 13px;
`;

// Where a thread's panel, or the Outline, goes: the top right of the board
// or, on a phone, a sheet along its bottom that rises above the keyboard. It
// stays the same element either way, so the screen changing size mid-reply
// doesn't throw away what's been typed.
export const CommentPanelPlace = ({
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

// The Outline's toolbar button, finger-sized on a phone.
export const OutlineButton = styled(Button)<{ $compact: boolean }>`
  ${({ $compact }) =>
    $compact &&
    css`
      min-width: 44px;
      min-height: 44px;
    `}
`;

// The read-only toolbar's buttons, finger-sized on a phone.
export const ReadOnlyButtons = styled(ButtonGroup)<{ $compact: boolean }>`
  ${({ $compact }) =>
    $compact &&
    css`
      > .btn {
        min-width: 44px;
        min-height: 44px;
      }
    `}
`;

export const CommentHint = styled.output`
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

export const PreviewBanner = styled.output`
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

export const PlaceGhost = styled.div<{ $tool: PlaceTool; $ellipse: boolean }>`
  position: absolute;
  left: 0;
  top: 0;
  pointer-events: none;
  border: 2px dashed ${({ theme }) => theme.colors.primary};
  border-radius: ${({ $tool, $ellipse }) => {
    if ($ellipse) return "50%";
    return $tool === "frame" ? "10px" : "2px";
  }};
  background: ${({ $tool }) =>
    $tool === "sticky" ? `${colors.fill.yellow}99` : "transparent"};
`;

export const UploadPlaceholder = styled.output`
  position: absolute;
  left: 0;
  top: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  border: 2px dashed ${({ theme }) => theme.colors.border};
  background: ${colors.fill.gray}99;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export const LocalStroke = styled.svg<{ $marker?: boolean }>`
  position: absolute;
  left: 0;
  top: 0;
  overflow: visible;
  pointer-events: none;
  ${({ $marker, theme }) =>
    $marker &&
    css`
      mix-blend-mode: ${markerBlend(theme)};
    `}
`;

// Takes focus for a moment when a tap places a note (see keyboardCatcher):
// out of sight but still focusable, at 16px so iOS doesn't zoom in on it.
export const KeyboardCatcher = styled.input`
  position: absolute;
  left: 0;
  top: 0;
  width: 1px;
  height: 1px;
  padding: 0;
  border: 0;
  opacity: 0;
  font-size: 16px;
  pointer-events: none;
`;

// On a touch screen only a selected node can be dragged, so a finger on one
// that isn't selected pans the board, as it would on the empty board (React
// Flow keeps a draggable node's presses from panning). Each copy is kept
// while its node is unchanged, so React Flow sees the same object.
const notDraggable = new WeakMap<WhiteboardFlowNode, WhiteboardFlowNode>();
export const dragOnlySelected = (node: WhiteboardFlowNode) => {
  if (node.selected || node.draggable === false) return node;
  let copy = notDraggable.get(node);
  if (!copy) {
    copy = { ...node, draggable: false };
    notDraggable.set(node, copy);
  }
  return copy;
};

// The dashed outline around something a line end will attach to. It follows
// the node through React Flow's store, so it keeps up as the node moves.
export const AttachOutline = React.memo(({ id }: { id: string }) => {
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
export const ToolButton = ({
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
    ...NO_ESCAPE,
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
export const UnreadBadge = ({ count }: { count: number }) =>
  count > 0 ? (
    <Badge pill bg="danger" className="ms-1 jr-unread-comments">
      {count > 99 ? "99+" : count}
    </Badge>
  ) : null;

// The Comment tool, on the full toolbar and on a board that can only be
// commented on, with the count of unread threads.
export const CommentToolButton = ({
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
              { title, count: unread, ...NO_ESCAPE },
            )
          : title
      }
    >
      <FontAwesomeIcon icon={faComment} />
      <UnreadBadge count={unread} />
    </ToolButton>
  );
};

// Who is on each puzzle, worked out once for the board as the puzzle list
// does it. Its own component, so the minute clock and presence changes
// re-render only the cards whose people changed, not the whole canvas.
export const PuzzlePeopleProvider = ({
  huntId,
  children,
}: {
  huntId: string;
  children: React.ReactNode;
}) => {
  const people = usePuzzleViewers(huntId, true);
  return <PeopleContext value={people}>{children}</PeopleContext>;
};
