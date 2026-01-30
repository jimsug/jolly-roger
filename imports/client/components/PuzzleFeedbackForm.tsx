import { type FormEvent, useCallback, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import providePuzzleFeedback from "../../methods/providePuzzleFeedback";
import withdrawPuzzleInterest from "../../methods/withdrawPuzzleInterest";

const PuzzleFeedbackForm = ({
  puzzleId,
  initialScore = 1,
  initialComment = "",
  canWithdraw = false,
  onSuccess,
}: {
  puzzleId: string;
  initialScore?: number;
  initialComment?: string;
  canWithdraw?: boolean;
  onSuccess?: () => void;
}) => {
  const [score] = useState(initialScore);
  const [comment, setComment] = useState(initialComment);
  const [submitting, setSubmitting] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      setSubmitting(true);
      setError(null);
      providePuzzleFeedback.call({ puzzleId, score, comment }, (err) => {
        setSubmitting(false);
        if (err) {
          setError(err.message);
        } else if (onSuccess) {
          onSuccess();
        }
      });
    },
    [puzzleId, score, comment, onSuccess],
  );

  const onWithdraw = useCallback(() => {
    setWithdrawing(true);
    setError(null);
    withdrawPuzzleInterest.call({ puzzleId }, (err) => {
      setWithdrawing(false);
      if (err) {
        setError(err.message);
      } else if (onSuccess) {
        onSuccess();
      }
    });
  }, [puzzleId, onSuccess]);

  return (
    <Form onSubmit={onSubmit}>
      <Form.Group className="mb-3">
        <Form.Label>Comment (optional)</Form.Label>
        <Form.Control
          as="textarea"
          rows={2}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="e.g. I know a bit about biology, this is important for the meta"
        />
      </Form.Group>
      {error && <Alert variant="danger">{error}</Alert>}
      <div className="d-grid gap-2">
        <Button
          variant="primary"
          type="submit"
          disabled={submitting || withdrawing}
        >
          {submitting ? "Submitting..." : "Submit Interest"}
        </Button>
        {canWithdraw && (
          <Button
            variant="outline-danger"
            onClick={onWithdraw}
            disabled={submitting || withdrawing}
          >
            {withdrawing ? "Withdrawing..." : "Withdraw Interest"}
          </Button>
        )}
      </div>
    </Form>
  );
};

export default PuzzleFeedbackForm;
