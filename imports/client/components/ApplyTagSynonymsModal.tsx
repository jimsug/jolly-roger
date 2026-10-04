import { Meteor } from "meteor/meteor";
import { useCallback, useEffect, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Modal from "react-bootstrap/Modal";
import Table from "react-bootstrap/Table";
import { useTranslation } from "react-i18next";
import applyTagSynonyms from "../../methods/applyTagSynonyms";
import type { TagSynonymPreview } from "../../methods/previewTagSynonyms";
import previewTagSynonyms from "../../methods/previewTagSynonyms";

// Shows what applying the saved synonym table to existing tags would change
// in each hunt, then starts the job that does it. Stays up until the server
// answers, so a refusal has somewhere to show.
const ApplyTagSynonymsModal = ({
  onHide,
  onStarted,
}: {
  onHide: () => void;
  onStarted: () => void;
}) => {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<TagSynonymPreview[]>();
  const [running, setRunning] = useState(false);
  const [previewError, setPreviewError] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    void previewTagSynonyms.callPromise().then(setPreview, (err: unknown) => {
      setPreviewError(
        err instanceof Meteor.Error ? (err.reason ?? err.message) : String(err),
      );
    });
  }, []);

  const hide = useCallback(() => {
    if (!running) onHide();
  }, [running, onHide]);
  const apply = useCallback(() => {
    setRunning(true);
    setError(undefined);
    applyTagSynonyms.call((err) => {
      setRunning(false);
      if (err) {
        setError(err.reason ?? err.message);
        return;
      }
      onStarted();
    });
  }, [onStarted]);

  let body;
  if (!preview) {
    body = previewError ? (
      <Alert variant="danger" className="mb-0">
        {t(
          "serverSetup.tagSynonyms.preview.countFailed",
          "Couldn't count the tags to change: {{reason}}",
          {
            reason: previewError,
            // React escapes text, so i18next's escaping would only show
            // entities.
            interpolation: { escapeValue: false },
          },
        )}
      </Alert>
    ) : (
      <p>{t("serverSetup.tagSynonyms.preview.loading", "Counting tags…")}</p>
    );
  } else if (preview.length === 0) {
    body = (
      <p>
        {t(
          "serverSetup.tagSynonyms.preview.none",
          "No existing tag is named by a synonym, so there's nothing to change.",
        )}
      </p>
    );
  } else {
    body = (
      <>
        <p>
          {t(
            "serverSetup.tagSynonyms.preview.body",
            "Each tag named by a synonym takes its canonical name, keeping the old name as an alias. Where another tag already has that name, the two are merged. This can't be undone.",
          )}
        </p>
        <Table size="sm">
          <thead>
            <tr>
              <th>{t("serverSetup.tagSynonyms.preview.hunt", "Hunt")}</th>
              <th>{t("serverSetup.tagSynonyms.preview.renamed", "Renamed")}</th>
              <th>{t("serverSetup.tagSynonyms.preview.merged", "Merged")}</th>
            </tr>
          </thead>
          <tbody>
            {preview.map((hunt) => (
              <tr key={hunt.huntId}>
                <td>{hunt.huntName}</td>
                <td>{hunt.renamed}</td>
                <td>{hunt.merged}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </>
    );
  }

  return (
    <Modal
      show
      onHide={hide}
      backdrop={running ? "static" : true}
      keyboard={!running}
    >
      <Modal.Header closeButton={!running}>
        <Modal.Title>
          {t(
            "serverSetup.tagSynonyms.preview.title",
            "Apply synonyms to existing tags?",
          )}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {body}
        {error && (
          <Alert variant="danger" className="mb-0">
            {t(
              "serverSetup.tagSynonyms.preview.failed",
              "Couldn't apply synonyms: {{reason}}",
              {
                reason: error,
                // React escapes text, so i18next's escaping would only show
                // entities.
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
          variant="danger"
          onClick={apply}
          disabled={running || !preview || preview.length === 0}
          aria-busy={running}
        >
          {t("serverSetup.tagSynonyms.preview.confirm", "Apply synonyms")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default ApplyTagSynonymsModal;
