import { faCheck } from "@fortawesome/free-solid-svg-icons/faCheck";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons/faChevronDown";
import { faChevronRight } from "@fortawesome/free-solid-svg-icons/faChevronRight";
import { faCompress } from "@fortawesome/free-solid-svg-icons/faCompress";
import { faExpand } from "@fortawesome/free-solid-svg-icons/faExpand";
import { faStar } from "@fortawesome/free-solid-svg-icons/faStar";
import { faXmark } from "@fortawesome/free-solid-svg-icons/faXmark";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import Button from "react-bootstrap/Button";
import { useTranslation } from "react-i18next";
import styled, { css } from "styled-components";
import type { WhiteboardNodeType } from "../../../lib/models/WhiteboardNodes";
import type { OutlineLine } from "../../../lib/whiteboard/outline";
import { outlineLines, outlineTree } from "../../../lib/whiteboard/outline";
import type { RoundState } from "../../../lib/whiteboard/rounds";
import LockBadge from "./LockBadge";

// The panel's width beside a wide board.
export const OUTLINE_WIDTH = 260;

// A side panel at the top right or, on a phone, a sheet along the bottom
// (placed by the canvas), with finger-sized rows.
const Box = styled.section<{ $compact: boolean }>`
  display: flex;
  flex-direction: column;
  width: ${OUTLINE_WIDTH}px;
  max-height: 60vh;
  border-radius: 8px;
  background: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.border};
  box-shadow: 0 2px 6px rgb(0 0 0 / 12%);
  font-size: 13px;

  ${({ $compact }) =>
    $compact &&
    css`
      flex: 1 1 auto;
      min-height: 0;
      width: 100%;
      max-height: none;
      border-bottom: none;
      border-radius: 12px 12px 0 0;
      font-size: 15px;
    `}
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 4px 4px 8px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};

  strong {
    flex: 1 1 auto;
  }
`;

const Body = styled.div`
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 4px;
`;

const Tree = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
`;

const Row = styled.button<{ $compact: boolean; $level: number }>`
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: ${({ $compact }) => ($compact ? "44px" : "26px")};
  padding: 2px 6px 2px ${({ $level }) => 2 + ($level - 1) * 14}px;
  border: none;
  border-radius: 4px;
  background: none;
  color: inherit;
  text-align: left;

  &:hover,
  &:focus-visible {
    background: ${({ theme }) => theme.colors.hoverChatMessageBackground};
  }
`;

const Twisty = styled.span<{ $compact: boolean }>`
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: ${({ $compact }) => ($compact ? "32px" : "16px")};
  align-self: stretch;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 11px;
`;

const Label = styled.span<{ $finished: boolean }>`
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: ${({ theme, $finished }) =>
    $finished ? theme.colors.textSecondary : "inherit"};
`;

const Unnamed = styled.span`
  font-style: italic;
`;

const Marker = styled.span`
  flex: none;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Tick = styled(Marker)`
  color: ${({ theme }) => theme.colors.whiteboardFinishedTick};
`;

const Star = styled(Marker)`
  padding: 0 4px;
  border-radius: 8px;
  background: ${({ theme }) => theme.colors.metaBadgeBackground};
  color: ${({ theme }) => theme.colors.metaBadgeText};
  font-size: 11px;
`;

const Count = styled(Marker)`
  font-size: 12px;
`;

const None = styled.div`
  padding: 4px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const TWISTY_CLASS = "jr-outline-twisty";

const OutlineRow = ({
  line,
  focusable,
  compact,
  onShow,
  onToggle,
  onFocused,
}: {
  line: OutlineLine;
  focusable: boolean;
  compact: boolean;
  onShow: (id: string) => void;
  onToggle: (id: string) => void;
  onFocused: (id: string) => void;
}) => {
  const { t } = useTranslation();
  const { row, level, expanded } = line;
  const { id } = row;
  // The chevron folds the row's subtree in the panel; anywhere else on the
  // row shows its frame.
  const onClick = useCallback(
    (event: React.MouseEvent) => {
      if (
        expanded !== undefined &&
        event.target instanceof Element &&
        event.target.closest(`.${TWISTY_CLASS}`)
      ) {
        onToggle(id);
      } else {
        onShow(id);
      }
    },
    [expanded, id, onShow, onToggle],
  );
  const onFocus = useCallback(() => onFocused(id), [id, onFocused]);
  let twisty: React.ReactNode = null;
  if (expanded !== undefined) {
    twisty = (
      <FontAwesomeIcon icon={expanded ? faChevronDown : faChevronRight} />
    );
  }
  const finishedLabel = t("whiteboard.frame.finished", "Finished");
  const readyLabel = t("whiteboard.frame.readyToMeta", "Ready to meta");
  const collapsedLabel = t(
    "whiteboard.outline.collapsed",
    "Collapsed on the board",
  );
  return (
    <li role="none">
      <Row
        type="button"
        role="treeitem"
        aria-level={level}
        aria-expanded={expanded}
        tabIndex={focusable ? 0 : -1}
        data-frame={id}
        $compact={compact}
        $level={level}
        onClick={onClick}
        onFocus={onFocus}
      >
        <Twisty className={TWISTY_CLASS} $compact={compact} aria-hidden>
          {twisty}
        </Twisty>
        <Label $finished={row.finished}>
          {row.label ?? (
            <Unnamed>
              {t("whiteboard.outline.unnamed", "Unnamed frame")}
            </Unnamed>
          )}
        </Label>
        {row.locked && <LockBadge lockedBy={row.lockedBy} corner={false} />}
        {row.collapsed && (
          <Marker title={collapsedLabel}>
            <FontAwesomeIcon icon={faCompress} />
            <span className="visually-hidden">{collapsedLabel}</span>
          </Marker>
        )}
        {row.finished && (
          <Tick title={finishedLabel}>
            <FontAwesomeIcon icon={faCheck} />
            <span className="visually-hidden">{finishedLabel}</span>
          </Tick>
        )}
        {!row.finished && row.readyToMeta && (
          <Star title={readyLabel}>
            <FontAwesomeIcon icon={faStar} />
            <span className="visually-hidden">{readyLabel}</span>
          </Star>
        )}
        {row.total > 0 && (
          <Count>
            {t("whiteboard.frame.solved", "{{solved}}/{{total}} solved", {
              solved: row.solved,
              total: row.total,
            })}
          </Count>
        )}
      </Row>
    </li>
  );
};

// The board's frames as a tree: picking one shows it on the board, and its
// chevron (or the arrow keys) folds what's nested in it here only. What's
// folded and the row last focused are kept by the canvas, so they outlast
// the panel closing, as the phone's sheet does after every pick.
const OutlinePanel = ({
  nodes,
  tagNames,
  rounds,
  compact,
  folded,
  setFolded,
  current,
  setCurrent,
  onShow,
  onFitAll,
  onClose,
}: {
  nodes: readonly WhiteboardNodeType[];
  // Tag names by id, for the frames named after their round.
  tagNames: ReadonlyMap<string, string>;
  rounds: ReadonlyMap<string, RoundState>;
  compact: boolean;
  folded: ReadonlySet<string>;
  setFolded: React.Dispatch<React.SetStateAction<ReadonlySet<string>>>;
  current: string | undefined;
  setCurrent: (id: string) => void;
  onShow: (frameId: string) => void;
  onFitAll: () => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const tree = useMemo(
    () => outlineTree(nodes, rounds, tagNames),
    [nodes, rounds, tagNames],
  );
  const lines = useMemo(() => outlineLines(tree, folded), [tree, folded]);
  const toggle = useCallback(
    (id: string) => {
      setFolded((was) => {
        const next = new Set(was);
        if (!next.delete(id)) next.add(id);
        return next;
      });
    },
    [setFolded],
  );

  // The row that takes focus when the tree is tabbed into: the one last
  // focused, while it's still shown.
  const focusable = lines.some((l) => l.row.id === current)
    ? current
    : lines[0]?.row.id;

  const bodyRef = useRef<HTMLDivElement>(null);
  const fitAllRef = useRef<HTMLButtonElement>(null);
  const focusRow = useCallback((id: string | undefined) => {
    if (!id) return;
    bodyRef.current
      ?.querySelector<HTMLElement>(`[data-frame="${CSS.escape(id)}"]`)
      ?.focus();
  }, []);

  // Opening the panel again scrolls back to the row last focused.
  const openedAt = useRef(focusable);
  useEffect(() => {
    const id = openedAt.current;
    const body = bodyRef.current;
    if (!id || !body) return;
    const row = body.querySelector<HTMLElement>(
      `[data-frame="${CSS.escape(id)}"]`,
    );
    if (!row) return;
    body.scrollTop = row.offsetTop - (body.clientHeight - row.offsetHeight) / 2;
  }, []);

  // Up and Down move between rows (Up from the first goes to Fit whole
  // board), Home and End to the first and last, Right opens a folded row or
  // goes into an open one, Left folds an open row or goes to its parent, and
  // Enter shows the row's frame.
  const onTreeKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const at = lines.findIndex((l) => l.row.id === current);
      const line = lines[at];
      if (!line) return;
      let handled = true;
      switch (event.key) {
        case "ArrowDown":
          focusRow(lines[at + 1]?.row.id);
          break;
        case "ArrowUp":
          if (at === 0) fitAllRef.current?.focus();
          else focusRow(lines[at - 1]?.row.id);
          break;
        case "Home":
          focusRow(lines[0]?.row.id);
          break;
        case "End":
          focusRow(lines.at(-1)?.row.id);
          break;
        case "ArrowRight":
          if (line.expanded === false) toggle(line.row.id);
          else if (line.expanded) focusRow(lines[at + 1]?.row.id);
          break;
        case "ArrowLeft":
          if (line.expanded) toggle(line.row.id);
          else focusRow(line.parent);
          break;
        case "Enter":
          onShow(line.row.id);
          break;
        default:
          handled = false;
      }
      if (handled) event.preventDefault();
    },
    [lines, current, focusRow, toggle, onShow],
  );
  const onFitAllKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key !== "ArrowDown") return;
      event.preventDefault();
      focusRow(focusable);
    },
    [focusRow, focusable],
  );
  // Escape closes the panel from inside it, before the board takes the key.
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    },
    [onClose],
  );

  const title = t("whiteboard.outline.title", "Outline");
  return (
    <Box
      $compact={compact}
      className="nodrag nowheel nopan nokey"
      aria-label={title}
      onKeyDown={onKeyDown}
    >
      <Header>
        <strong>{title}</strong>
        <Button
          size={compact ? "lg" : "sm"}
          variant="link"
          onClick={onClose}
          aria-label={t("common.close", "Close")}
        >
          <FontAwesomeIcon icon={faXmark} />
        </Button>
      </Header>
      <Body ref={bodyRef}>
        <Row
          ref={fitAllRef}
          type="button"
          $compact={compact}
          $level={1}
          onClick={onFitAll}
          onKeyDown={onFitAllKeyDown}
        >
          <Twisty $compact={compact} aria-hidden>
            <FontAwesomeIcon icon={faExpand} />
          </Twisty>
          <Label $finished={false}>
            {t("whiteboard.outline.fitAll", "Fit whole board")}
          </Label>
        </Row>
        {lines.length === 0 ? (
          <None>
            {t("whiteboard.outline.none", "There are no frames on the board.")}
          </None>
        ) : (
          <Tree
            role="tree"
            aria-label={title}
            tabIndex={-1}
            onKeyDown={onTreeKeyDown}
          >
            {lines.map((line) => (
              <OutlineRow
                key={line.row.id}
                line={line}
                focusable={line.row.id === focusable}
                compact={compact}
                onShow={onShow}
                onToggle={toggle}
                onFocused={setCurrent}
              />
            ))}
          </Tree>
        )}
      </Body>
    </Box>
  );
};

export default OutlinePanel;
