import { Meteor } from "meteor/meteor";
import { useSubscribe, useTracker } from "meteor/react-meteor-data";
import { ServiceConfiguration } from "meteor/service-configuration";
import { faCog } from "@fortawesome/free-solid-svg-icons/faCog";
import { faComment } from "@fortawesome/free-solid-svg-icons/faComment";
import { faCopy } from "@fortawesome/free-solid-svg-icons/faCopy";
import { faKey } from "@fortawesome/free-solid-svg-icons/faKey";
import { faPuzzlePiece } from "@fortawesome/free-solid-svg-icons/faPuzzlePiece";
import { faSpinner } from "@fortawesome/free-solid-svg-icons/faSpinner";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import React, { useCallback, useEffect, useId, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import Dropdown from "react-bootstrap/Dropdown";
import DropdownItem from "react-bootstrap/DropdownItem";
import DropdownMenu from "react-bootstrap/DropdownMenu";
import DropdownToggle from "react-bootstrap/DropdownToggle";
import Form from "react-bootstrap/Form";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Toast from "react-bootstrap/Toast";
import ToastContainer from "react-bootstrap/ToastContainer";
import Tooltip from "react-bootstrap/Tooltip";
import { Trans, useTranslation } from "react-i18next";
import { Link } from "react-router";
import ReactTextareaAutosize from "react-textarea-autosize";
import styled, { css, useTheme } from "styled-components";
import { useMediaQuery } from "usehooks-ts";
import Flags from "../../Flags";
import { calendarTimeFormat } from "../../lib/calendarTimeFormat";
import chatMessagePath from "../../lib/chatMessagePath";
import chatMessagePlainText, {
  firstLine,
} from "../../lib/chatMessagePlainText";
import correctedAnswer from "../../lib/correctedAnswer";
import { SUPPRESS_ALL_DINGWORDS } from "../../lib/dingwordLogic";
import isAdmin from "../../lib/isAdmin";
import { indexedById } from "../../lib/listUtils";
import type { AnnouncementType } from "../../lib/models/Announcements";
import Announcements from "../../lib/models/Announcements";
import type { BookmarkNotificationType } from "../../lib/models/BookmarkNotifications";
import BookmarkNotifications from "../../lib/models/BookmarkNotifications";
import type { ChatNotificationType } from "../../lib/models/ChatNotifications";
import ChatNotifications from "../../lib/models/ChatNotifications";
import type { GuessType } from "../../lib/models/Guesses";
import Guesses from "../../lib/models/Guesses";
import type { HuntType } from "../../lib/models/Hunts";
import Hunts from "../../lib/models/Hunts";
import PendingAnnouncements from "../../lib/models/PendingAnnouncements";
import type { PuzzleNotificationType } from "../../lib/models/PuzzleNotifications";
import PuzzleNotifications from "../../lib/models/PuzzleNotifications";
import type { PuzzleType } from "../../lib/models/Puzzles";
import Puzzles from "../../lib/models/Puzzles";
import {
  huntsUserIsOperatorFor,
  listAssignedRolesForHunt,
} from "../../lib/permission_stubs";
import bookmarkNotificationsForSelf from "../../lib/publications/bookmarkNotificationsForSelf";
import pendingAnnouncementsForSelf from "../../lib/publications/pendingAnnouncementsForSelf";
import pendingGuessesForSelf from "../../lib/publications/pendingGuessesForSelf";
import puzzleNotificationsForSelf from "../../lib/publications/puzzleNotificationsForSelf";
import isWhiteboardPuzzle from "../../lib/whiteboard/isWhiteboardPuzzle";
import bookmarkPuzzle from "../../methods/bookmarkPuzzle";
import configureEnsureGoogleScript from "../../methods/configureEnsureGoogleScript";
import dismissBookmarkNotification from "../../methods/dismissBookmarkNotification";
import dismissChatNotification from "../../methods/dismissChatNotification";
import dismissChatNotificationsForPuzzle from "../../methods/dismissChatNotificationsForPuzzle";
import dismissPendingAnnouncement from "../../methods/dismissPendingAnnouncement";
import dismissPuzzleNotification from "../../methods/dismissPuzzleNotification";
import setGuessState from "../../methods/setGuessState";
import suppressDingwordsForPuzzle from "../../methods/suppressDingwordsForPuzzle";
import { guessURL } from "../../model-helpers";
import GoogleScriptInfo from "../GoogleScriptInfo";
import {
  useOperatorActionsHidden,
  useOperatorActionsHiddenForHunt,
} from "../hooks/persisted-state";
import { useBlockReasons } from "../hooks/useBlockUpdate";
import useTypedSubscribe from "../hooks/useTypedSubscribe";
import indexedDisplayNames from "../indexedDisplayNames";
import AnnouncementToast from "./AnnouncementToast";
import ChatMessage from "./ChatMessage";
import CopyToClipboardButton from "./CopyToClipboardButton";
import { GuessConfidenceBadge, GuessDirectionBadge } from "./guessDetails";
import Markdown from "./Markdown";
import PuzzleAnswer from "./PuzzleAnswer";
import { MinimumDesktopWidth } from "./PuzzlePage";
import SpinnerTimer from "./SpinnerTimer";

const desktopQuery = `(min-width: ${MinimumDesktopWidth}px)`;

// How long to keep showing guess notifications after actioning.
// Note that this cannot usefully exceed the linger period implemented by the
// subscription that fetches the data from imports/server/guesses.ts
const LINGER_PERIOD = 4000;

const StyledNotificationActionBar = styled.ul`
  display: flex;
  list-style-type: none;
  margin: 0;
  padding: 0;
  flex-flow: wrap row;
  gap: 0.5rem;

  &:not(:last-child) {
    margin-bottom: 0.5rem;
  }
`;

const StyledNotificationActionItem = styled.li<{ $grow?: boolean }>`
  display: flex;
  flex-grow: ${(props) => (props.$grow ? 1 : 0)};
`;

const StyledNotificationRow = styled.div`
  &:not(:last-child) {
    margin-bottom: 0.5rem;
  }
`;

const StyledGuessHeader = styled.strong`
  overflow-wrap: break-word;
  overflow: hidden;
  hyphens: auto;
  margin-right: auto;
`;

const StyledNotificationTimestamp = styled.small`
  text-align: end;
`;

// Long announcements and chat messages scroll inside the toast instead of
// pushing the rest of the stack off the screen.
const cappedToastBody = css`
  max-height: 22rem;
  overflow-y: auto;

  p:last-child {
    margin-bottom: 0;
  }
`;

const CappedToastBody = styled(Toast.Body)`
  ${cappedToastBody}
`;

const CappedAnnouncementToast = styled(AnnouncementToast)`
  .toast-body {
    ${cappedToastBody}
  }
`;

const StyledGuessAnswer = styled(StyledNotificationRow)`
  max-height: 15rem;
  overflow: hidden;
`;

// The cog menu in a toast header holding the settings for that kind of
// notification.
const ToastSettings = ({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) => {
  const theme = useTheme();
  const { t } = useTranslation();
  const label = t("notification.settings", "Notification settings");

  return (
    <Dropdown className="ms-2">
      <DropdownToggle
        variant={theme.basicMode}
        size="sm"
        id={id}
        title={label}
        aria-label={label}
      >
        <FontAwesomeIcon icon={faCog} />
      </DropdownToggle>
      <DropdownMenu align="end">{children}</DropdownMenu>
    </Dropdown>
  );
};

// A line of help under a settings item, wrapped to the width of the menu.
const SettingsItemHelp = styled.small`
  display: block;
  white-space: normal;
`;

// Why an action started from a toast failed, shown in that toast.
const ToastActionError = ({ error }: { error: string | undefined }) =>
  error ? (
    <Alert variant="danger" transition={false}>
      {error}
    </Alert>
  ) : null;

// A guess's direction and confidence as a badge each.
const GuessDetailBadges = ({ guess }: { guess: GuessType }) => (
  <>
    <StyledNotificationActionItem className="align-items-center">
      <GuessDirectionBadge value={guess.direction} />
    </StyledNotificationActionItem>
    <StyledNotificationActionItem className="align-items-center">
      <GuessConfidenceBadge value={guess.confidence} />
    </StyledNotificationActionItem>
  </>
);

const GuessMessage = React.memo(
  ({
    guess,
    puzzle,
    hunt,
    onDismiss,
  }: {
    guess: GuessType;
    puzzle: PuzzleType;
    hunt: HuntType;
    onDismiss: (guessId: string) => void;
  }) => {
    const [nextState, setNextState] = useState<GuessType["state"]>();
    const [additionalNotes, setAdditionalNotes] = useState("");
    const onAdditionalNotesChange: React.ChangeEventHandler<HTMLTextAreaElement> =
      useCallback((e) => {
        setAdditionalNotes(e.target.value);
      }, []);
    const [editedAnswer, setEditedAnswer] = useState("");
    const onEditedAnswerChange: React.ChangeEventHandler<HTMLTextAreaElement> =
      useCallback((e) => {
        setEditedAnswer(e.target.value);
      }, []);
    // A correction that changes more than the spacing of the guess has to be
    // submitted twice; this is the one waiting on its second submit.
    const [confirmPendingFor, setConfirmPendingFor] = useState<string>();
    // A correct-with-edit submission in flight, and the error the last one
    // failed with
    const [correctionPending, setCorrectionPending] = useState(false);
    const [correctionError, setCorrectionError] = useState<string>();

    const markCorrect = useCallback(() => {
      if (nextState === "correct") {
        // Clicking Correct again backs out of the edit form.
        setNextState(undefined);
        setConfirmPendingFor(undefined);
        return;
      }
      setGuessState.call({ guessId: guess._id, state: "correct" });
    }, [guess._id, nextState]);

    const markIncorrect = useCallback(() => {
      setGuessState.call({ guessId: guess._id, state: "incorrect" });
    }, [guess._id]);

    const markCorrectWithEdit = useCallback(
      (correctAnswer?: string) => {
        setCorrectionPending(true);
        setCorrectionError(undefined);
        setGuessState.call(
          {
            guessId: guess._id,
            state: "correct",
            ...(correctAnswer === undefined ? {} : { correctAnswer }),
          },
          (error) => {
            setCorrectionPending(false);
            setCorrectionError(error?.message);
          },
        );
      },
      [guess._id],
    );

    const toggleStateCorrectWithEdit = useCallback(() => {
      setConfirmPendingFor(undefined);
      setNextState((state) => (state === "correct" ? undefined : "correct"));
    }, []);

    const toggleStateIntermediate = useCallback(() => {
      setConfirmPendingFor(undefined);
      setNextState((state) =>
        state === "intermediate" ? undefined : "intermediate",
      );
    }, []);

    const toggleStateRejected = useCallback(() => {
      setConfirmPendingFor(undefined);
      setNextState((state) => (state === "rejected" ? undefined : "rejected"));
    }, []);

    const submitStageTwo = useCallback(() => {
      if (!nextState) return;

      if (nextState === "correct") {
        if (correctionPending) return;
        const correction = correctedAnswer(editedAnswer, guess.guess);
        if (!correction) {
          markCorrectWithEdit();
          return;
        }
        if (
          correction.changesMoreThanSpacing &&
          confirmPendingFor !== correction.answer
        ) {
          setConfirmPendingFor(correction.answer);
          return;
        }
        markCorrectWithEdit(correction.answer);
        return;
      }

      setGuessState.call({
        guessId: guess._id,
        state: nextState,
        additionalNotes: additionalNotes === "" ? undefined : additionalNotes,
      });
    }, [
      guess._id,
      guess.guess,
      nextState,
      additionalNotes,
      editedAnswer,
      confirmPendingFor,
      correctionPending,
      markCorrectWithEdit,
    ]);
    const onStageTwoKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> =
      useCallback(
        (e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            submitStageTwo();
          }
        },
        [submitStageTwo],
      );
    // The stage-two forms have no submit button, so the browser would submit
    // them (a full page load) on Enter in a text input
    const onStageTwoSubmit = useCallback(
      (e: React.SubmitEvent<HTMLFormElement>) => {
        e.preventDefault();
      },
      [],
    );

    const dismissGuess = useCallback(() => {
      onDismiss(guess._id);
    }, [onDismiss, guess._id]);

    const idPrefix = useId();

    const { t, i18n } = useTranslation();

    const [, setOperatorActionsHidden] = useOperatorActionsHiddenForHunt(
      guess.hunt,
    );
    const switchToSolverView = useCallback(() => {
      setOperatorActionsHidden(true);
    }, [setOperatorActionsHidden]);

    const extLinkTooltip = (
      <Tooltip id={`${idPrefix}-ext-link-tooltip`}>
        {t("guessQueue.openPuzzleTooltip", "Open puzzle")}
      </Tooltip>
    );

    const linkTarget = `/hunts/${puzzle.hunt}/puzzles/${puzzle._id}`;

    const disableForms = guess.state !== "pending";

    const correctButtonVariant =
      guess.state === "correct" ? "success" : "outline-secondary";
    const intermediateButtonVariant =
      guess.state === "intermediate" ? "warning" : "outline-secondary";
    const incorrectButtonVariant =
      guess.state === "incorrect" ? "danger" : "outline-secondary";
    const rejectButtonVariant =
      guess.state === "rejected" ? "secondary" : "outline-secondary";

    const stageTwoLabels = {
      intermediate: t(
        "notification.guessMessage.intermediateInstruction",
        "Paste or write any additional instructions to pass on to the solver:",
      ),
      rejected: t(
        "notification.guessMessage.rejectInstruction",
        "Include any additional information on why this guess was rejected:",
      ),
    };
    const submittedStageTwoLabels: Partial<Record<GuessType["state"], string>> =
      {
        intermediate: t(
          "notification.guessMessage.submittedIntermediate",
          "Additional instructions passed on to the solver:",
        ),
        rejected: t(
          "notification.guessMessage.submittedRejected",
          "Additional information on why this guess was rejected:",
        ),
      };

    let stageTwoSection;
    switch (nextState) {
      case "correct":
        stageTwoSection = (
          <Form onSubmit={onStageTwoSubmit}>
            <StyledNotificationRow>
              {t(
                "notification.guessMessage.correctWithEditInstruction",
                "Enter the corrected answer to this puzzle as provided by HQ (or just submit to mark it correct).",
              )}
            </StyledNotificationRow>
            {confirmPendingFor !== undefined && (
              <Alert variant="warning" transition={false}>
                <strong>
                  {t(
                    "notification.guessMessage.confirmEditHeading",
                    "Are you sure?",
                  )}
                </strong>{" "}
                {t(
                  "notification.guessMessage.confirmEditBody",
                  "You are changing more than just the spacing of this answer. Check it and submit it again to confirm.",
                )}
              </Alert>
            )}
            <StyledNotificationRow>
              <Form.Group controlId={`${idPrefix}-original-answer`}>
                <Form.Label>
                  {t(
                    "notification.guessMessage.originalAnswer",
                    "Original answer:",
                  )}
                </Form.Label>
                <Form.Control type="text" readOnly value={guess.guess} />
              </Form.Group>
            </StyledNotificationRow>
            <StyledNotificationRow>
              <Form.Group controlId={`${idPrefix}-corrected-answer`}>
                <Form.Label>
                  {t(
                    "notification.guessMessage.correctedAnswer",
                    "Your correction:",
                  )}
                </Form.Label>
                <StyledNotificationRow>
                  <ReactTextareaAutosize
                    id={`${idPrefix}-corrected-answer`}
                    minRows={1}
                    className="form-control"
                    autoFocus
                    disabled={disableForms}
                    value={editedAnswer}
                    onChange={onEditedAnswerChange}
                    onKeyDown={onStageTwoKeyDown}
                  />
                </StyledNotificationRow>
              </Form.Group>
            </StyledNotificationRow>
            <StyledNotificationActionBar>
              <StyledNotificationActionItem>
                <Button
                  variant="outline-secondary"
                  size="sm"
                  disabled={disableForms || correctionPending}
                  onClick={submitStageTwo}
                >
                  {t("notification.guessMessage.save", "Save (or press Enter)")}
                </Button>
              </StyledNotificationActionItem>
            </StyledNotificationActionBar>
            <ToastActionError error={correctionError} />
          </Form>
        );
        break;
      case "intermediate":
      case "rejected":
        stageTwoSection = (
          <Form onSubmit={onStageTwoSubmit}>
            <StyledNotificationRow>
              <Form.Group controlId={`${idPrefix}-additional-notes`}>
                <Form.Label>{stageTwoLabels[nextState]}</Form.Label>
                <StyledNotificationRow>
                  <ReactTextareaAutosize
                    id={`${idPrefix}-additional-notes`}
                    minRows={1}
                    className="form-control"
                    autoFocus
                    disabled={disableForms}
                    value={additionalNotes}
                    onChange={onAdditionalNotesChange}
                    onKeyDown={onStageTwoKeyDown}
                  />
                </StyledNotificationRow>
              </Form.Group>
            </StyledNotificationRow>
            <StyledNotificationActionBar>
              <StyledNotificationActionItem>
                <Button
                  variant="outline-secondary"
                  size="sm"
                  disabled={disableForms}
                  onClick={submitStageTwo}
                >
                  {t("notification.guessMessage.save", "Save (or press Enter)")}
                </Button>
              </StyledNotificationActionItem>
            </StyledNotificationActionBar>
          </Form>
        );
        break;
      default:
        stageTwoSection = undefined;
        break;
    }

    return (
      <Toast onClose={dismissGuess}>
        <Toast.Header>
          <FontAwesomeIcon icon={faKey} className="me-2" />
          <StyledGuessHeader>
            <Trans
              i18nKey="notification.guessMessage.puzzleHeader"
              t={t}
              defaults="Guess for <puzzleLink />"
              values={{ puzzle: puzzle.title }}
              components={{
                puzzleLink: (
                  <a
                    href={linkTarget}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {puzzle.title}
                  </a>
                ),
              }}
            />
          </StyledGuessHeader>
          <StyledNotificationTimestamp>
            {calendarTimeFormat(guess.createdAt, t, i18n.language)}
          </StyledNotificationTimestamp>
          {guess.state !== "pending" && (
            <SpinnerTimer
              className="ms-3"
              width={16}
              height={16}
              startTime={guess.updatedAt.getTime()}
              endTime={guess.updatedAt.getTime() + LINGER_PERIOD}
            />
          )}
          <ToastSettings id={`${idPrefix}-settings`}>
            <DropdownItem onClick={switchToSolverView}>
              {t(
                "notification.guessMessage.switchToSolver",
                "Switch to Solver view for this hunt",
              )}
              <SettingsItemHelp className="text-muted">
                {t(
                  "notification.guessMessage.switchToSolverHelp",
                  "Hides guess alerts and edit controls. To bring them back, choose Deputy on the puzzle list or “Switch to Deputy” in the profile menu.",
                )}
              </SettingsItemHelp>
            </DropdownItem>
          </ToastSettings>
        </Toast.Header>
        <Toast.Body>
          <StyledGuessAnswer>
            <PuzzleAnswer answer={guess.guess} breakable />
          </StyledGuessAnswer>
          <StyledNotificationActionBar>
            <StyledNotificationActionItem>
              <CopyToClipboardButton
                text={guess.guess}
                variant="outline-secondary"
                size="sm"
                aria-label="Copy"
              >
                <FontAwesomeIcon icon={faCopy} />
              </CopyToClipboardButton>
            </StyledNotificationActionItem>
            <StyledNotificationActionItem>
              <OverlayTrigger placement="top" overlay={extLinkTooltip}>
                <Button
                  variant="outline-secondary"
                  size="sm"
                  as="a"
                  href={guessURL(hunt, puzzle)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <FontAwesomeIcon icon={faPuzzlePiece} />
                </Button>
              </OverlayTrigger>
            </StyledNotificationActionItem>
            <GuessDetailBadges guess={guess} />
          </StyledNotificationActionBar>
          <StyledNotificationActionBar>
            <StyledNotificationActionItem $grow>
              <Dropdown as={ButtonGroup} className="flex-grow-1">
                <Button
                  variant={correctButtonVariant}
                  size="sm"
                  className="flex-grow-1"
                  disabled={disableForms}
                  active={nextState === "correct"}
                  onClick={markCorrect}
                >
                  {t("notification.guessMessage.correct", "Correct")}
                </Button>
                <DropdownToggle
                  split
                  variant={correctButtonVariant}
                  size="sm"
                  disabled={disableForms}
                  id={`${idPrefix}-correct-options`}
                />
                <DropdownMenu align="end">
                  <DropdownItem onClick={toggleStateCorrectWithEdit}>
                    {t(
                      "notification.guessMessage.correctWithEdit",
                      "Correct with edit",
                    )}
                    …
                  </DropdownItem>
                </DropdownMenu>
              </Dropdown>
            </StyledNotificationActionItem>
            <StyledNotificationActionItem $grow>
              <Button
                variant={intermediateButtonVariant}
                size="sm"
                className="flex-grow-1"
                disabled={disableForms}
                active={nextState === "intermediate"}
                onClick={toggleStateIntermediate}
              >
                {t("notification.guessMessage.intermediate", "Intermediate")}…
              </Button>
            </StyledNotificationActionItem>
            <StyledNotificationActionItem $grow>
              <Button
                variant={incorrectButtonVariant}
                size="sm"
                className="flex-grow-1"
                disabled={disableForms}
                onClick={markIncorrect}
              >
                {t("notification.guessMessage.incorrect", "Incorrect")}
              </Button>
            </StyledNotificationActionItem>
            <StyledNotificationActionItem $grow>
              <Button
                variant={rejectButtonVariant}
                size="sm"
                className="flex-grow-1"
                disabled={disableForms}
                active={nextState === "rejected"}
                onClick={toggleStateRejected}
              >
                {t("notification.guessMessage.reject", "Reject")}…
              </Button>
            </StyledNotificationActionItem>
          </StyledNotificationActionBar>
          {guess.state !== "pending" && guess.additionalNotes && (
            <>
              <div>
                {submittedStageTwoLabels[guess.state] ??
                  `${t(
                    "notification.guessMessage.additionalNotes",
                    "Additional notes",
                  )}:`}
              </div>
              <Markdown text={guess.additionalNotes} />
            </>
          )}
          {guess.state === "pending" && stageTwoSection}
        </Toast.Body>
      </Toast>
    );
  },
);

const AnnouncementMessage = React.memo(
  ({
    id,
    announcement,
    createdByDisplayName,
  }: {
    id: string;
    announcement: AnnouncementType;
    createdByDisplayName: string;
  }) => {
    const [dismissed, setDismissed] = useState(false);
    const onDismiss = useCallback(() => {
      setDismissed(true);
      dismissPendingAnnouncement.call({ pendingAnnouncementId: id });
    }, [id]);

    if (dismissed) {
      return null;
    }

    return (
      <CappedAnnouncementToast
        message={announcement.message}
        createdAt={announcement.createdAt}
        displayName={createdByDisplayName}
        onClose={onDismiss}
      />
    );
  },
);

enum UpdateGoogleScriptStatus {
  IDLE = "idle",
  PENDING = "pending",
  ERROR = "error",
}

type UpdateGoogleScriptState =
  | {
      status: Exclude<UpdateGoogleScriptStatus, UpdateGoogleScriptStatus.ERROR>;
    }
  | {
      status: UpdateGoogleScriptStatus.ERROR;
      error: string;
    };

const UpdateGoogleScriptMessage = ({
  onDismiss,
}: {
  onDismiss: () => void;
}) => {
  const [state, setState] = useState<UpdateGoogleScriptState>({
    status: UpdateGoogleScriptStatus.IDLE,
  });

  const updateGoogleScript = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      setState({ status: UpdateGoogleScriptStatus.PENDING });
      configureEnsureGoogleScript.call((error) => {
        if (error) {
          setState({
            status: UpdateGoogleScriptStatus.ERROR,
            error: error.message,
          });
        } else {
          setState({ status: UpdateGoogleScriptStatus.IDLE });
        }
      });
    },
    [],
  );

  return (
    <Toast onClose={onDismiss}>
      <Toast.Header>
        <strong className="me-auto">Update Google Script</strong>
      </Toast.Header>
      <Toast.Body>
        The currently deployed version of Jolly Roger&apos;s Google Apps Script
        is out of date. This can cause issues with features that depend on it,
        such as inserting images into spreadsheets.
        <StyledNotificationActionBar>
          <StyledNotificationActionItem>
            <Button
              variant="outline-secondary"
              disabled={state.status === UpdateGoogleScriptStatus.PENDING}
              onClick={updateGoogleScript}
            >
              Update
              {state.status === UpdateGoogleScriptStatus.PENDING && (
                <>
                  {" "}
                  <FontAwesomeIcon icon={faSpinner} spin />
                </>
              )}
            </Button>
          </StyledNotificationActionItem>
        </StyledNotificationActionBar>
        {state.status === UpdateGoogleScriptStatus.ERROR ? state.error : null}
      </Toast.Body>
    </Toast>
  );
};

const ProfileMissingMessage = ({ onDismiss }: { onDismiss: () => void }) => {
  return (
    <Toast onClose={onDismiss}>
      <Toast.Header>
        <strong className="me-auto">Profile missing</strong>
      </Toast.Header>
      <Toast.Body>
        Somehow you don&apos;t seem to have a profile. (This can happen if you
        wind up having to do a password reset before you successfully log in for
        the first time.) Please set a display name for yourself via{" "}
        <Link to="/users/me">the profile page</Link>.
      </Toast.Body>
    </Toast>
  );
};

// How many matched dingwords the chat toast offers to mute individually.
const MAX_MUTE_ITEMS = 3;

const MuteDingwordItem = ({
  word,
  disabled,
  onMute,
}: {
  word: string;
  disabled: boolean;
  onMute: (word: string) => void;
}) => {
  const { t } = useTranslation();
  const mute = useCallback(() => onMute(word), [onMute, word]);

  return (
    <DropdownItem disabled={disabled} onClick={mute}>
      {t(
        "notification.chat.muteWordForPuzzle",
        "Mute “{{word}}” for this puzzle",
        {
          word,
          // Plain text in the menu, so escaping only shows entities; drop once both i18n inits stop escaping
          interpolation: { escapeValue: false },
        },
      )}
    </DropdownItem>
  );
};

// Dismissing a chat notification, or every one from its puzzle, and the
// pending state and error of the last dismiss-all or mute.
const useChatNotificationActions = (cn: ChatNotificationType) => {
  const id = cn._id;
  const dismiss = useCallback(
    () => dismissChatNotification.call({ chatNotificationId: id }),
    [id],
  );

  // The newest notification shown for this puzzle, by the server's clock:
  // everything up to it has been seen, while a ding arriving mid-request
  // stays. (A client clock behind the server's would otherwise leave the
  // most recent toasts in place.)
  const newestSeen = useCallback(() => {
    const newest = ChatNotifications.findOne(
      { hunt: cn.hunt, puzzle: cn.puzzle },
      { sort: { createdAt: -1 } },
    );
    return newest?.createdAt ?? cn.createdAt;
  }, [cn.hunt, cn.puzzle, cn.createdAt]);

  // A dismiss or mute in flight, and the error the last one failed with
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<string>();
  const startAction = useCallback(() => {
    setActionPending(true);
    setActionError(undefined);
  }, []);
  const finishAction = useCallback((error?: Meteor.Error) => {
    setActionPending(false);
    setActionError(error?.message);
  }, []);

  const dismissAllForPuzzle = useCallback(() => {
    startAction();
    dismissChatNotificationsForPuzzle.call(
      {
        hunt: cn.hunt,
        puzzle: cn.puzzle,
        dismissUntil: newestSeen(),
      },
      finishAction,
    );
  }, [cn.hunt, cn.puzzle, newestSeen, startAction, finishAction]);

  return {
    dismiss,
    dismissAllForPuzzle,
    newestSeen,
    startAction,
    finishAction,
    actionPending,
    actionError,
  };
};

const chatNotificationLink = (
  cn: ChatNotificationType,
  hunt: HuntType,
  puzzle: PuzzleType,
) =>
  chatMessagePath({
    hunt: hunt._id,
    puzzle: puzzle._id,
    whiteboard: isWhiteboardPuzzle(puzzle),
    message: cn.message,
    thread: cn.thread,
  });

// A new whiteboard comment on the card of a puzzle the user is on: it reads
// as a comment on that puzzle (cardPuzzle), from its sender, with the
// comment's first line. If the card's puzzle has gone it reads as a comment
// on the whiteboard.
export const BoardCommentNotificationMessage = ({
  cn,
  hunt,
  puzzle,
  cardPuzzle,
  displayNames,
}: {
  cn: ChatNotificationType;
  hunt: HuntType;
  puzzle: PuzzleType;
  cardPuzzle: PuzzleType | undefined;
  displayNames: Map<string, string>;
}) => {
  const { t, i18n } = useTranslation();
  const { dismiss, dismissAllForPuzzle, actionPending, actionError } =
    useChatNotificationActions(cn);

  const mentionedKey = (cn.mentionedPuzzles ?? []).join(",");
  const titles = useTracker(
    () =>
      new Map(
        Puzzles.find({
          _id: { $in: mentionedKey.split(",").filter(Boolean) },
        }).map((p) => [p._id, p.title]),
      ),
    [mentionedKey],
  );
  const text = firstLine(
    chatMessagePlainText(cn.content, displayNames, titles),
  );

  const messageLink = chatNotificationLink(cn, hunt, puzzle);

  return (
    <Toast onClose={dismiss}>
      <Toast.Header>
        <FontAwesomeIcon icon={faComment} className="me-2" />
        <strong className="me-auto">
          {cardPuzzle ? (
            <Trans
              i18nKey="notification.boardComment.title"
              t={t}
              defaults="Comment on <puzzleLink />"
              components={{
                puzzleLink: (
                  <Link to={messageLink} onClick={dismiss}>
                    {cardPuzzle.title}
                  </Link>
                ),
              }}
            />
          ) : (
            <Link to={messageLink} onClick={dismiss}>
              {t(
                "notification.boardComment.titleUnknown",
                "Comment on the whiteboard",
              )}
            </Link>
          )}
        </strong>
        <StyledNotificationTimestamp>
          {calendarTimeFormat(cn.createdAt, t, i18n.language)}
        </StyledNotificationTimestamp>
        <ToastSettings id={`chat-settings-${cn._id}`}>
          <DropdownItem disabled={actionPending} onClick={dismissAllForPuzzle}>
            {t(
              "notification.boardComment.dismissAll",
              "Dismiss all from the whiteboard",
            )}
          </DropdownItem>
          <DropdownItem as={Link} to="/users/me">
            {t("notification.boardComment.settings", "Board comment settings")}
          </DropdownItem>
        </ToastSettings>
      </Toast.Header>
      <CappedToastBody>
        <ToastActionError error={actionError} />
        <Trans
          i18nKey="notification.boardComment.body"
          t={t}
          defaults="<sender />: <text />"
          components={{
            sender: <strong>{displayNames.get(cn.sender) ?? "???"}</strong>,
            text: <span>{text}</span>,
          }}
        />
      </CappedToastBody>
    </Toast>
  );
};

// A chat message that dinged the user
export const ChatNotificationMessage = ({
  cn,
  hunt,
  puzzle,
  displayNames,
  selfUserId,
  roles,
}: {
  cn: ChatNotificationType;
  hunt: HuntType;
  puzzle: PuzzleType;
  displayNames: Map<string, string>;
  selfUserId: string;
  roles: string[];
}) => {
  const { t, i18n } = useTranslation();
  const {
    dismiss,
    dismissAllForPuzzle,
    newestSeen,
    startAction,
    finishAction,
    actionPending,
    actionError,
  } = useChatNotificationActions(cn);

  const suppressed = useTracker(
    () => Meteor.user()?.suppressedDingwords?.[cn.hunt]?.[cn.puzzle] ?? [],
    [cn.hunt, cn.puzzle],
  );
  const allMuted = suppressed.includes(SUPPRESS_ALL_DINGWORDS);
  const muteableWords = (cn.dingwords ?? [])
    .filter((word) => !suppressed.includes(word))
    .slice(0, MAX_MUTE_ITEMS);

  const muteForPuzzle = useCallback(
    (dingword?: string) => {
      startAction();
      suppressDingwordsForPuzzle.call(
        {
          hunt: cn.hunt,
          puzzle: cn.puzzle,
          // A present-but-undefined key fails the server's check()
          ...(dingword === undefined ? {} : { dingword }),
          dismissUntil: newestSeen(),
        },
        finishAction,
      );
    },
    [cn.hunt, cn.puzzle, newestSeen, startAction, finishAction],
  );
  const muteAllForPuzzle = useCallback(() => {
    muteForPuzzle();
  }, [muteForPuzzle]);

  const messageLink = chatNotificationLink(cn, hunt, puzzle);

  return (
    <Toast onClose={dismiss}>
      <Toast.Header>
        <FontAwesomeIcon icon={faComment} className="me-2" />
        <strong className="me-auto">
          <Link to={messageLink} onClick={dismiss}>
            {puzzle.title}
          </Link>
        </strong>
        <StyledNotificationTimestamp>
          {calendarTimeFormat(cn.createdAt, t, i18n.language)}
        </StyledNotificationTimestamp>
        <ToastSettings id={`chat-settings-${cn._id}`}>
          <DropdownItem disabled={actionPending} onClick={dismissAllForPuzzle}>
            {t(
              "notification.chat.dismissAllForPuzzle",
              "Dismiss all for this puzzle",
            )}
          </DropdownItem>
          <DropdownItem as={Link} to="/users/me">
            {t("notification.chat.editDingwords", "Edit dingwords")}
          </DropdownItem>
          {!allMuted && (
            <>
              <Dropdown.Divider />
              <DropdownItem disabled={actionPending} onClick={muteAllForPuzzle}>
                <Trans
                  i18nKey="notification.chat.muteAllForPuzzle"
                  t={t}
                  defaults="Mute <strong>all</strong> dingwords for this puzzle"
                  components={{ strong: <strong /> }}
                />
              </DropdownItem>
              {muteableWords.map((word) => (
                <MuteDingwordItem
                  key={word}
                  word={word}
                  disabled={actionPending}
                  onMute={muteForPuzzle}
                />
              ))}
            </>
          )}
        </ToastSettings>
      </Toast.Header>
      <CappedToastBody>
        <ToastActionError error={actionError} />
        <div>
          <ChatMessage
            message={cn.content}
            displayNames={displayNames}
            selfUserId={selfUserId}
            roles={roles}
          />
        </div>
      </CappedToastBody>
    </Toast>
  );
};

const BookmarkNotificationMessage = ({
  bn,
  hunt,
  puzzle,
}: {
  bn: BookmarkNotificationType;
  hunt: HuntType;
  puzzle: PuzzleType;
}) => {
  const id = bn._id;
  const dismiss = useCallback(
    () => dismissBookmarkNotification.call({ bookmarkNotificationId: id }),
    [id],
  );

  const puzzleId = puzzle._id;
  const [unbookmarkError, setUnbookmarkError] = useState<string>();
  const unbookmark = useCallback(() => {
    setUnbookmarkError(undefined);
    bookmarkPuzzle.call({ puzzleId, bookmark: false }, (error) => {
      if (error) {
        setUnbookmarkError(error.message);
      } else {
        // The toast is about a bookmark that no longer exists
        dismiss();
      }
    });
  }, [puzzleId, dismiss]);

  const { t } = useTranslation();

  let describeState;
  switch (bn.solvedness) {
    case "solved":
      describeState = t("notification.bookmark.solved", "has been solved");
      break;
    case "unsolved":
      describeState = t(
        "notification.bookmark.partiallySolved",
        "has been partially solved",
      );
      break;
    default:
      describeState = "has changed state";
      break;
  }

  return (
    <Toast onClose={dismiss}>
      <Toast.Header>
        <strong className="me-auto">
          <Link
            to={`/hunts/${hunt._id}/puzzles/${puzzle._id}`}
            onClick={dismiss}
          >
            {puzzle.title}
          </Link>{" "}
          {describeState}
        </strong>
        <ToastSettings id={`bookmark-settings-${id}`}>
          <DropdownItem onClick={unbookmark}>
            {t("notification.bookmark.unbookmark", "Unbookmark this puzzle")}
          </DropdownItem>
        </ToastSettings>
      </Toast.Header>
      <CappedToastBody>
        <ToastActionError error={unbookmarkError} />
        <div>
          <Trans
            i18nKey="notification.bookmark.message"
            t={t}
            // using context instead of count here because Chinese doesn't
            // have _one variants, but we still want it to print a slightly
            // different message
            context={`${puzzle.answers.length}`}
            values={{ describeState: describeState }}
            components={{
              puzzleAnswer: <PuzzleAnswer answer={bn.answer} breakable />,
            }}
          />
        </div>
      </CappedToastBody>
    </Toast>
  );
};

// How long an ephemeral puzzle notification stays up before dismissing itself.
const EPHEMERAL_LINGER_PERIOD = 5000;

const PuzzleNotificationMessage = ({
  pn,
  hunt,
  puzzle,
}: {
  pn: PuzzleNotificationType;
  hunt: HuntType;
  puzzle: PuzzleType;
}) => {
  const id = pn._id;
  const dismiss = useCallback(
    () => dismissPuzzleNotification.call({ puzzleNotificationId: id }),
    [id],
  );

  const { t, i18n } = useTranslation();

  const ephemeral = pn.ephemeral ?? false;
  const [shownAt] = useState(() => Date.now());

  return (
    <Toast
      onClose={dismiss}
      className={`text-bg-${pn.background}`}
      delay={EPHEMERAL_LINGER_PERIOD}
      autohide={ephemeral}
    >
      <Toast.Header>
        <FontAwesomeIcon icon={faPuzzlePiece} className="me-2" />
        <strong className="me-auto">
          <Link
            to={`/hunts/${hunt._id}/puzzles/${puzzle._id}`}
            onClick={dismiss}
          >
            {puzzle.title}
          </Link>
        </strong>
        <StyledNotificationTimestamp>
          {calendarTimeFormat(pn.createdAt, t, i18n.language)}
        </StyledNotificationTimestamp>
        {ephemeral && (
          <SpinnerTimer
            className="ms-3"
            width={16}
            height={16}
            startTime={shownAt}
            endTime={shownAt + EPHEMERAL_LINGER_PERIOD}
          />
        )}
      </Toast.Header>
      <CappedToastBody>{pn.content}</CappedToastBody>
    </Toast>
  );
};

const ReloadRequiredNotification = ({ reasons }: { reasons: string[] }) => {
  const reload = useCallback(() => window.location.reload(), []);

  return (
    <Toast>
      <Toast.Header closeButton={false}>
        <strong className="me-auto">Jolly Roger update pending</strong>
      </Toast.Header>
      <Toast.Body>
        <StyledNotificationRow>
          There is a new version of Jolly Roger available, but we&apos;re
          delaying the update because:
          <ul>
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          We don&apos;t want to interrupt your work, but it is important that
          you update as soon as is reasonable, so when you&apos;re at a breaking
          point, please reload the page. (Or if these blockers all go away, we
          will do so automatically.)
        </StyledNotificationRow>
        <StyledNotificationActionBar>
          <StyledNotificationActionItem>
            <Button variant="outline-danger" onClick={reload} size="sm">
              Reload
            </Button>
          </StyledNotificationActionItem>
        </StyledNotificationActionBar>
      </Toast.Body>
    </Toast>
  );
};

const StyledToastContainer = styled(ToastContainer)`
  z-index: 1050;

  > *:not(:last-child) {
    /* I like these toasts packed a little more efficiently */
    margin-bottom: 0.5rem;
  }
`;

// Module-level cache: survives SPA navigations but resets on page reload,
// so the check re-runs after the user changes tracking protection settings.
let cookieCheckCache: boolean | undefined;

const useCookieCheck = (
  urls: string[] | undefined,
): { result: boolean | undefined; frames: React.ReactNode } => {
  // On mobile we show a link to the Google Doc rather than embedding it in an
  // iframe, so third-party cookie support doesn't matter.
  const isDesktop = useMediaQuery(desktopQuery);
  const [result, setResult] = useState(cookieCheckCache);

  // Use hasUrls to short-circuit and as a dependency for the effect so we don't
  // have to worry about array identity.
  const hasUrls = !!urls?.length;

  useEffect(() => {
    if (!hasUrls || !isDesktop || result !== undefined) return undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let settled = false;

    function resolve(ok: boolean) {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      cookieCheckCache = ok;
      setResult(ok);
    }

    // If any iframe successfully posts back, that means the code loaded and we
    // get a trustworthy result.
    const onMessage = (event: MessageEvent) => {
      const data = event.data;
      if (data?.type === "jr-cookie-check" && typeof data.ok === "boolean") {
        resolve(data.ok);
      }
    };
    window.addEventListener("message", onMessage);

    // If no frame ever responds (e.g. every candidate 404s, an extension blocks
    // the requests, or a frame is redirected to a login wall), treat it as
    // cookies blocked, since if the test iframes can't load, the Sheets embed
    // won't work either.
    timeout = setTimeout(() => resolve(false), 10000);

    return () => {
      window.removeEventListener("message", onMessage);
      clearTimeout(timeout);
    };
  }, [hasUrls, isDesktop, result]);

  if (!isDesktop) return { result: true, frames: null };
  if (result !== undefined || !urls?.length) return { result, frames: null };

  // Still checking: render one hidden iframe per candidate URL and let the
  // client accept whichever one resolves.
  const frames = urls.map((url) => (
    // oxlint-disable-next-line react/iframe-missing-sandbox -- cross-origin cookie check needs unsandboxed access
    <iframe
      key={url}
      src={url}
      style={{ display: "none" }}
      title="Cookie check"
    />
  ));
  return { result: undefined, frames };
};

const CookieWarningMessage = ({ onDismiss }: { onDismiss: () => void }) => {
  const { t } = useTranslation();
  const ua = navigator.userAgent;
  let tip: string;
  if (/Firefox\//i.test(ua)) {
    tip = t(
      "notification.cookieWarning.tip.firefox",
      "If you're already signed in, try clicking the shield icon in the address bar and disabling Enhanced Tracking Protection for this site. If you use a privacy extension like Privacy Badger, you may also need to allow cookies for this site there.",
    );
  } else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) {
    tip = t(
      "notification.cookieWarning.tip.safari",
      "If you're already signed in, try going to Settings > Safari > Privacy & Security and disabling 'Prevent Cross-Site Tracking'. If you use a content blocker, you may also need to allow cookies for this site there.",
    );
  } else {
    tip = t(
      "notification.cookieWarning.tip.chrome",
      "If you're already signed in, check that third-party cookies are allowed in your browser settings. If you use a privacy extension like Privacy Badger, you may also need to allow cookies for this site there.",
    );
  }

  return (
    <Toast onClose={onDismiss}>
      <Toast.Header>
        <strong className="me-auto">
          {t("notification.cookieWarning.header", "Editing anonymously")}
        </strong>
      </Toast.Header>
      <Toast.Body>
        {t(
          "notification.cookieWarning.body",
          "Either you're not logged into your Google account, or your browser is blocking the cookies that let Google identify you in our embedded spreadsheets. Your edits won't be associated with you, making it harder for everyone to see who's working on what.",
        )}
        <StyledNotificationRow className="mt-2">{tip}</StyledNotificationRow>
      </Toast.Body>
    </Toast>
  );
};

const NotificationCenter = () => {
  const googleEnabled = useTracker(() => {
    return (
      !Flags.active("disable.google") &&
      !!ServiceConfiguration.configurations.findOne({ service: "google" })
    );
  }, []);
  const admin = useTracker(() => isAdmin(Meteor.user()), []);
  const hasGoogleAccount = useTracker(() => !!Meteor.user()?.googleAccount, []);
  const needsGoogleScriptInfo = googleEnabled && (admin || hasGoogleAccount);
  useSubscribe(needsGoogleScriptInfo ? "googleScriptInfo" : undefined);
  const showUpdateGoogleScript = useTracker(() => {
    return admin && needsGoogleScriptInfo
      ? GoogleScriptInfo.findOne()?.outOfDate
      : false;
  }, [admin, needsGoogleScriptInfo]);

  const cookieCheckUrls = useTracker(() => {
    if (!hasGoogleAccount || !needsGoogleScriptInfo) return undefined;
    return GoogleScriptInfo.findOne()?.cookieCheckUrls;
  }, [hasGoogleAccount, needsGoogleScriptInfo]);
  const { result: cookieCheckResult, frames: cookieCheckFrames } =
    useCookieCheck(cookieCheckUrls);
  const [hideCookieWarning, setHideCookieWarning] = useState(false);
  const onHideCookieWarning = useCallback(() => setHideCookieWarning(true), []);

  const [pendingUpdate, blockReasons] = useBlockReasons();

  const operatorHunts = useTracker(
    () => [...huntsUserIsOperatorFor(Meteor.user())],
    [],
  );
  const fetchPendingGuesses = operatorHunts.length > 0;
  const pendingGuessesLoading = useTypedSubscribe(
    fetchPendingGuesses ? pendingGuessesForSelf : undefined,
  );

  const [operatorActionsHidden] = useOperatorActionsHidden();
  const activeOperatorHunts = operatorHunts.filter(
    (huntId) => !operatorActionsHidden[huntId],
  );
  useSubscribe(
    activeOperatorHunts.length > 0 ? "subscribers.inc" : undefined,
    "operators",
    Object.fromEntries(activeOperatorHunts.map((h) => [h, true])),
  );

  const pendingAnnouncementsLoading = useTypedSubscribe(
    pendingAnnouncementsForSelf,
  );
  const bookmarkNotificationsLoading = useTypedSubscribe(
    bookmarkNotificationsForSelf,
  );

  const disableDingwords = useTracker(() => Flags.active("disable.dingwords"));
  const chatNotificationsLoading = useSubscribe(
    disableDingwords ? undefined : "chatNotifications",
  );
  const puzzleNotificationsLoading = useTypedSubscribe(
    disableDingwords ? undefined : puzzleNotificationsForSelf,
  );

  const loading =
    pendingGuessesLoading() ||
    pendingAnnouncementsLoading() ||
    bookmarkNotificationsLoading() ||
    chatNotificationsLoading() ||
    puzzleNotificationsLoading();

  const hasOwnProfile = useTracker(() => !!Meteor.user()?.displayName, []);

  const selfUserId = useTracker(() => Meteor.userId()!, []);
  // Lookup tables to support guesses/pendingAnnouncements/chatNotifications/bookmarkNotifications
  const hunts = useTracker(
    () =>
      loading ? new Map<string, HuntType>() : indexedById(Hunts.find().fetch()),
    [loading],
  );
  const puzzles = useTracker(
    () =>
      loading
        ? new Map<string, PuzzleType>()
        : indexedById(Puzzles.find().fetch()),
    [loading],
  );
  const displayNames = useTracker(
    () => (loading ? new Map<string, string>() : indexedDisplayNames()),
    [loading],
  );
  const announcements = useTracker(
    () =>
      loading
        ? new Map<string, AnnouncementType>()
        : indexedById(Announcements.find().fetch()),
    [loading],
  );

  const [recentGuessEpoch, setRecentGuessEpoch] = useState(
    Date.now() - LINGER_PERIOD,
  );
  const guesses = useTracker(
    () =>
      loading || !fetchPendingGuesses
        ? []
        : Guesses.find(
            {
              $and: [
                {
                  // Only display pending guesses for hunts in which we are an operator.
                  // It's possible that e.g. on a puzzle page, we'll be subscribed to
                  // all guesses for that puzzle, so we should avoid showing guess
                  // queue UI if we're an operator for a different hunt but not the
                  // one the guess is for.
                  hunt: { $in: operatorHunts },
                },
                {
                  $or: [
                    { state: "pending" },
                    { updatedAt: { $gt: new Date(recentGuessEpoch) } },
                  ],
                },
              ],
            },
            { sort: { createdAt: 1 } },
          )
            .fetch()
            .filter((g) => puzzles.has(g.puzzle)),
    [loading, fetchPendingGuesses, operatorHunts, recentGuessEpoch, puzzles],
  );
  const pendingAnnouncements = useTracker(
    () =>
      loading
        ? []
        : PendingAnnouncements.find(
            { user: Meteor.userId()! },
            { sort: { createdAt: 1 } },
          ).fetch(),
    [loading],
  );
  const chatNotifications = useTracker(
    () =>
      loading || disableDingwords
        ? []
        : ChatNotifications.find({}, { sort: { timestamp: 1 } }).fetch(),
    [loading, disableDingwords],
  );
  const bookmarkNotifications = useTracker(() =>
    loading
      ? []
      : BookmarkNotifications.find({}, { sort: { createdAt: 1 } }).fetch(),
  );
  const puzzleNotifications = useTracker(
    () =>
      loading || disableDingwords
        ? []
        : PuzzleNotifications.find({}, { sort: { createdAt: 1 } }).fetch(),
    [loading, disableDingwords],
  );
  // Assigned roles only, on purpose: an @operator mention only notifies
  // assigned operators (queryOperatorsForHunt), so the hunt's default roles
  // don't highlight it either
  const rolesForChat = useTracker(() => {
    const hunts = new Set(chatNotifications.map((cn) => cn.hunt));
    const roles = new Map(
      [...hunts].map((huntId) => {
        return [
          huntId,
          listAssignedRolesForHunt(Meteor.user(), { _id: huntId }),
        ];
      }),
    );
    return roles;
  }, [chatNotifications]);

  const [hideUpdateGoogleScriptMessage, setHideUpdateGoogleScriptMessage] =
    useState(false);
  const [hideProfileSetupMessage, setHideProfileSetupMessage] = useState(false);
  const [dismissedGuesses, setDismissedGuesses] = useState<
    Record<string, Date>
  >({});

  const onHideUpdateGoogleScriptMessage = useCallback(() => {
    setHideUpdateGoogleScriptMessage(true);
  }, []);

  const onHideProfileSetupMessage = useCallback(() => {
    setHideProfileSetupMessage(true);
  }, []);

  const dismissGuess = useCallback((guessId: string) => {
    setDismissedGuesses((prevDismissedGuesses) => {
      return { ...prevDismissedGuesses, [guessId]: new Date() };
    });
  }, []);

  useEffect(() => {
    // Update after some seconds if one of the guesses was lingering
    // after a state change.
    const lingeringGuesses = guesses.filter((g) => g.state !== "pending");
    if (lingeringGuesses.length === 0) {
      return () => {
        /* no unwind */
      };
    }

    const earliestLingerUpdatedAt = Math.min(
      ...lingeringGuesses.map((g) => g.updatedAt?.getTime() ?? 0),
    );
    // We want to schedule an update to recentGuessEpoch to run once the oldest
    // lingering guess would fall out of retention.
    const earliestLingerDisappearsAt = earliestLingerUpdatedAt + LINGER_PERIOD;
    const timeUntilLingerDisappears = earliestLingerDisappearsAt - Date.now();

    const timeout = Meteor.setTimeout(() => {
      setRecentGuessEpoch(Date.now() - LINGER_PERIOD);
    }, timeUntilLingerDisappears);

    return () => {
      if (timeout) {
        Meteor.clearTimeout(timeout);
      }
    };
  }, [guesses]);

  if (loading) {
    return <div />;
  }

  // Build a list of uninstantiated messages with their props, then create them
  const messages = [] as React.JSX.Element[];

  if (pendingUpdate && blockReasons.length > 0) {
    messages.push(
      <ReloadRequiredNotification
        key="reloadRequired"
        reasons={blockReasons}
      />,
    );
  }

  if (showUpdateGoogleScript && !hideUpdateGoogleScriptMessage) {
    messages.push(
      <UpdateGoogleScriptMessage
        onDismiss={onHideUpdateGoogleScriptMessage}
        key="updateGoogleScript"
      />,
    );
  }

  if (!hasOwnProfile && !hideProfileSetupMessage) {
    messages.push(
      <ProfileMissingMessage
        key="profile"
        onDismiss={onHideProfileSetupMessage}
      />,
    );
  }

  if (cookieCheckResult === false && !hideCookieWarning) {
    messages.push(
      <CookieWarningMessage
        key="cookieWarning"
        onDismiss={onHideCookieWarning}
      />,
    );
  }

  guesses.forEach((g) => {
    const dismissedAt = dismissedGuesses[g._id];
    if (dismissedAt && dismissedAt > (g.updatedAt ?? g.createdAt)) return;
    if (operatorActionsHidden[g.hunt]) return;
    const hunt = hunts.get(g.hunt);
    const puzzle = puzzles.get(g.puzzle);
    if (!hunt || !puzzle) return;
    if (!hunt.hasGuessQueue) return;
    messages.push(
      <GuessMessage
        key={g._id}
        guess={g}
        puzzle={puzzle}
        hunt={hunt}
        onDismiss={dismissGuess}
      />,
    );
  });

  pendingAnnouncements.forEach((pa) => {
    const announcement = announcements.get(pa.announcement);
    if (!announcement) return;
    messages.push(
      <AnnouncementMessage
        key={pa._id}
        id={pa._id}
        announcement={announcement}
        createdByDisplayName={displayNames.get(pa.createdBy) ?? "???"}
      />,
    );
  });

  chatNotifications.forEach((cn) => {
    const hunt = hunts.get(cn.hunt);
    const puzzle = puzzles.get(cn.puzzle);
    if (!hunt || !puzzle) return;
    messages.push(
      cn.reason === "boardComment" ? (
        <BoardCommentNotificationMessage
          key={cn._id}
          cn={cn}
          hunt={hunt}
          puzzle={puzzle}
          cardPuzzle={cn.cardPuzzle ? puzzles.get(cn.cardPuzzle) : undefined}
          displayNames={displayNames}
        />
      ) : (
        <ChatNotificationMessage
          key={cn._id}
          cn={cn}
          hunt={hunt}
          puzzle={puzzle}
          displayNames={displayNames}
          selfUserId={selfUserId}
          roles={rolesForChat.get(cn.hunt) ?? []}
        />
      ),
    );
  });

  bookmarkNotifications.forEach((bn) => {
    const hunt = hunts.get(bn.hunt);
    const puzzle = puzzles.get(bn.puzzle);
    if (!hunt || !puzzle) return;
    messages.push(
      <BookmarkNotificationMessage
        key={bn._id}
        bn={bn}
        hunt={hunt}
        puzzle={puzzle}
      />,
    );
  });

  puzzleNotifications.forEach((pn) => {
    const hunt = hunts.get(pn.hunt);
    const puzzle = puzzles.get(pn.puzzle);
    if (!hunt || !puzzle) return;
    messages.push(
      <PuzzleNotificationMessage
        key={pn._id}
        pn={pn}
        hunt={hunt}
        puzzle={puzzle}
      />,
    );
  });

  return (
    <>
      {cookieCheckFrames}
      <StyledToastContainer
        position="bottom-end"
        className="p-3 position-fixed"
      >
        {/* Reversed, so the kinds pushed last (puzzle, bookmark and chat
            notifications) sit at the top of this bottom-anchored stack: new
            toasts land above the guess and setup toasts rather than moving
            them, and within each kind the newest comes first */}
        {messages.toReversed()}
      </StyledToastContainer>
    </>
  );
};

export default NotificationCenter;
