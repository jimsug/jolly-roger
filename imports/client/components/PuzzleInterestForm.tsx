import type React from "react";
import { useCallback, useId, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import type { FormControlProps } from "react-bootstrap/FormControl";
import FormControl from "react-bootstrap/FormControl";
import FormGroup from "react-bootstrap/FormGroup";
import FormLabel from "react-bootstrap/FormLabel";
import { useTranslation } from "react-i18next";
import registerPuzzleInterest from "../../methods/registerPuzzleInterest";
import withdrawPuzzleInterest from "../../methods/withdrawPuzzleInterest";

// Every vote weighs the same; the score is kept on the data model in case
// that ever changes.
const INTEREST_SCORE = 1;

// Lets a member register (or withdraw) interest in a locked puzzle, with an
// optional note for whoever decides what to unlock.
const PuzzleInterestForm = ({
  puzzleId,
  initialComment = "",
  canWithdraw = false,
  onSuccess,
}: {
  puzzleId: string;
  initialComment?: string;
  canWithdraw?: boolean;
  onSuccess?: () => void;
}) => {
  const { t } = useTranslation();
  const idPrefix = useId();
  const [comment, setComment] = useState(initialComment);
  const [submitting, setSubmitting] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const busy = submitting || withdrawing;

  const onCommentChange: NonNullable<FormControlProps["onChange"]> =
    useCallback((event) => {
      setComment(event.currentTarget.value);
    }, []);

  const onSubmit = useCallback(
    (event: React.SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      setSubmitting(true);
      setError(undefined);
      registerPuzzleInterest.call(
        { puzzleId, score: INTEREST_SCORE, comment },
        (err) => {
          setSubmitting(false);
          if (err) {
            setError(err.message);
          } else {
            onSuccess?.();
          }
        },
      );
    },
    [puzzleId, comment, onSuccess],
  );

  const onWithdraw = useCallback(() => {
    setWithdrawing(true);
    setError(undefined);
    withdrawPuzzleInterest.call({ puzzleId }, (err) => {
      setWithdrawing(false);
      if (err) {
        setError(err.message);
      } else {
        onSuccess?.();
      }
    });
  }, [puzzleId, onSuccess]);

  return (
    <Form onSubmit={onSubmit}>
      <FormGroup className="mb-3" controlId={`${idPrefix}-comment`}>
        <FormLabel>
          {t("puzzle.interest.commentLabel", "Comment (optional)")}
        </FormLabel>
        <FormControl
          as="textarea"
          rows={2}
          value={comment}
          disabled={busy}
          onChange={onCommentChange}
          placeholder={t(
            "puzzle.interest.commentPlaceholder",
            "e.g. I know a bit about biology, this is important for the meta",
          )}
        />
      </FormGroup>
      {error && <Alert variant="danger">{error}</Alert>}
      <div className="d-grid gap-2">
        <Button variant="primary" type="submit" disabled={busy}>
          {submitting
            ? t("puzzle.interest.submitting", "Submitting...")
            : t("puzzle.interest.submit", "Submit interest")}
        </Button>
        {canWithdraw && (
          <Button
            variant="outline-danger"
            type="button"
            onClick={onWithdraw}
            disabled={busy}
          >
            {withdrawing
              ? t("puzzle.interest.withdrawing", "Withdrawing...")
              : t("puzzle.interest.withdraw", "Withdraw interest")}
          </Button>
        )}
      </div>
    </Form>
  );
};

export default PuzzleInterestForm;
