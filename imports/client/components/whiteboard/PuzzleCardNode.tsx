import { useTracker } from "meteor/react-meteor-data";
import { faEye } from "@fortawesome/free-solid-svg-icons/faEye";
import { faLock } from "@fortawesome/free-solid-svg-icons/faLock";
import { faPhone } from "@fortawesome/free-solid-svg-icons/faPhone";
import { faStar } from "@fortawesome/free-solid-svg-icons/faStar";
import { faUpRightFromSquare } from "@fortawesome/free-solid-svg-icons/faUpRightFromSquare";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { Node, NodeProps } from "@xyflow/react";
import React, { useContext, useMemo } from "react";
import { Link } from "react-router-dom";
import styled, { css } from "styled-components";
import Hunts from "../../../lib/models/Hunts";
import MeteorUsers from "../../../lib/models/MeteorUsers";
import Puzzles from "../../../lib/models/Puzzles";
import Tags from "../../../lib/models/Tags";
import type { WhiteboardNodeType } from "../../../lib/models/WhiteboardNodes";
import type { Solvedness } from "../../../lib/solvedness";
import { computeSolvedness } from "../../../lib/solvedness";
import AvatarStack from "../AvatarStack";
import PuzzleAnswer from "../PuzzleAnswer";
import NodeHandles from "./NodeHandles";
import useDetail from "./useDetail";
import { PeopleContext } from "./WhiteboardContext";

export type PuzzleCardNodeType = Node<{ doc: WhiteboardNodeType }, "puzzle">;

const Card = styled.div<{
  $solvedness: Solvedness;
  $locked: boolean;
  $selected: boolean;
}>`
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: 6px;
  border: 1px solid
    ${({ theme, $selected }) =>
      $selected ? theme.colors.primary : theme.colors.border};
  box-shadow: ${({ $selected, theme }) =>
    $selected
      ? `0 0 0 2px ${theme.colors.primary}`
      : "0 1px 2px rgb(0 0 0 / 15%)"};
  background-color: ${({ theme, $solvedness }) =>
    theme.colors.solvedness[$solvedness]};
  color: ${({ theme }) => theme.colors.text};
  ${({ $locked }) =>
    $locked &&
    css`
      background-image: repeating-linear-gradient(
        -45deg,
        transparent,
        transparent 8px,
        rgb(128 128 128 / 10%) 8px,
        rgb(128 128 128 / 10%) 16px
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

const MetaBadge = styled.span`
  background: #ffc107;
  color: #000;
  border-radius: 8px;
  padding: 0 6px;
  font-size: 11px;
  font-weight: bold;
  text-transform: uppercase;
`;

const OpenLink = styled(Link)`
  margin-left: auto;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Title = styled.div<{ $lines: number }>`
  font-weight: 600;
  line-height: 1.25;
  display: -webkit-box;
  -webkit-line-clamp: ${({ $lines }) => $lines};
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

const usePeopleUsers = (ids: string[], passive?: Set<string>) =>
  useTracker(
    () =>
      ids.map((id) => {
        const user = MeteorUsers.findOne(id);
        return {
          _id: id,
          displayName: user?.displayName ?? "Unknown",
          discordAccount: user?.discordAccount,
          isPassive: passive?.has(id),
        };
      }),
    [ids, passive],
  );

const People = ({ puzzleId }: { puzzleId: string }) => {
  const people = useContext(PeopleContext).get(puzzleId);
  const callers = useMemo(() => people?.callers ?? [], [people]);
  const viewerIds = useMemo(
    () => people?.viewers.map((v) => v.user) ?? [],
    [people],
  );
  const passive = useMemo(
    () => new Set(people?.viewers.filter((v) => v.passive).map((v) => v.user)),
    [people],
  );
  const callerUsers = usePeopleUsers(callers);
  const viewerUsers = usePeopleUsers(viewerIds, passive);

  if (callerUsers.length === 0 && viewerUsers.length === 0) return null;
  return (
    <PeopleRow>
      {callerUsers.length > 0 && (
        <PeopleGroup>
          <FontAwesomeIcon icon={faPhone} fixedWidth />
          <AvatarStack users={callerUsers} size={18} />
        </PeopleGroup>
      )}
      {viewerUsers.length > 0 && (
        <PeopleGroup>
          <FontAwesomeIcon icon={faEye} fixedWidth />
          <AvatarStack users={viewerUsers} size={18} />
        </PeopleGroup>
      )}
    </PeopleRow>
  );
};

const PuzzleCardNode = ({ data, selected }: NodeProps<PuzzleCardNodeType>) => {
  const detail = useDetail();
  const puzzle = useTracker(
    () => Puzzles.findOne(data.doc.puzzle),
    [data.doc.puzzle],
  );
  const huntId = puzzle?.hunt;
  const hunt = useTracker(
    () => (huntId ? Hunts.findOne(huntId) : undefined),
    [huntId],
  );
  const metaKind = useTracker(() => {
    if (!puzzle) return undefined;
    const names = Tags.find({ _id: { $in: puzzle.tags } }).map((t) => t.name);
    if (names.includes("is:metameta")) return "Metameta";
    if (names.some((n) => n === "is:meta" || n.startsWith("meta-for:"))) {
      return "Meta";
    }
    return undefined;
  }, [puzzle]);

  if (!puzzle) return null;

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
        {puzzle.answers.length > 0 ? (
          <PuzzleAnswer answer={puzzle.answers[0]!} />
        ) : (
          puzzle.title.split(/\s+/)[0]
        )}
      </Far>
    );
  } else if (detail === "mid") {
    body = (
      <Mid>
        <Title $lines={2}>{puzzle.title}</Title>
        {locked ? null : <Answers>{answers}</Answers>}
      </Mid>
    );
  } else {
    body = (
      <Full>
        <TopRow>
          {locked && <FontAwesomeIcon icon={faLock} fixedWidth />}
          {metaKind && (
            <MetaBadge>
              <FontAwesomeIcon icon={faStar} /> {metaKind}
            </MetaBadge>
          )}
          <OpenLink
            to={`/hunts/${puzzle.hunt}/puzzles/${puzzle._id}`}
            className="nodrag"
            title="Open puzzle"
          >
            <FontAwesomeIcon icon={faUpRightFromSquare} />
          </OpenLink>
        </TopRow>
        <Title $lines={2}>{puzzle.title}</Title>
        {locked ? (
          <LockedSummary title={puzzle.lockedSummary}>
            {puzzle.lockedSummary}
          </LockedSummary>
        ) : (
          <AnswerRow>
            <AnswerLabel>ANSWER</AnswerLabel>
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
    <Card $solvedness={solvedness} $locked={locked} $selected={!!selected}>
      <NodeHandles />
      {body}
    </Card>
  );
};

export default React.memo(PuzzleCardNode);
