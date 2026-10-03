import { useId } from "react";
import Alert from "react-bootstrap/Alert";
import Overlay from "react-bootstrap/Overlay";
import Popover from "react-bootstrap/Popover";
import { useTranslation } from "react-i18next";
import type { PuzzleFeedbackType } from "../../lib/models/PuzzleFeedbacks";
import PuzzleFeedbackForm from "./PuzzleFeedbackForm";

// The "I'm interested" popover for a locked puzzle, anchored to whichever
// button opened it (the puzzle list row or the puzzle page).
const PuzzleInterestPopover = ({
  puzzleId,
  lockedSummary,
  myFeedback,
  target,
  show,
  placement,
  onHide,
}: {
  puzzleId: string;
  lockedSummary?: string;
  myFeedback?: PuzzleFeedbackType;
  target: HTMLElement | null;
  show: boolean;
  placement: "right" | "bottom";
  onHide: () => void;
}) => {
  const { t } = useTranslation();
  const idPrefix = useId();

  return (
    <Overlay
      show={show}
      target={target}
      placement={placement}
      rootClose
      onHide={onHide}
    >
      <Popover id={`${idPrefix}-interest`}>
        <Popover.Header as="h3">
          {t("puzzle.interest.title", "Express interest")}
        </Popover.Header>
        <Popover.Body>
          {lockedSummary && (
            <Alert variant="info">
              <strong>
                {t("puzzle.locked.summaryLabel", "Locked puzzle")}:
              </strong>{" "}
              {lockedSummary}
            </Alert>
          )}
          <PuzzleFeedbackForm
            puzzleId={puzzleId}
            initialComment={myFeedback?.comment}
            canWithdraw={myFeedback !== undefined}
            onSuccess={onHide}
          />
        </Popover.Body>
      </Popover>
    </Overlay>
  );
};

export default PuzzleInterestPopover;
