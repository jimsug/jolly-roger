import { faPuzzlePiece } from "@fortawesome/free-solid-svg-icons/faPuzzlePiece";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useId } from "react";
import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Tooltip from "react-bootstrap/Tooltip";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import styled from "styled-components";
import { shortCalendarTimeFormat } from "../../lib/calendarTimeFormat";
import { complete } from "../../lib/relativeTimeFormat";
import type { UserStatusSummary } from "../../lib/userStatusesToLastSeen";
import RelativeTime from "./RelativeTime";

const StatusDiv = styled.div`
  margin-left: 0.5rem;
`;

// A status reported this recently still counts as online, so a brief tab
// switch doesn't flicker the badge
const RECENTLY_SEEN_MS = 2 * 60 * 1000;
// Puzzle activity newer than this is "now" rather than "N seconds ago"
const CURRENT_ACTIVITY_MS = 60 * 1000;
const PUZZLE_TITLE_LENGTH = 25;

type DisplayedStatus = "online" | "away" | "offline";

const VARIANTS: Record<DisplayedStatus, string> = {
  online: "success",
  away: "warning",
  offline: "secondary",
};

// Online / Away / Offline for a hunter, with the puzzle they were last seen
// on. No data counts as offline. `now` comes from the list, which ticks it
// once a minute for every badge at once.
const UserStatusBadge = ({
  summary,
  huntId,
  puzzleTitles,
  now,
}: {
  summary: UserStatusSummary | undefined;
  huntId: string;
  puzzleTitles: Map<string, string>;
  now: Date;
}) => {
  const { t, i18n } = useTranslation();
  const tooltipId = useId();

  const labels: Record<DisplayedStatus, string> = {
    online: t("hunterList.status.online", "Online"),
    away: t("hunterList.status.away", "Away"),
    offline: t("hunterList.status.offline", "Offline"),
  };

  const lastSeen = summary?.status.at ?? null;
  const lastPuzzleAt = summary?.puzzleStatus.at ?? null;
  const puzzleId = summary?.puzzleStatus.puzzle ?? null;

  const recentlySeen = (at: Date | null) =>
    at !== null && now.getTime() - at.getTime() < RECENTLY_SEEN_MS;
  let status: DisplayedStatus = "offline";
  if (summary && lastSeen) {
    if (
      summary.status.status === "online" ||
      recentlySeen(lastSeen) ||
      recentlySeen(lastPuzzleAt)
    ) {
      status = "online";
    } else if (summary.status.status === "away") {
      status = "away";
    }
  }

  const puzzleIsCurrent =
    lastPuzzleAt !== null &&
    now.getTime() - lastPuzzleAt.getTime() < CURRENT_ACTIVITY_MS;

  const tooltipParts = [labels[status]];
  if (status !== "online" && lastSeen) {
    const age = complete(lastSeen, t, {
      minimumUnit: "second",
      maxElements: 1,
      now,
    }).formatted;
    tooltipParts.push(
      `${t("hunterList.status.lastSeen", "last seen")}: ${shortCalendarTimeFormat(lastSeen, t, i18n.language, now)} (${age})`,
    );
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

  let puzzleButton = null;
  if (puzzleId) {
    const title = puzzleTitles.get(puzzleId) ?? "";
    const shortTitle =
      title.length > PUZZLE_TITLE_LENGTH
        ? `${title.slice(0, PUZZLE_TITLE_LENGTH)}…`
        : title;
    puzzleButton = (
      <Link
        className="btn btn-dark"
        to={`/hunts/${huntId}/puzzles/${puzzleId}`}
      >
        <strong>
          <FontAwesomeIcon icon={faPuzzlePiece} /> {shortTitle}
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

  return (
    <StatusDiv>
      <OverlayTrigger
        placement="top"
        overlay={<Tooltip id={tooltipId}>{tooltipParts.join(", ")}</Tooltip>}
      >
        <ButtonGroup size="sm">
          <Button variant={VARIANTS[status]}>
            {status === "online" ? (
              <strong>{labels[status]}</strong>
            ) : (
              labels[status]
            )}
          </Button>
          {puzzleButton}
        </ButtonGroup>
      </OverlayTrigger>
    </StatusDiv>
  );
};

export default UserStatusBadge;
