import { useEffect, useState } from "react";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import Table from "react-bootstrap/Table";
import type { PuzzleFeedbackType } from "../../lib/models/PuzzleFeedbacks";
import type { PuzzleType } from "../../lib/models/Puzzles";
import unlockPuzzle from "../../methods/unlockPuzzle";

const PuzzleUnlockModal = ({
  show,
  onHide,
  puzzle,
  feedbacks,
  displayNames,
}: {
  show: boolean;
  onHide: () => void;
  puzzle: PuzzleType;
  feedbacks: PuzzleFeedbackType[];
  displayNames: Map<string, string>;
}) => {
  const [url, setUrl] = useState(puzzle.url || "");

  useEffect(() => {
    if (show) {
      setUrl(puzzle.url || "");
    }
  }, [show, puzzle.url]);

  const onUnlock = () => {
    unlockPuzzle.call({ puzzleId: puzzle._id, url }, (err) => {
      if (!err) {
        onHide();
      } else {
        alert(err.message);
      }
    });
  };

  return (
    <Modal show={show} onHide={onHide} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>Unlock Puzzle: {puzzle.title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form.Group className="mb-4">
          <Form.Label>Puzzle URL (optional)</Form.Label>
          <Form.Control
            type="text"
            placeholder="https://..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <Form.Text className="text-muted">
            You can provide or update the puzzle URL here when unlocking.
          </Form.Text>
        </Form.Group>

        <p>The following users have expressed interest:</p>
        <Table striped bordered hover size="sm">
          <thead>
            <tr>
              <th>User</th>
              <th>Comment</th>
            </tr>
          </thead>
          <tbody>
            {feedbacks.map((f) => (
              <tr key={f._id}>
                <td>{displayNames.get(f.createdBy) ?? f.createdBy}</td>
                <td>{f.comment}</td>
              </tr>
            ))}
            {feedbacks.length === 0 && (
              <tr>
                <td colSpan={3} className="text-center text-muted">
                  No interest expressed yet
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Cancel
        </Button>
        <Button variant="danger" onClick={onUnlock}>
          Unlock Puzzle
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default PuzzleUnlockModal;
