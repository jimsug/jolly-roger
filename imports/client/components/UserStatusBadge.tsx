import { faPuzzlePiece } from "@fortawesome/free-solid-svg-icons/faPuzzlePiece";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useId } from "react";
import Badge from "react-bootstrap/Badge";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Tooltip from "react-bootstrap/Tooltip";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import styled from "styled-components";
import { shortCalendarTimeFormat } from "../../lib/calendarTimeFormat";
import type { PresenceStatus } from "../../lib/models/UserStatuses";
import { hunterStatus, isCurrentActivity } from "../../lib/presenceStatus";
import { complete } from "../../lib/relativeTimeFormat";
import type { UserStatusSummary } from "../../lib/summarizeUserStatuses";
import RelativeTime from "./RelativeTime";

const StatusDiv = styled.div`
  display: flex;
  align-items: center;
  gap: 0.25rem;
`;

// Long titles are cut short on screen; the whole title stays in the page
const PuzzleTitle = styled.span`
  display: inline-block;
  max-width: 25ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
`;

// The warning yellow takes dark text, as Bootstrap's warning button does
const VARIANTS: Record<PresenceStatus, { bg: string; text?: "dark" }> = {
  online: { bg: "success" },
  away: { bg: "warning", text: "dark" },
  offline: { bg: "secondary" },
};

// Online / Away / Offline for a hunter, with the puzzle they were last seen
// on. No data counts as offline. `now` comes from the list, which ticks it
// once a minute for every badge at once.
const UserStatusBadge = ({
  summary,
  huntId,
  puzzleTitles,
  whiteboardPuzzle,
  now,
}: {
  summary: UserStatusSummary | undefined;
  huntId: string;
  puzzleTitles: Map<string, string>;
  whiteboardPuzzle: string | undefined;
  now: Date;
}) => {
  const { t, i18n } = useTranslation();
  const tooltipId = useId();

  const labels: Record<PresenceStatus, string> = {
    online: t("hunterList.status.online", "Online"),
    away: t("hunterList.status.away", "Away"),
    offline: t("hunterList.status.offline", "Offline"),
  };

  const lastSeen = summary?.status.at;
  const lastPuzzleAt = summary?.puzzleStatus.at;
  const puzzleId = summary?.puzzleStatus.puzzle;

  const status = hunterStatus(summary, now);
  const puzzleIsCurrent = isCurrentActivity(lastPuzzleAt, now);

  let lastSeenText: string | undefined;
  if (status !== "online" && lastSeen) {
    const age = complete(lastSeen, t, {
      minimumUnit: "second",
      maxElements: 1,
      now,
    }).formatted;
    lastSeenText = `${t("hunterList.status.lastSeen", "last seen")}: ${shortCalendarTimeFormat(lastSeen, t, i18n.language, now)} (${age})`;
  }

  const tooltipParts = [labels[status]];
  if (lastSeenText) {
    tooltipParts.push(lastSeenText);
  }
  if (lastPuzzleAt) {
    tooltipParts.push(
      puzzleIsCurrent
        ? t(
            "hunterList.status.currentlyActiveOnPuzzle",
            "currently active on a puzzle",
          )
        : `${t("hunterList.status.lastActiveOnPuzzle", "last active on a puzzle")}: ${shortCalendarTimeFormat(lastPuzzleAt, t, i18n.language, now)}`,
    );
  }

  let puzzleLink = null;
  if (puzzleId) {
    puzzleLink = (
      <Link
        className="btn btn-dark btn-sm"
        to={
          puzzleId === whiteboardPuzzle
            ? `/hunts/${huntId}/whiteboard`
            : `/hunts/${huntId}/puzzles/${puzzleId}`
        }
      >
        <strong>
          <FontAwesomeIcon icon={faPuzzlePiece} />{" "}
          <PuzzleTitle>{puzzleTitles.get(puzzleId) ?? ""}</PuzzleTitle>
        </strong>
        {lastPuzzleAt && !puzzleIsCurrent && (
          <>
            {" "}
            <RelativeTime
              date={lastPuzzleAt}
              minimumUnit="second"
              maxElements={1}
              now={now}
            />
          </>
        )}
      </Link>
    );
  }

  const variant = VARIANTS[status];
  return (
    <OverlayTrigger
      placement="top"
      overlay={<Tooltip id={tooltipId}>{tooltipParts.join(", ")}</Tooltip>}
    >
      <StatusDiv>
        <Badge bg={variant.bg} text={variant.text}>
          {labels[status]}
          {lastSeenText && (
            <span className="visually-hidden">{`, ${lastSeenText}`}</span>
          )}
        </Badge>
        {puzzleLink}
      </StatusDiv>
    </OverlayTrigger>
  );
};

export default UserStatusBadge;
