import { useTracker } from "meteor/react-meteor-data";
import { faCheck } from "@fortawesome/free-solid-svg-icons/faCheck";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons/faChevronDown";
import { faChevronRight } from "@fortawesome/free-solid-svg-icons/faChevronRight";
import { faComment } from "@fortawesome/free-solid-svg-icons/faComment";
import { faEye } from "@fortawesome/free-solid-svg-icons/faEye";
import { faEyeSlash } from "@fortawesome/free-solid-svg-icons/faEyeSlash";
import { faStar } from "@fortawesome/free-solid-svg-icons/faStar";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { Node, NodeProps } from "@xyflow/react";
import React, { useCallback, useContext } from "react";
import Button from "react-bootstrap/Button";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import Tags from "../../../lib/models/Tags";
import type { WhiteboardNodeType } from "../../../lib/models/WhiteboardNodes";
import { frameLabel } from "../../../lib/whiteboard/layout";
import { MAX_LABEL_LENGTH } from "../../../lib/whiteboard/limits";
import useWhiteboardDetail from "../../hooks/useWhiteboardDetail";
import CollapseContext from "./CollapseContext";
import colors from "./colors";
import EditableText from "./EditableText";
import LockBadge from "./LockBadge";
import NodeChrome from "./NodeChrome";
import NodeContributors from "./NodeContributors";
import RoundStateContext from "./RoundStateContext";
import { useWhiteboard } from "./WhiteboardContext";

type FrameNodeType = Node<
  { doc: WhiteboardNodeType; collapsed?: boolean; collapsedForAll?: boolean },
  "frame"
>;

// A finished round's fill drops from 40% to 20%, so it recedes. A collapsed
// frame has a dashed edge, in the warning colour while it hides an unsolved
// puzzle.
const FrameBox = styled.div<{
  $fill: string | undefined;
  $selected: boolean;
  $finished: boolean;
  $collapsed: boolean;
  $unsolvedInside: boolean;
}>`
  width: 100%;
  height: 100%;
  border-radius: 10px;
  border: ${({ $collapsed }) => ($collapsed ? "2px dashed" : "1px solid")}
    ${({ theme, $selected, $unsolvedInside }) => {
      if ($selected) return theme.colors.primary;
      if ($unsolvedInside) return theme.colors.whiteboardUnsolvedInside;
      return theme.colors.border;
    }};
  background: ${({ $fill, $finished }) => {
    if ($fill) return `${$fill}${$finished ? "33" : "66"}`;
    return $finished ? "rgb(128 128 128 / 4%)" : "rgb(128 128 128 / 7%)";
  }};
`;

const Header = styled.div<{ $finished: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  height: 48px;
  padding: 0 16px;
  font-size: 18px;
  font-weight: 600;
  color: ${({ theme, $finished }) =>
    $finished ? theme.colors.textSecondary : theme.colors.text};
  overflow: hidden;
  white-space: nowrap;
`;

const FinishedTick = styled(FontAwesomeIcon)`
  flex: 0 0 auto;
  color: ${({ theme }) => theme.colors.whiteboardFinishedTick};
`;

// The status gives way before the round's name does in a narrow frame.
const Progress = styled.span`
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 14px;
  font-weight: normal;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

// The card meta badge's colours, as this round's meta is next.
const ReadyToMeta = styled.span`
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 0 8px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: bold;
  background: ${({ theme }) => theme.colors.metaBadgeBackground};
  color: ${({ theme }) => theme.colors.metaBadgeText};
`;

const Label = styled.div`
  flex: 1 1 auto;
  min-width: 4em;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const HeaderButton = styled(Button)`
  flex: 0 0 auto;
  padding: 0 4px;
  font-size: 14px;
  line-height: 1;
  color: inherit;
`;

// A collapsed frame's open threads, which open the frame for this viewer.
const HiddenComments = styled(Button)`
  flex: 0 0 auto;
  padding: 0 8px;
  border-radius: 10px;
  font-size: 13px;
  white-space: nowrap;
`;

// A frame's way to collapse or expand it for everyone, for the header and
// the toolbar above a selected frame.
const CollapseForAllButton = ({
  id,
  collapsedForAll,
  variant,
}: {
  id: string;
  collapsedForAll: boolean;
  variant: "header" | "toolbar";
}) => {
  const { t } = useTranslation();
  const { setCollapsed } = useContext(CollapseContext);
  const onClick = useCallback(
    () => setCollapsed(id, !collapsedForAll),
    [id, collapsedForAll, setCollapsed],
  );
  const label = collapsedForAll
    ? t("whiteboard.frame.expandAll", "Expand for everyone")
    : t("whiteboard.frame.collapseAll", "Collapse for everyone");
  if (variant === "toolbar") {
    return (
      <Button
        size="sm"
        variant="outline-secondary"
        className="nodrag"
        onClick={onClick}
      >
        {label}
      </Button>
    );
  }
  return (
    <HeaderButton
      size="sm"
      variant="link"
      className="nodrag nopan"
      title={label}
      aria-label={label}
      aria-expanded={!collapsedForAll}
      onClick={onClick}
    >
      <FontAwesomeIcon
        icon={collapsedForAll ? faChevronRight : faChevronDown}
      />
    </HeaderButton>
  );
};

// Opens a collapsed frame for this viewer only, or folds it again.
const PeekButton = ({
  id,
  collapsed,
  chevron,
}: {
  id: string;
  // Drawn folded for this viewer.
  collapsed: boolean;
  // The header's only folding control, for someone who can't fold it for
  // everyone, so it looks like one.
  chevron: boolean;
}) => {
  const { t } = useTranslation();
  const { peek, unpeek } = useContext(CollapseContext);
  const onClick = useCallback(
    () => (collapsed ? peek(id) : unpeek(id)),
    [id, collapsed, peek, unpeek],
  );
  const label = collapsed
    ? t("whiteboard.frame.peek", "Show (only for you)")
    : t("whiteboard.frame.unpeek", "Hide again");
  let icon = collapsed ? faEye : faEyeSlash;
  if (chevron) icon = collapsed ? faChevronRight : faChevronDown;
  return (
    <HeaderButton
      size="sm"
      variant="link"
      className="nodrag nopan"
      title={label}
      aria-label={label}
      aria-expanded={chevron ? !collapsed : undefined}
      onClick={onClick}
    >
      <FontAwesomeIcon icon={icon} />
    </HeaderButton>
  );
};

const FrameNode = ({ id, data, selected }: NodeProps<FrameNodeType>) => {
  const { readOnly, updateNodes, editOnAppear, clearEditOnAppear } =
    useWhiteboard();
  const detail = useWhiteboardDetail();
  const { t } = useTranslation();
  const { doc } = data;
  const collapsed = !!data.collapsed;
  const collapsedForAll = !!data.collapsedForAll;
  const fold = useContext(CollapseContext);
  const peeked = fold.peeked.has(id);
  const summary = collapsed ? fold.summaries.get(id) : undefined;
  const { peek } = fold;
  const peekForComments = useCallback(() => peek(id), [id, peek]);

  const tagName = useTracker(
    () => (doc.tag ? Tags.findOne(doc.tag)?.name : undefined),
    [doc.tag],
  );
  const label = frameLabel(doc, tagName);
  const round = useContext(RoundStateContext).get(id);
  const finished = !!round?.finished;
  const cardCount = round ? round.cards.solved + round.cards.unsolved : 0;
  // A finished round says so in place of its count, since its unsolved
  // count covers nested frames and the count doesn't.
  let roundStatus: React.ReactNode = null;
  if (round?.finished) {
    roundStatus = (
      <Progress>
        {round.allCards.unsolved > 0
          ? t(
              "whiteboard.frame.finishedUnsolved",
              "Finished, {{count}} unsolved",
              {
                count: round.allCards.unsolved,
              },
            )
          : t("whiteboard.frame.finished", "Finished")}
      </Progress>
    );
  } else if (round?.readyToMeta) {
    roundStatus = (
      <ReadyToMeta>
        <FontAwesomeIcon icon={faStar} />{" "}
        {t("whiteboard.frame.readyToMeta", "Ready to meta")}
      </ReadyToMeta>
    );
  }

  const onLabel = useCallback(
    (text: string, onSaved: (refused: boolean) => void) =>
      updateNodes([{ _id: id, label: text || null }], (error) =>
        onSaved(!!error),
      ),
    [id, updateNodes],
  );
  const fill = doc.color ? colors.fill[doc.color] : undefined;
  // Seeded frames take their name from the tag, so only hand-made frames
  // have an editable label. A locked one's label is shown read-only, so a
  // lock arriving mid-edit keeps what was typed as unsaved.
  const locked = !!doc.locked;
  const editable = doc.frameKind === "user" && !readOnly;
  // Folding for everyone is an edit; anyone can open a collapsed frame for
  // themselves.
  const mayFold = !readOnly;
  const canPeek = collapsedForAll && (collapsed || peeked);

  let collapsedCount: React.ReactNode = null;
  if (summary) {
    const total = summary.solved + summary.unsolved;
    collapsedCount = (
      <Progress>
        {total > 0
          ? t("whiteboard.frame.solved", "{{solved}}/{{total}} solved", {
              solved: summary.solved,
              total,
            })
          : t("whiteboard.frame.items", "{{count}} items", {
              count: summary.items,
            })}
      </Progress>
    );
  }
  const commentCount = summary?.comments ?? 0;

  return (
    <FrameBox
      $fill={fill}
      $selected={selected}
      $finished={finished}
      $collapsed={collapsed}
      $unsolvedInside={!!summary && summary.unsolved > 0}
    >
      <NodeChrome
        id={id}
        kind="frame"
        selected={selected}
        color={doc.color}
        palette={colors.fill}
        resizable={!collapsed}
        locked={locked}
        tools={
          <CollapseForAllButton
            id={id}
            collapsedForAll={collapsedForAll}
            variant="toolbar"
          />
        }
      />
      {detail === "far" ? null : (
        <Header $finished={finished}>
          {mayFold ? (
            <CollapseForAllButton
              id={id}
              collapsedForAll={collapsedForAll}
              variant="header"
            />
          ) : (
            canPeek && <PeekButton id={id} collapsed={collapsed} chevron />
          )}
          {mayFold && canPeek && (
            <PeekButton id={id} collapsed={collapsed} chevron={false} />
          )}
          {locked && <LockBadge lockedBy={doc.lockedBy} corner={false} />}
          {finished && <FinishedTick icon={faCheck} />}
          <Label>
            {editable ? (
              <EditableText
                value={doc.label}
                onCommit={onLabel}
                readOnly={readOnly || locked}
                multiline={false}
                maxLength={MAX_LABEL_LENGTH}
                placeholder={t("whiteboard.frame.placeholder", "Frame")}
                startEditing={editOnAppear === id}
                onStartedEditing={clearEditOnAppear}
              />
            ) : (
              label
            )}
          </Label>
          {collapsedCount}
          {round && !collapsed && !finished && cardCount > 0 && (
            <Progress>
              {t("whiteboard.frame.solved", "{{solved}}/{{total}} solved", {
                solved: round.cards.solved,
                total: cardCount,
              })}
            </Progress>
          )}
          {roundStatus}
          {commentCount > 0 && (
            <HiddenComments
              size="sm"
              variant="outline-secondary"
              className="nodrag nopan"
              title={t("whiteboard.frame.peek", "Show (only for you)")}
              onClick={peekForComments}
            >
              <FontAwesomeIcon icon={faComment} />{" "}
              {t("whiteboard.frame.comments", "{{count}} comments", {
                count: commentCount,
              })}
            </HiddenComments>
          )}
          <NodeContributors contributors={doc.contributors} />
        </Header>
      )}
    </FrameBox>
  );
};

export default React.memo(FrameNode);
