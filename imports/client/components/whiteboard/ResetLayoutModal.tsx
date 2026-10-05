import { faTableCellsLarge } from "@fortawesome/free-solid-svg-icons/faTableCellsLarge";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import React, { useCallback, useId, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import FormCheck from "react-bootstrap/FormCheck";
import Modal from "react-bootstrap/Modal";
import { useTranslation } from "react-i18next";
import resetWhiteboardLayout from "../../../methods/resetWhiteboardLayout";

// Opens the Reset layout question, beside History in the toolbar.
export const ResetLayoutButton = ({ onClick }: { onClick: () => void }) => {
  const { t } = useTranslation();
  const label = t("whiteboard.reset.menu", "Reset layout…");
  return (
    <Button
      variant="outline-secondary"
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      <FontAwesomeIcon icon={faTableCellsLarge} />
    </Button>
  );
};

// Asks before laying the board's cards and rounds out again. Stays up until
// the server answers, so a refusal has somewhere to show.
const ResetLayoutModal = ({
  boardId,
  onHide,
  onDone,
}: {
  boardId: string;
  onHide: () => void;
  onDone: () => void;
}) => {
  const { t } = useTranslation();
  const putBackId = useId();
  const [putBack, setPutBack] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string>();

  const onPutBack = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setPutBack(event.target.checked),
    [],
  );
  const hide = useCallback(() => {
    if (!running) onHide();
  }, [running, onHide]);
  const reset = useCallback(() => {
    setRunning(true);
    setError(undefined);
    resetWhiteboardLayout.call({ boardId, putBack }, (err) => {
      setRunning(false);
      if (err) {
        setError(err.reason ?? err.message);
        return;
      }
      onDone();
    });
  }, [boardId, putBack, onDone]);

  return (
    <Modal
      show
      onHide={hide}
      backdrop={running ? "static" : true}
      keyboard={!running}
    >
      <Modal.Header closeButton={!running}>
        <Modal.Title>
          {t("whiteboard.reset.title", "Reset the layout?")}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>
          {t(
            "whiteboard.reset.body",
            "Every card and round frame goes back to where the puzzle list puts it, and collapsed rounds open. Notes, drawings, lines and comments stay. The board as it is now is saved in history, so you can undo this from there.",
          )}
        </p>
        <FormCheck
          type="checkbox"
          id={putBackId}
          label={t(
            "whiteboard.reset.putBack",
            "Also put back cards and rounds taken off the board",
          )}
          checked={putBack}
          disabled={running}
          onChange={onPutBack}
        />
        {error && (
          <Alert variant="danger" className="mt-3 mb-0">
            {t(
              "whiteboard.reset.failed",
              "Couldn't reset the layout: {{reason}}",
              {
                reason: error,
                // React escapes text, so i18next's escaping would only show
                // entities. Goes once both i18n inits stop escaping.
                interpolation: { escapeValue: false },
              },
            )}
          </Alert>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={hide} disabled={running}>
          {t("common.cancel", "Cancel")}
        </Button>
        <Button
          variant="primary"
          onClick={reset}
          disabled={running}
          aria-busy={running}
        >
          {running
            ? t("whiteboard.reset.running", "Resetting…")
            : t("whiteboard.reset.confirm", "Reset layout")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default ResetLayoutModal;
