import { useTracker } from "meteor/react-meteor-data";
import type React from "react";
import {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import Alert from "react-bootstrap/Alert";
import type { FormControlProps } from "react-bootstrap/FormControl";
import FormControl from "react-bootstrap/FormControl";
import FormGroup from "react-bootstrap/FormGroup";
import FormLabel from "react-bootstrap/FormLabel";
import FormText from "react-bootstrap/FormText";
import Table from "react-bootstrap/Table";
import { useTranslation } from "react-i18next";
import type { PuzzleFeedbackType } from "../../lib/models/PuzzleFeedbacks";
import type { PuzzleType } from "../../lib/models/Puzzles";
import unlockPuzzle from "../../methods/unlockPuzzle";
import useSubscribeDisplayNames from "../hooks/useSubscribeDisplayNames";
import indexedDisplayNames from "../indexedDisplayNames";
import type { ModalFormHandle } from "./ModalForm";
import ModalForm from "./ModalForm";

export type PuzzleUnlockModalHandle = {
  show: () => void;
};

// Operators unlock a locked puzzle from here, optionally giving it its URL at
// the same time, with the interested members listed to help decide.
const PuzzleUnlockModal = ({
  puzzle,
  feedbacks,
  showOnMount,
  ref,
}: {
  puzzle: PuzzleType;
  feedbacks: PuzzleFeedbackType[];
  showOnMount?: boolean;
  ref: React.Ref<PuzzleUnlockModalHandle>;
}) => {
  const { t } = useTranslation();
  const idPrefix = useId();
  const formRef = useRef<ModalFormHandle>(null);
  const [url, setUrl] = useState(puzzle.url ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  // Reopening starts from the puzzle's current URL again
  const puzzleUrl = useRef(puzzle.url);
  useEffect(() => {
    puzzleUrl.current = puzzle.url;
  }, [puzzle.url]);

  const show = useCallback(() => {
    setUrl(puzzleUrl.current ?? "");
    setError(undefined);
    formRef.current?.show();
  }, []);
  useImperativeHandle(ref, () => ({ show }), [show]);

  useEffect(() => {
    if (showOnMount) {
      show();
    }
  }, [showOnMount, show]);

  const displayNamesLoading = useSubscribeDisplayNames(puzzle.hunt);
  const loading = displayNamesLoading();
  const displayNames = useTracker(
    () => (loading ? new Map<string, string>() : indexedDisplayNames()),
    [loading],
  );

  const onUrlChange: NonNullable<FormControlProps["onChange"]> = useCallback(
    (event) => {
      setUrl(event.currentTarget.value);
    },
    [],
  );

  const onSubmit = useCallback(
    (callback: () => void) => {
      setSubmitting(true);
      setError(undefined);
      const trimmedUrl = url.trim();
      unlockPuzzle.call(
        {
          puzzleId: puzzle._id,
          url: trimmedUrl === "" ? undefined : trimmedUrl,
        },
        (err) => {
          setSubmitting(false);
          if (err) {
            setError(err.message);
          } else {
            callback();
          }
        },
      );
    },
    [puzzle._id, url],
  );

  return (
    <ModalForm
      ref={formRef}
      title={t("puzzle.unlock.modalTitle", "Unlock puzzle: {{title}}", {
        title: puzzle.title,
        // Rendered as a text node, so i18next's HTML escaping would only
        // turn an apostrophe in the title into an entity
        interpolation: { escapeValue: false },
      })}
      size="lg"
      submitLabel={t("puzzle.unlock.submit", "Unlock puzzle")}
      submitStyle="danger"
      submitting={submitting}
      onSubmit={onSubmit}
    >
      <FormGroup className="mb-4" controlId={`${idPrefix}-url`}>
        <FormLabel>
          {t("puzzle.unlock.urlLabel", "Puzzle URL (optional)")}
        </FormLabel>
        <FormControl
          type="text"
          placeholder="https://..."
          value={url}
          disabled={submitting}
          onChange={onUrlChange}
        />
        <FormText>
          {t(
            "puzzle.unlock.urlHelp",
            "You can provide or update the puzzle URL here when unlocking.",
          )}
        </FormText>
      </FormGroup>

      <p>
        {t(
          "puzzle.unlock.interestedMembers",
          "These members have expressed interest:",
        )}
      </p>
      <Table striped bordered hover size="sm">
        <thead>
          <tr>
            <th>{t("puzzle.unlock.memberColumn", "Member")}</th>
            <th>{t("puzzle.unlock.commentColumn", "Comment")}</th>
          </tr>
        </thead>
        <tbody>
          {feedbacks.map((feedback) => (
            <tr key={feedback._id}>
              <td>
                {displayNames.get(feedback.createdBy) ??
                  t("puzzle.unlock.unknownMember", "Unknown member")}
              </td>
              <td>{feedback.comment}</td>
            </tr>
          ))}
          {feedbacks.length === 0 && (
            <tr>
              <td colSpan={2} className="text-center text-muted">
                {t("puzzle.unlock.noInterest", "No interest expressed yet")}
              </td>
            </tr>
          )}
        </tbody>
      </Table>
      {error && <Alert variant="danger">{error}</Alert>}
    </ModalForm>
  );
};

export default PuzzleUnlockModal;
