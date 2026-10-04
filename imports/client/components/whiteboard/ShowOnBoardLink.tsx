import { useTracker } from "meteor/react-meteor-data";
import { faLocationCrosshairs } from "@fortawesome/free-solid-svg-icons/faLocationCrosshairs";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { createContext } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import Flags from "../../../Flags";
import Whiteboards from "../../../lib/models/Whiteboards";

// Whether the hunt has a board to show things on. The board document comes
// from HuntNav's subscription, which every hunt page has.
export function useHuntHasWhiteboard(huntId: string): boolean {
  return useTracker(
    () =>
      !Flags.active("disable.whiteboard") &&
      !!Whiteboards.findOne({ hunt: huntId }, { projection: { _id: 1 } }),
    [huntId],
  );
}

// Whether the hunt whose puzzles are listed has a board, worked out once by
// the list's page rather than by every row.
export const HuntHasWhiteboardContext = createContext(false);

// Opens the hunt's board at a puzzle's card. Shown only where the hunt has a
// board.
const ShowOnBoardLink = ({
  huntId,
  puzzleId,
  className,
}: {
  huntId: string;
  puzzleId: string;
  className?: string;
}) => {
  const { t } = useTranslation();
  const title = t("whiteboard.showOnBoard", "Show on board");
  return (
    <Link
      to={`/hunts/${huntId}/whiteboard?puzzle=${encodeURIComponent(puzzleId)}`}
      title={title}
      aria-label={title}
      className={className}
    >
      <FontAwesomeIcon icon={faLocationCrosshairs} />
    </Link>
  );
};

export default ShowOnBoardLink;
