import { useTracker } from "meteor/react-meteor-data";
import { faAngleDoubleUp } from "@fortawesome/free-solid-svg-icons/faAngleDoubleUp";
import { faAngleDown } from "@fortawesome/free-solid-svg-icons/faAngleDown";
import { faEye } from "@fortawesome/free-solid-svg-icons/faEye";
import { faLock } from "@fortawesome/free-solid-svg-icons/faLock";
import { faPhone } from "@fortawesome/free-solid-svg-icons/faPhone";
import { faStar } from "@fortawesome/free-solid-svg-icons/faStar";
import { faUpRightFromSquare } from "@fortawesome/free-solid-svg-icons/faUpRightFromSquare";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { Node, NodeProps } from "@xyflow/react";
import React, { useContext } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import styled, { css } from "styled-components";
import Hunts from "../../../lib/models/Hunts";
import Puzzles from "../../../lib/models/Puzzles";
import Tags from "../../../lib/models/Tags";
import type { WhiteboardNodeType } from "../../../lib/models/WhiteboardNodes";
import { puzzleStatusFromTags } from "../../../lib/puzzleTagStatus";
import type { Solvedness } from "../../../lib/solvedness";
import { computeSolvedness } from "../../../lib/solvedness";
import { isLocationTag } from "../../../lib/tagNames";
import usePuzzleViewerUsers from "../../hooks/usePuzzleViewerUsers";
import useTagSynonyms from "../../hooks/useTagSynonyms";
import useWhiteboardDetail from "../../hooks/useWhiteboardDetail";
import AvatarStack from "../AvatarStack";
import PuzzleAnswer from "../PuzzleAnswer";
import { LOCATION_TAG_COLOR, NEEDS_TAG_COLOR } from "../tagColors";
import NodeHandles from "./NodeHandles";
import PeopleContext from "./PeopleContext";

type PuzzleCardNodeType = Node<{ doc: WhiteboardNodeType }, "puzzle">;

const Card = styled.div<{
  $solvedness: Solvedness;
  $locked: boolean;
  $selected: boolean;
  $stuckEdge: boolean;
}>`
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: 6px;
  border: 1px solid
    ${({ theme, $selected }) =>
      $selected ? theme.colors.primary : theme.colors.border};
  box-shadow:
    ${({ $selected, theme }) =>
      $selected
        ? `0 0 0 2px ${theme.colors.primary}`
        : "0 1px 2px rgb(0 0 0 / 15%)"}
    ${({ $stuckEdge, theme }) =>
      $stuckEdge
        ? `, inset 0 0 0 4px ${theme.colors.whiteboardStuckEdge}`
        : ""};
  background-color: ${({ theme, $solvedness }) =>
    theme.colors.solvedness[$solvedness]};
  color: ${({ theme }) => theme.colors.text};
  ${({ $locked, theme }) =>
    $locked &&
    css`
      background-image: repeating-linear-gradient(
        -45deg,
        transparent,
        transparent 8px,
        ${theme.colors.lockedPuzzleStripe} 8px,
        ${theme.colors.lockedPuzzleStripe} 16px
      );
    `}
`;

const Full = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 6px 8px;
  gap: 2px;
  font-size: 13px;
`;

const TopRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 18px;
`;

// The puzzle list's meta badge colour, as a smaller pill.
const MetaBadge = styled.span`
  background: ${({ theme }) => theme.colors.metaBadgeBackground};
  color: ${({ theme }) => theme.colors.metaBadgeText};
  border-radius: 8px;
  padding: 0 6px;
  font-size: 11px;
  font-weight: bold;
  text-transform: uppercase;
`;

// needs: and location tags, coloured as the puzzle list's tag chips are.
const Chips = styled.span`
  display: flex;
  gap: 4px;
  min-width: 0;
  overflow: hidden;
`;

const Chip = styled.span<{ $location: boolean }>`
  flex: 0 1 auto;
  min-width: 0;
  padding: 0 4px;
  border-radius: 3px;
  font-size: 10px;
  line-height: 16px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #000;
  background-color: ${({ $location }) =>
    $location ? LOCATION_TAG_COLOR : NEEDS_TAG_COLOR};
`;

// Priority, stuck and the open link, at the right of the top row.
const TopRight = styled.span`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  flex: 0 0 auto;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const PriorityHigh = styled.span`
  color: ${({ theme }) => theme.colors.priorityHighIcon};
`;

const OpenLink = styled(Link)`
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Title = styled.div`
  font-weight: 600;
  line-height: 1.25;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
`;

const AnswerRow = styled.div`
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
`;

const AnswerLabel = styled.span`
  font-size: 10px;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Answers = styled.span`
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Count = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const LockedSummary = styled.div`
  font-size: 12px;
  opacity: 0.75;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const PeopleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: auto;
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const PeopleGroup = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
`;

const Mid = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  height: 100%;
  padding: 8px 10px;
  font-size: 22px;
  line-height: 1.2;
  gap: 4px;
`;

const Far = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 8px;
  font-size: 28px;
  font-weight: bold;
  line-height: 1.1;
  text-align: center;
  overflow: hidden;
  overflow-wrap: anywhere;
`;

const People = ({ puzzleId }: { puzzleId: string }) => {
  const viewers = useContext(PeopleContext)?.[puzzleId];
  const { callers: callerUsers, viewers: viewerUsers } =
    usePuzzleViewerUsers(viewers);

  if (callerUsers.length === 0 && viewerUsers.length === 0) return null;
  return (
    <PeopleRow>
      {callerUsers.length > 0 && (
        <PeopleGroup>
          <FontAwesomeIcon icon={faPhone} />
          <AvatarStack users={callerUsers} size={18} />
        </PeopleGroup>
      )}
      {viewerUsers.length > 0 && (
        <PeopleGroup>
          <FontAwesomeIcon icon={faEye} />
          <AvatarStack users={viewerUsers} size={18} />
        </PeopleGroup>
      )}
    </PeopleRow>
  );
};

const PuzzleCardNode = ({ data, selected }: NodeProps<PuzzleCardNodeType>) => {
  const detail = useWhiteboardDetail();
  const { t } = useTranslation();
  const puzzle = useTracker(
    () => Puzzles.findOne(data.doc.puzzle),
    [data.doc.puzzle],
  );
  const huntId = puzzle?.hunt;
  const hunt = useTracker(
    () => (huntId ? Hunts.findOne(huntId) : undefined),
    [huntId],
  );
  // The same tags make a meta, a priority or a stuck flag as in the puzzle
  // list.
  const tagKey = puzzle?.tags.join(",") ?? "";
  const tagSynonyms = useTagSynonyms();
  const status = useTracker(() => {
    const tagIds = tagKey ? tagKey.split(",") : [];
    const names = new Map(
      Tags.find({ _id: { $in: tagIds } }).map((tag) => [tag._id, tag.name]),
    );
    return puzzleStatusFromTags(
      tagIds.map((id) => names.get(id)),
      tagSynonyms,
    );
  }, [tagKey, tagSynonyms]);

  if (!puzzle) return null;

  const openPuzzle = t("whiteboard.card.openPuzzle", "Open puzzle");
  let metaKind: string | undefined;
  if (status.meta === "metameta") {
    metaKind = t("puzzleList.metameta", "Metameta");
  } else if (status.meta === "meta") {
    metaKind = t("puzzleList.meta", "Meta");
  }
  const highPriority = t("puzzleList.highPriority", "High priority");
  const lowPriority = t("puzzleList.lowPriority", "Low priority");
  const stuck = t("puzzleList.stuck", "Stuck");
  const solvedness = computeSolvedness(puzzle);
  const locked = !!puzzle.locked && !!hunt?.allowUnlockablePuzzles;
  const answers =
    puzzle.answers.length > 0 ? (
      puzzle.answers.map((answer, i) => (
        <React.Fragment key={answer}>
          {i > 0 && ", "}
          <PuzzleAnswer answer={answer} />
        </React.Fragment>
      ))
    ) : (
      <span>—</span>
    );

  let body: React.ReactNode;
  if (detail === "far") {
    body = (
      <Far title={puzzle.title}>
        {puzzle.answers[0] !== undefined ? (
          <PuzzleAnswer answer={puzzle.answers[0]} />
        ) : (
          puzzle.title.split(/\s+/)[0]
        )}
      </Far>
    );
  } else if (detail === "mid") {
    body = (
      <Mid>
        <Title>{puzzle.title}</Title>
        {locked ? null : <Answers>{answers}</Answers>}
      </Mid>
    );
  } else {
    body = (
      <Full>
        <TopRow>
          {locked && <FontAwesomeIcon icon={faLock} />}
          {metaKind && (
            <MetaBadge>
              <FontAwesomeIcon icon={faStar} /> {metaKind}
            </MetaBadge>
          )}
          {status.chips.length > 0 && (
            <Chips>
              {status.chips.map((chip) => (
                <Chip
                  key={chip}
                  $location={isLocationTag(chip, tagSynonyms)}
                  title={chip}
                >
                  {chip}
                </Chip>
              ))}
            </Chips>
          )}
          <TopRight>
            {status.priority === "high" && (
              <PriorityHigh title={highPriority}>
                <FontAwesomeIcon icon={faAngleDoubleUp} />
                <span className="visually-hidden">{highPriority}</span>
              </PriorityHigh>
            )}
            {status.priority === "low" && (
              <span title={lowPriority}>
                <FontAwesomeIcon icon={faAngleDown} />
                <span className="visually-hidden">{lowPriority}</span>
              </span>
            )}
            {status.stuck && (
              <span title={stuck}>
                <span aria-hidden>🤷</span>
                <span className="visually-hidden">{stuck}</span>
              </span>
            )}
            <OpenLink
              to={`/hunts/${puzzle.hunt}/puzzles/${puzzle._id}`}
              className="nodrag"
              title={openPuzzle}
              aria-label={openPuzzle}
            >
              <FontAwesomeIcon icon={faUpRightFromSquare} />
            </OpenLink>
          </TopRight>
        </TopRow>
        <Title>{puzzle.title}</Title>
        {locked ? (
          <LockedSummary title={puzzle.lockedSummary}>
            {puzzle.lockedSummary}
          </LockedSummary>
        ) : (
          <AnswerRow>
            <AnswerLabel>{t("whiteboard.card.answer", "Answer")}</AnswerLabel>
            <Answers>{answers}</Answers>
            {puzzle.expectedAnswerCount > 1 && (
              <Count>
                {puzzle.answers.length}/{puzzle.expectedAnswerCount}
              </Count>
            )}
          </AnswerRow>
        )}
        {solvedness === "unsolved" && !locked && (
          <People puzzleId={puzzle._id} />
        )}
      </Full>
    );
  }

  return (
    <Card
      $solvedness={solvedness}
      $locked={locked}
      $selected={selected}
      // At mid zoom the stuck flag is too small to see, so the card's edge
      // shows it instead.
      $stuckEdge={detail === "mid" && status.stuck}
    >
      <NodeHandles />
      {body}
    </Card>
  );
};

export default React.memo(PuzzleCardNode);
