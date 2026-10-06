import { NodeToolbar, Panel, Position } from "@xyflow/react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Modal from "react-bootstrap/Modal";
import { useTranslation } from "react-i18next";
import {
  NO_ESCAPE,
  PreviewBanner,
  PreviewItemBox,
  ReadOnlyReason,
} from "./canvasChrome";

// The one thing picked in a preview, which can be put back on its own, and
// whether it brings too much with it to restore at once.
export interface PreviewPick {
  ids: string[];
  frame: boolean;
  tooBig: boolean;
}

// What a preview puts over the board (see useVersionPreview): the banner
// saying when the board is as of, with Restore this version and Back to
// now, and Restore this item over what's picked. Not on a phone, which has
// no history.
const PreviewChrome = ({
  previewTime,
  restoreBlocked,
  inkHidden,
  restoring,
  onRestore,
  onBackToNow,
  pick,
  restoringItem,
  onRestoreItem,
}: {
  previewTime: string;
  // Why the version can't be restored, if it can't.
  restoreBlocked: string | undefined;
  // Whether the viewer is hiding ink the restore would still put back.
  inkHidden: boolean;
  restoring: boolean;
  onRestore: () => void;
  onBackToNow: () => void;
  pick: PreviewPick | undefined;
  restoringItem: boolean;
  onRestoreItem: (pick: PreviewPick) => void;
}) => {
  const { t } = useTranslation();
  // A frame with too much in it can't be put back in one go.
  const restoreItemBlocked =
    restoreBlocked ??
    (pick?.tooBig
      ? t("whiteboard.history.tooBig", "That's too much to restore at once.")
      : undefined);
  return (
    <>
      {pick && (
        <NodeToolbar nodeId={pick.ids[0]} isVisible position={Position.Top}>
          <PreviewItemBox>
            <Button
              size="sm"
              variant="primary"
              disabled={!!restoreItemBlocked || restoringItem}
              onClick={() => onRestoreItem(pick)}
            >
              {pick.frame
                ? t(
                    "whiteboard.history.restoreFrame",
                    "Restore this frame and everything in it as it was at {{time}}",
                    { time: previewTime },
                  )
                : t("whiteboard.history.restoreItem", "Restore this item")}
            </Button>
            {restoreItemBlocked && (
              <ReadOnlyReason>{restoreItemBlocked}</ReadOnlyReason>
            )}
          </PreviewItemBox>
        </NodeToolbar>
      )}
      <Panel position="top-center">
        <PreviewBanner>
          <span>
            {t(
              "whiteboard.history.previewBanner",
              "Viewing the board as it was at {{time}}.",
              { time: previewTime },
            )}
          </span>
          <Button
            size="sm"
            variant="primary"
            disabled={!!restoreBlocked || restoring}
            onClick={onRestore}
          >
            {t("whiteboard.history.restoreButton", "Restore this version")}
          </Button>
          <Button size="sm" variant="outline-secondary" onClick={onBackToNow}>
            {t("whiteboard.history.backToNow", "Back to now")}
          </Button>
          {restoreBlocked && <ReadOnlyReason>{restoreBlocked}</ReadOnlyReason>}
          {inkHidden && (
            <ReadOnlyReason>
              {t(
                "whiteboard.history.inkHidden",
                "Ink is hidden, so it isn't shown here. Restoring this version still puts its drawing back as it was.",
              )}
            </ReadOnlyReason>
          )}
        </PreviewBanner>
      </Panel>
    </>
  );
};

// Asks before restoring the version. It stays up until the server answers,
// and shows why if it refuses.
export const RestoreVersionModal = ({
  show,
  previewTime,
  restoring,
  error,
  onCancel,
  onRestore,
}: {
  show: boolean;
  previewTime: string;
  restoring: boolean;
  error: string | undefined;
  onCancel: () => void;
  onRestore: () => void;
}) => {
  const { t } = useTranslation();
  const restoreLabel = t(
    "whiteboard.history.restoreButton",
    "Restore this version",
  );
  return (
    <Modal
      show={show}
      onHide={onCancel}
      backdrop={restoring ? "static" : true}
      keyboard={!restoring}
    >
      <Modal.Header closeButton={!restoring}>
        <Modal.Title>
          {t(
            "whiteboard.history.confirmTitle",
            "Restore the board to {{time}}?",
            { time: previewTime },
          )}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {t(
          "whiteboard.history.confirmBody",
          "Changes since then, by anyone, are undone. Comments are kept. The board as it is now is saved in history, so you can come back to it.",
        )}
        {error && (
          <Alert variant="danger" className="mt-3 mb-0">
            {t(
              "whiteboard.history.restoreFailed",
              "Couldn't restore the board: {{reason}}",
              { reason: error, ...NO_ESCAPE },
            )}
          </Alert>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onCancel} disabled={restoring}>
          {t("common.cancel", "Cancel")}
        </Button>
        <Button
          variant="primary"
          onClick={onRestore}
          disabled={restoring}
          aria-busy={restoring}
        >
          {restoring
            ? t("whiteboard.history.restoring", "Restoring…")
            : restoreLabel}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default PreviewChrome;
