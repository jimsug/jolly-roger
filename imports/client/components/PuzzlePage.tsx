import { Meteor } from "meteor/meteor";
import { Random } from "meteor/random";
import { useSubscribe, useTracker } from "meteor/react-meteor-data";
import { faLightbulb as faLightbulbRegular } from "@fortawesome/free-regular-svg-icons/faLightbulb";
import { faAngleDoubleDown } from "@fortawesome/free-solid-svg-icons/faAngleDoubleDown";
import { faAngleDoubleUp } from "@fortawesome/free-solid-svg-icons/faAngleDoubleUp";
import { faArrowDown } from "@fortawesome/free-solid-svg-icons/faArrowDown";
import { faChevronLeft } from "@fortawesome/free-solid-svg-icons/faChevronLeft";
import { faComment } from "@fortawesome/free-solid-svg-icons/faComment";
import { faCopy } from "@fortawesome/free-solid-svg-icons/faCopy";
import { faEdit } from "@fortawesome/free-solid-svg-icons/faEdit";
import { faFaceSmile } from "@fortawesome/free-solid-svg-icons/faFaceSmile";
import { faImage } from "@fortawesome/free-solid-svg-icons/faImage";
import { faKey } from "@fortawesome/free-solid-svg-icons/faKey";
import { faLightbulb as faLightbulbSolid } from "@fortawesome/free-solid-svg-icons/faLightbulb";
import { faLocationCrosshairs } from "@fortawesome/free-solid-svg-icons/faLocationCrosshairs";
import { faPaperPlane } from "@fortawesome/free-solid-svg-icons/faPaperPlane";
import { faPuzzlePiece } from "@fortawesome/free-solid-svg-icons/faPuzzlePiece";
import { faReply } from "@fortawesome/free-solid-svg-icons/faReply";
import { faReplyAll } from "@fortawesome/free-solid-svg-icons/faReplyAll";
import { faThumbtack } from "@fortawesome/free-solid-svg-icons/faThumbtack";
import { faTimes } from "@fortawesome/free-solid-svg-icons/faTimes";
import { faUnlock } from "@fortawesome/free-solid-svg-icons/faUnlock";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { ComponentPropsWithRef, FC } from "react";
import React, {
  useCallback,
  useContext,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import Col from "react-bootstrap/Col";
import type { FormControlProps } from "react-bootstrap/FormControl";
import FormControl from "react-bootstrap/FormControl";
import FormGroup from "react-bootstrap/FormGroup";
import FormLabel from "react-bootstrap/FormLabel";
import FormText from "react-bootstrap/FormText";
import InputGroup from "react-bootstrap/InputGroup";
import Modal from "react-bootstrap/Modal";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Row from "react-bootstrap/Row";
import ToggleButton from "react-bootstrap/ToggleButton";
import ToggleButtonGroup from "react-bootstrap/ToggleButtonGroup";
import Tooltip from "react-bootstrap/Tooltip";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useLocation, useParams } from "react-router";
import type { Descendant } from "slate";
import styled, { css, keyframes } from "styled-components";
import {
  calendarTimeFormat,
  shortCalendarTimeFormat,
} from "../../lib/calendarTimeFormat";
import chatMessagePlainText from "../../lib/chatMessagePlainText";
import { messageDingsUser } from "../../lib/dingwordLogic";
import isReaction from "../../lib/isReaction";
import { indexedById, sortedBy } from "../../lib/listUtils";
import Bookmarks from "../../lib/models/Bookmarks";
import type { ChatMessageType } from "../../lib/models/ChatMessages";
import ChatMessages from "../../lib/models/ChatMessages";
import type { DocumentType } from "../../lib/models/Documents";
import Documents from "../../lib/models/Documents";
import type { GuessType } from "../../lib/models/Guesses";
import Guesses from "../../lib/models/Guesses";
import Hunts from "../../lib/models/Hunts";
import type { PuzzleType } from "../../lib/models/Puzzles";
import Puzzles from "../../lib/models/Puzzles";
import type { TagType } from "../../lib/models/Tags";
import Tags from "../../lib/models/Tags";
import {
  listAssignedRolesForHunt,
  userMayUpdateGuessesForHunt,
  userMayWritePuzzlesForHunt,
} from "../../lib/permission_stubs";
import chatMessagesForPuzzle from "../../lib/publications/chatMessagesForPuzzle";
import puzzleForPuzzlePage from "../../lib/publications/puzzleForPuzzlePage";
import puzzleInterestsForHunt from "../../lib/publications/puzzleInterestsForHunt";
import { computeSolvedness } from "../../lib/solvedness";
import isWhiteboardPuzzle from "../../lib/whiteboard/isWhiteboardPuzzle";
import addPuzzleAnswer from "../../methods/addPuzzleAnswer";
import addPuzzleTag from "../../methods/addPuzzleTag";
import createChatImageUpload from "../../methods/createChatImageUpload";
import createGuess from "../../methods/createGuess";
import ensurePuzzleDocument from "../../methods/ensurePuzzleDocument";
import removePuzzleAnswer from "../../methods/removePuzzleAnswer";
import removePuzzleTag from "../../methods/removePuzzleTag";
import sendChatMessage from "../../methods/sendChatMessage";
import setChatMessagePin from "../../methods/setChatMessagePin";
import undestroyPuzzle from "../../methods/undestroyPuzzle";
import updatePuzzle from "../../methods/updatePuzzle";
import {
  cleanEditorMessage,
  emptyEditorContent,
  hasLoadingImage as hasLoadingImageInContent,
  hasSendableContent,
} from "../chatEditorContent";
import EnabledChatImage from "../EnabledChatImage";
import { useBreadcrumb } from "../hooks/breadcrumb";
import {
  useOperatorActionsHiddenForHunt,
  usePersistedSidebarWidth,
} from "../hooks/persisted-state";
import useBlockUpdate from "../hooks/useBlockUpdate";
import type { Action, CallState, JoinCallOptions } from "../hooks/useCallState";
import useCallState from "../hooks/useCallState";
import useDocumentTitle from "../hooks/useDocumentTitle";
import useDocumentVisible from "../hooks/useDocumentVisible";
import useMentionableUsers from "../hooks/useMentionableUsers";
import usePuzzleInterest from "../hooks/usePuzzleInterest";
import useSubscribeDisplayNames from "../hooks/useSubscribeDisplayNames";
import useTypedSubscribe from "../hooks/useTypedSubscribe";
import indexedDisplayNames from "../indexedDisplayNames";
import { trace } from "../tracing";
import BookmarkButton from "./BookmarkButton";
import ChatMessage from "./ChatMessage";
import ChatMessageReactions from "./ChatMessageReactions";
import ChatPeople from "./ChatPeople";
import type { TickerSyncMessage, TickerToastType } from "./ChatTicker";
import ChatTicker, { isTickerSyncMessage, tickerDuration } from "./ChatTicker";
import CopyToClipboardButton from "./CopyToClipboardButton";
import DocumentDisplay, {
  DocumentMessage,
  googleDocumentUrl,
} from "./DocumentDisplay";
import type { FancyEditorHandle } from "./FancyEditor";
import FancyEditor from "./FancyEditor";
import GuessState from "./GuessState";
import {
  GUESS_CONFIDENCE_LEVELS,
  GUESS_DIRECTION_LEVELS,
  GuessConfidenceBadge,
  GuessDirectionBadge,
} from "./guessDetails";
import HighlightsPanel from "./HighlightsPanel";
import InsertImage from "./InsertImage";
import Markdown from "./Markdown";
import MinimizedChatInfo from "./MinimizedChatInfo";
import type { ModalFormHandle } from "./ModalForm";
import ModalForm from "./ModalForm";
import PinnedMessagePane from "./PinnedMessagePane";
import PuzzleAnswer from "./PuzzleAnswer";
import PuzzleInterestPopover from "./PuzzleInterestPopover";
import type { PuzzleModalFormSubmitPayload } from "./PuzzleModalForm";
import PuzzleModalForm from "./PuzzleModalForm";
import PuzzleUnlockModal from "./PuzzleUnlockModal";
import ReplyThreadPopover from "./ReplyThreadPopover";
import SplitPaneMinus from "./SplitPaneMinus";
import Breakable from "./styling/Breakable";
import { MonospaceFontFamily } from "./styling/constants";
import FixedLayout from "./styling/FixedLayout";
import { mediaBreakpointDown } from "./styling/responsive";
import TagList from "./TagList";
import type { BoardFocus } from "./whiteboard/BoardFocusContext";
import BoardFocusContext from "./whiteboard/BoardFocusContext";
import describeCommentTarget from "./whiteboard/describeCommentTarget";

// Shows a state dump as an in-page overlay when enabled.
const DEBUG_SHOW_CALL_STATE = false;

const tabId = Random.id();

type FilteredChatFields =
  | "_id"
  | "hunt"
  | "puzzle"
  | "content"
  | "sender"
  | "timestamp"
  | "pinTs"
  | "parentId"
  | "comment"
  | "thread";
type FilteredChatMessageType = Pick<ChatMessageType, FilteredChatFields>;
// Shared by every message without reactions, so their memoised props hold
const NO_REACTIONS: FilteredChatMessageType[] = [];

// It doesn't need to be, but this is consistent with the 576px transition used in other pages' css
const MinimumSidebarWidth = 176;
const MinimumDocumentWidth = 400;
const DefaultSidebarWidth = 200;

export const MinimumDesktopWidth = MinimumSidebarWidth + MinimumDocumentWidth;

// How long a message stays highlighted after being scrolled to
const PULSE_MS = 1000;
// How far from the bottom (in px) still counts as reading the latest messages
const NEAR_BOTTOM_PX = 60;
// How long a chat history that opens on a message waits before landing on it
// a second time (see ChatHistory)
const RESTORE_SETTLE_MS = 100;

// PuzzlePage has some pretty unique properties:
//
// * It's the only page which iframes other sites.  Doing so requires that we
//   specify the absolute size and position of the iframe, which makes us need
//   position: fixed.
// * There's up to three interesting pieces of content shown on this page:
//   * Chat
//   * Puzzle metadata (title, solved, puzzle link, guesses, tags)
//   * The collaborative document (usually a spreadsheet)
//   All three of them may have more content than fits reasonably on the screen,
//   so managing their sizes effectively is important.
// * At smaller screen sizes, we try to collapse content so the most useful
//   interactions are still possible.  On mobile, it often makes more sense to
//   delegate document interaction to the native Google apps.  Chat (and which
//   puzzle you're looking at) are the most important panes, since when people
//   are on runarounds the chat is the thing they want to see/write in most, and
//   that's the most common time you'd be using jolly-roger from a mobile device.
//
//   Given these priorities, we have several views:
//
//   a: chat and voicechat
//   b: metadata
//   c: document
//
//   Wide (>=MinimiumDesktopWidth) - "desktop"
//    _____________________________
//   |      |         b            |
//   |  a   |______________________|
//   |      |                      |
//   |      |                      |
//   |      |         c            |
//   |      |                      |
//   |______|______________________|
//
//   Narrow (<MinimumDesktopWidth) - "mobile"
//    ____________
//   |     b     |
//   |___________|
//   |           |
//   |     a     |
//   |           |
//   |___________|

const ChatHistoryWrapper = styled.div`
  flex: 1 1 auto;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
`;

const ChatHistoryDiv = styled.div`
  flex: 1 1 auto;
  overflow-y: auto;

  /* Nothing should overflow the box, but if you nest blockquotes super deep you
     can do horrible things.  We should still avoid horizontal scroll bars,
     since they make the log harder to read at the bottom. */
  overflow-x: hidden;
`;

const UnreadPill = styled.button`
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  background-color: ${({ theme }) => theme.colors.primary};
  color: ${({ theme }) => theme.colors.chatBadgeText};
  border: none;
  padding: 6px 16px;
  border-radius: 20px;
  cursor: pointer;
  z-index: 100;
  box-shadow: 0 2px 5px rgb(0 0 0 / 30%);
  font-size: 0.9rem;
  font-weight: 600;
  opacity: 0.9;

  &:hover {
    opacity: 1;
  }
`;

const PUZZLE_PAGE_PADDING = 8;

// Keyframes can't read the theme, so the message sets the colour it starts
// from
const pulse = keyframes`
  0% {
    background-color: var(--chat-message-pulse-color);
  }

  100% {
    background-color: transparent;
  }
`;

const ChatMessageDiv = styled.div<{
  $isSystemMessage: boolean;
  $isHighlighted: boolean;
  $isPinned?: boolean;
  $isReplyTarget?: boolean;
  $isPulsing?: boolean;
}>`
  padding: 0 ${PUZZLE_PAGE_PADDING}px 2px;
  overflow-wrap: break-word;
  font-size: 0.8rem;
  position: relative;
  ${({ $isSystemMessage, $isHighlighted }) =>
    $isHighlighted &&
    !$isSystemMessage &&
    css`
      background-color: ${({ theme }) =>
        theme.colors.pinnedChatMessageBackground};
    `}

  ${({ $isSystemMessage }) =>
    $isSystemMessage &&
    css`
      background-color: ${({ theme }) =>
        theme.colors.systemChatMessageBackground};
    `}

  ${({ $isPinned }) =>
    $isPinned &&
    css`
      background-color: ${({ theme }) => theme.colors.pinnedMessageBackground};
    `}

  ${({ $isReplyTarget }) =>
    $isReplyTarget &&
    css`
      background-color: ${({ theme }) =>
        theme.colors.replyChatMessageBackground};
    `}

  &:hover {
    background-color: ${({ theme }) => theme.colors.hoverChatMessageBackground};
  }

  ${({ $isPulsing }) =>
    $isPulsing &&
    css`
      --chat-message-pulse-color: ${({ theme }) =>
        theme.colors.pulseChatMessageBackground};

      animation: ${pulse} ${PULSE_MS}ms ease-out;
    `}
`;

// The react/reply/pin pill, shown while the message is hovered
const ChatMessageActions = styled.div`
  position: absolute;
  top: 0;
  right: ${PUZZLE_PAGE_PADDING}px;
  display: flex;
  opacity: 0;
  z-index: 10;
  transition: opacity 0.2s ease-in-out;

  ${ChatMessageDiv}:hover &,
  ${ChatMessageDiv}:focus-within & {
    opacity: 1;
  }
`;

const SplitPill = styled.div`
  display: inline-flex;
  align-items: stretch;
  background-color: ${({ theme }) => theme.colors.fancyEditorBackground};
  border-radius: 10px;
  overflow: hidden;
  margin: 2px 0;
`;

const PillSection = styled.button`
  padding: 2px 7px;
  display: flex;
  align-items: center;
  border: none;
  background: none;
  color: ${({ theme }) => theme.colors.replyButtonText};
  cursor: pointer;

  &:not(:last-child) {
    border-right: 1px solid ${({ theme }) => theme.colors.border};
  }

  &:hover {
    color: ${({ theme }) => theme.colors.hoverReplyButtonText};
    background-color: ${({ theme }) => theme.colors.chatActionHoverBackground};
  }
`;

const ChatMessageSender = styled.span`
  display: flex;
  align-items: center;
  gap: 4px;
`;

// Under a whiteboard comment: what it's on, and a way to find it.
const CommentNote = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const CommentNoteLink = styled(Button)`
  padding: 0;
  font-size: inherit;
  vertical-align: baseline;
`;

const ChatInputRow = styled.div`
  padding: ${PUZZLE_PAGE_PADDING}px;
  padding-bottom: max(
    env(safe-area-inset-bottom, 0px),
    ${PUZZLE_PAGE_PADDING}px
  );
`;

const ReplyingTo = styled.div`
  background-color: ${({ theme }) => theme.colors.replyingToBackground};
  padding: 4px;
  margin-bottom: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  font-size: 0.8rem;
`;

const ReplyingToTarget = styled.button`
  flex: 1;
  text-align: left;
  border: none;
  background: none;
  padding: 0;
  color: inherit;
  cursor: pointer;
`;

const ReplyingToCancel = styled.button`
  border: none;
  background: none;
  padding: 0 4px;
  color: inherit;
  cursor: pointer;
`;

const ChatMessageTimestamp = styled.span`
  float: right;
  font-style: italic;
  font-size: 12px;
  color: #666;
`;

const ChatSectionDiv = styled.div`
  flex: 1 1 auto;
  display: flex;
  flex-flow: column;
  overflow: hidden;

  p,
  ul,
  blockquote,
  pre {
    margin-bottom: 0;
  }

  blockquote {
    font-size: 14px;
    margin-left: 10px;
    border-left-color: #aaa;
  }
`;

const PuzzleContent = styled.div`
  display: flex;
  flex-direction: column;
`;

const PuzzleMetadata = styled.div`
  flex: none;
  padding: ${PUZZLE_PAGE_PADDING - 2}px 8px;
  border-bottom: 1px solid #dadce0;
  background-color: ${({ theme }) => theme.colors.background};
`;

const PuzzleMetadataAnswer = styled.span`
  background-color: ${({ theme }) => theme.colors.solvedness.solved};
  overflow: hidden;

  /* Tag-like */
  display: inline-flex;
  align-items: center;
  line-height: 24px;
  margin: 2px 4px 2px 0;
  padding: 0 6px;
  border-radius: 4px;
`;

const AnswerRemoveButton: FC<ComponentPropsWithRef<typeof Button>> = styled(
  Button,
)`
  /* Specifier boost needed to override Bootstrap button style */
  && {
    margin: 0 -6px 0 6px;
    padding: 0;
  }
`;

const PuzzleMetadataFloatingButton = styled(Button)`
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 20;
`;

const PuzzleMetadataRow = styled.div`
  display: flex;
  width: 100%;
  font-size: 14px;
  align-items: center;
  align-content: flex-start;
  justify-content: flex-start;
  flex-wrap: wrap;
`;

const PuzzleMetadataActionRow = styled(PuzzleMetadataRow)`
  align-items: center;
  flex-wrap: nowrap;

  a {
    margin-right: 8px;
  }
`;

const PuzzleMetadataButtons = styled.div`
  margin-left: auto;
  display: flex;
  flex-wrap: nowrap;
  align-items: center;

  button {
    margin: 2px 0 2px 8px;
  }
`;

// Holds the tag list either inline on the action row (one line, clipped
// while the layout is being measured) or on a row of its own (wrapping).
const PuzzleMetadataTags = styled.div<{ $inline: boolean }>`
  display: flex;
  align-items: center;
  ${({ $inline }) =>
    $inline
      ? css`
          flex: 0 1 auto;
          flex-wrap: nowrap;
          min-width: 0;
          overflow: hidden;
        `
      : css`
          width: 100%;
          flex-wrap: wrap;
        `}
`;

const PuzzleMetadataAnswers = styled.span`
  display: flex;
  flex-grow: 1;
  justify-content: flex-start;
  align-items: flex-start;
  align-content: flex-start;
  flex-wrap: wrap;
  overflow: hidden;
`;

const PuzzleMetadataExternalLink = styled.a`
  display: inline-block;
  font-weight: bold;
  white-space: nowrap;
`;

const StyledTagList = styled(TagList)`
  display: contents;
`;

const AnswerFormControl = styled(FormControl)`
  text-transform: uppercase;
  font-family: ${MonospaceFontFamily};
  font-weight: 400;
`;

const ChatHistoryMessage = React.memo(
  ({
    message,
    reactions,
    displayNames,
    isSystemMessage,
    isHighlighted,
    isPinned,
    isReplyTarget,
    isPulsing,
    suppressSender,
    selfUserId,
    roles,
    registerMessageRef,
    scrollToMessage,
    onReply,
    imageOnLoad,
  }: {
    message: FilteredChatMessageType;
    // The reactions to this message
    reactions: FilteredChatMessageType[];
    displayNames: Map<string, string>;
    isSystemMessage: boolean;
    isHighlighted: boolean;
    isPinned: boolean;
    // A reply to this message is being written
    isReplyTarget: boolean;
    isPulsing: boolean;
    suppressSender: boolean;
    selfUserId: string;
    roles: string[];
    // Absent for copies shown outside the history (the pinned pane), which
    // scrolling must not land on
    registerMessageRef?: (messageId: string, el: HTMLDivElement | null) => void;
    scrollToMessage: (messageId: string) => void;
    onReply: (messageId: string) => void;
    imageOnLoad: () => void;
  }) => {
    const { t, i18n } = useTranslation();
    const ts = shortCalendarTimeFormat(message.timestamp, t, i18n.language);

    // On the whiteboard, comments and their replies can be found on the
    // board.
    const boardFocus = useContext(BoardFocusContext);
    const commentThread = message.comment ? message._id : message.thread;
    const commentNode = message.comment?.node;
    const isComment = !!message.comment;
    const commentTarget = useTracker(
      () =>
        boardFocus && isComment
          ? describeCommentTarget(commentNode, t)
          : undefined,
      [boardFocus, isComment, commentNode, t],
    );
    const showOnBoard = useCallback(() => {
      if (commentThread) {
        boardFocus?.focusComment(commentThread);
      }
    }, [boardFocus, commentThread]);

    const senderDisplayName =
      message.sender !== undefined
        ? (displayNames.get(message.sender) ?? "???")
        : "jolly-roger";

    const messageId = message._id;
    const setMessageRef = useCallback(
      (el: HTMLDivElement | null) => {
        registerMessageRef?.(messageId, el);
      },
      [registerMessageRef, messageId],
    );

    const parentId = message.parentId;

    const [showPicker, setShowPicker] = useState(false);
    const pickerTargetRef = useRef<HTMLButtonElement>(null);
    const togglePicker = useCallback(() => setShowPicker((s) => !s), []);
    const hidePicker = useCallback(() => setShowPicker(false), []);

    // A react, unreact or pin that failed, shown under the message
    const [actionError, setActionError] = useState<string>();
    const showActionError = useCallback((error: unknown) => {
      setActionError(error instanceof Error ? error.message : String(error));
    }, []);
    const clearActionError = useCallback(() => setActionError(undefined), []);

    const [pinning, setPinning] = useState(false);
    const togglePin = useCallback(() => {
      setPinning(true);
      void (async () => {
        try {
          await setChatMessagePin.callPromise({
            messageId,
            pinned: !message.pinTs,
          });
        } catch (error) {
          showActionError(error);
        } finally {
          setPinning(false);
        }
      })();
    }, [messageId, message.pinTs, showActionError]);

    const reply = useCallback(() => onReply(messageId), [onReply, messageId]);

    return (
      <ChatMessageDiv
        ref={setMessageRef}
        $isSystemMessage={isSystemMessage}
        $isHighlighted={isHighlighted && !isSystemMessage && !isPinned}
        $isPinned={isPinned}
        $isReplyTarget={isReplyTarget}
        $isPulsing={isPulsing}
      >
        <ChatMessageActions>
          <SplitPill>
            <PillSection
              type="button"
              ref={pickerTargetRef}
              title={t("chat.react", "React")}
              onClick={togglePicker}
            >
              <FontAwesomeIcon icon={faFaceSmile} />
            </PillSection>
            {boardFocus && commentThread && (
              <PillSection
                type="button"
                title={t("whiteboard.chat.showOnBoard", "Show on board")}
                onClick={showOnBoard}
              >
                <FontAwesomeIcon icon={faLocationCrosshairs} />
              </PillSection>
            )}
            <PillSection
              type="button"
              title={t("chat.reply", "Reply")}
              onClick={reply}
            >
              <FontAwesomeIcon icon={faReplyAll} />
            </PillSection>
            <PillSection
              type="button"
              title={
                message.pinTs
                  ? t("chat.unpin", "Remove pin")
                  : t("chat.pin", "Pin")
              }
              disabled={pinning}
              onClick={togglePin}
            >
              <FontAwesomeIcon icon={faThumbtack} />
            </PillSection>
          </SplitPill>
        </ChatMessageActions>
        {!suppressSender && <ChatMessageTimestamp>{ts}</ChatMessageTimestamp>}
        {(!suppressSender || parentId) && (
          <ChatMessageSender>
            {parentId && (
              <ReplyThreadPopover
                parentId={parentId}
                displayNames={displayNames}
                selfUserId={selfUserId}
                roles={roles}
                scrollToMessage={scrollToMessage}
              />
            )}
            {isPinned && (
              <span title={t("chat.pinned", "Pinned")}>
                <FontAwesomeIcon icon={faThumbtack} />
              </span>
            )}
            <strong>{senderDisplayName}</strong>
          </ChatMessageSender>
        )}
        <ChatMessage
          message={message.content}
          displayNames={displayNames}
          selfUserId={selfUserId}
          roles={roles}
          imageOnLoad={imageOnLoad}
        />
        {boardFocus && message.comment && (
          <CommentNote>
            <FontAwesomeIcon icon={faComment} />{" "}
            {t("whiteboard.chat.commentOn", "Comment on {{target}}", {
              target: commentTarget,
              // The target lands in a text node, so escaping would only show
              // entities; this goes once both i18n inits switch escapeValue off
              interpolation: { escapeValue: false },
            })}
            {message.comment.resolvedAt
              ? ` ${t("whiteboard.comments.resolvedMark", "(resolved)")}`
              : ""}
            {" · "}
            <CommentNoteLink variant="link" onClick={showOnBoard}>
              {t("whiteboard.chat.showOnBoard", "Show on board")}
            </CommentNoteLink>
          </CommentNote>
        )}
        <ChatMessageReactions
          messageId={messageId}
          puzzleId={message.puzzle}
          reactions={reactions}
          displayNames={displayNames}
          selfUserId={selfUserId}
          pickerTarget={pickerTargetRef}
          showPicker={showPicker}
          onHidePicker={hidePicker}
          onError={showActionError}
        />
        {actionError && (
          <Alert variant="danger" dismissible onClose={clearActionError}>
            {actionError}
          </Alert>
        )}
      </ChatMessageDiv>
    );
  },
);

type ChatHistoryHandle = {
  saveScrollBottomTarget: () => void;
  snapToBottom: () => void;
  scrollToTarget: () => void;
  scrollToMessage: (messageId: string) => void;
};

const ChatHistory = React.memo(
  ({
    chatMessages,
    reactionsByParent,
    displayNames,
    selfUser,
    roles,
    replyingTo,
    onReply,
    initialMessageId,
    onInitialMessageShown,
    ref,
  }: {
    chatMessages: FilteredChatMessageType[];
    reactionsByParent: Map<string, FilteredChatMessageType[]>;
    displayNames: Map<string, string>;
    selfUser: Meteor.User;
    roles: string[];
    replyingTo: string | undefined;
    onReply: (messageId: string) => void;
    // A message to land on when the history mounts, rather than the bottom
    initialMessageId: string | undefined;
    onInitialMessageShown: () => void;
    ref: React.Ref<ChatHistoryHandle>;
  }) => {
    // Reactions are shown on the message they belong to, not as messages
    const visibleMessages = useMemo(
      () => chatMessages.filter((message) => !isReaction(message)),
      [chatMessages],
    );

    const historyRef = useRef<HTMLDivElement>(null);
    const scrollBottomTarget = useRef(0);
    const shouldIgnoreNextScrollEvent = useRef(false);
    // Messages that arrived while scrolled up into the backlog
    const [unreadCount, setUnreadCount] = useState(0);
    const seenMessageCount = useRef(visibleMessages.length);

    const saveScrollBottomTarget = useCallback(() => {
      if (historyRef.current) {
        const rect = historyRef.current.getClientRects()[0]!;
        const scrollHeight = historyRef.current.scrollHeight;
        const scrollTop = historyRef.current.scrollTop;
        const hiddenHeight = scrollHeight - rect.height;
        const distanceFromBottom = hiddenHeight - scrollTop;
        trace("ChatHistory saveScrollBottomTarget", {
          distanceFromBottom,
          scrollHeight,
          scrollTop,
          rectHeight: rect.height,
          hiddenHeight,
        });
        scrollBottomTarget.current = distanceFromBottom;
        if (distanceFromBottom < NEAR_BOTTOM_PX) {
          setUnreadCount(0);
        }
      }
    }, []);

    const onScrollObserved = useCallback(() => {
      // When we call scrollToTarget and it actually changes scrollTop, this triggers a scroll event.
      // If the element's scrollHeight or clientHeight changed after scrollToTarget was called, we'd
      // mistakenly save an incorrect scrollBottomTarget.  So skip one scroll event when we self-induce
      // this callback, so we only update the target distance from bottom when the user is actually
      // scrolling.
      trace("ChatHistory onScrollObserved", {
        ignoring: shouldIgnoreNextScrollEvent.current,
      });
      if (shouldIgnoreNextScrollEvent.current) {
        shouldIgnoreNextScrollEvent.current = false;
      } else {
        saveScrollBottomTarget();
      }
    }, [saveScrollBottomTarget]);

    const scrollToTarget = useCallback(() => {
      if (historyRef.current) {
        const rect = historyRef.current.getClientRects()[0]!;
        const scrollHeight = historyRef.current.scrollHeight;
        const scrollTop = historyRef.current.scrollTop;
        const hiddenHeight = scrollHeight - rect.height;
        // if distanceFromBottom is hiddenHeight - scrollTop, then
        // our desired scrollTop is hiddenHeight - distanceFromBottom
        const scrollTopTarget = hiddenHeight - scrollBottomTarget.current;
        trace("ChatHistory scrollToTarget", {
          hasRef: true,
          target: scrollBottomTarget.current,
          scrollHeight,
          scrollTop,
          rectHeight: rect.height,
          hiddenHeight,
          alreadyIgnoringNextScrollEvent: shouldIgnoreNextScrollEvent.current,
        });
        if (scrollTop !== scrollTopTarget) {
          shouldIgnoreNextScrollEvent.current = true;
          historyRef.current.scrollTop = scrollTopTarget;
        }
      } else {
        trace("ChatHistory scrollToTarget", {
          hasRef: false,
          target: scrollBottomTarget.current,
        });
      }
    }, []);

    const snapToBottom = useCallback(() => {
      trace("ChatHistory snapToBottom");
      scrollBottomTarget.current = 0;
      scrollToTarget();
      setUnreadCount(0);
    }, [scrollToTarget]);

    // The rendered element of each message, so replies, pins and links can
    // scroll to it
    const messageRefs = useRef(new Map<string, HTMLDivElement>());
    const registerMessageRef = useCallback(
      (messageId: string, el: HTMLDivElement | null) => {
        if (el) {
          messageRefs.current.set(messageId, el);
        } else {
          messageRefs.current.delete(messageId);
        }
      },
      [],
    );

    const [pulsingMessageId, setPulsingMessageId] = useState<string>();
    const scrollToMessage = useCallback((messageId: string) => {
      const el = messageRefs.current.get(messageId);
      if (!el) {
        trace("ChatHistory scrollToMessage: no such message", { messageId });
        return;
      }
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setPulsingMessageId(messageId);
    }, []);
    useEffect(() => {
      if (!pulsingMessageId) {
        return undefined;
      }
      const timeout = setTimeout(
        () => setPulsingMessageId(undefined),
        PULSE_MS,
      );
      return () => clearTimeout(timeout);
    }, [pulsingMessageId]);

    // Kept across renders, so the panes around the history can scroll it from
    // their own layout effects before this one saves where it is
    useImperativeHandle(
      ref,
      () => ({
        saveScrollBottomTarget,
        snapToBottom,
        scrollToTarget,
        scrollToMessage,
      }),
      [saveScrollBottomTarget, snapToBottom, scrollToTarget, scrollToMessage],
    );

    // Only the value at mount counts: the parent forgets it once shown
    const [landingMessageId] = useState(initialMessageId);
    useLayoutEffect(() => {
      // Scroll to end of chat on initial mount, then on to the message it was
      // opened for, if any.
      trace("ChatHistory snapToBottom on mount");
      snapToBottom();
      if (!landingMessageId) {
        return undefined;
      }
      scrollToMessage(landingMessageId);
      onInitialMessageShown();
      // ChatPeople renders nothing until its own subscriptions are ready, and
      // keeping the distance from the bottom as it appears cuts the smooth
      // scroll short, so land on the message again a moment later. It can
      // still stop short when they take longer than that.
      const timeout = setTimeout(
        () => scrollToMessage(landingMessageId),
        RESTORE_SETTLE_MS,
      );
      return () => clearTimeout(timeout);
    }, [
      snapToBottom,
      scrollToMessage,
      landingMessageId,
      onInitialMessageShown,
    ]);

    useEffect(() => {
      // Add resize handler that scrolls to target
      window.addEventListener("resize", scrollToTarget);

      return () => {
        window.removeEventListener("resize", scrollToTarget);
      };
    }, [scrollToTarget]);

    const scrollChat = useCallback(() => {
      // Whenever we rerender due to new messages arriving, make our
      // distance-from-bottom match the previous one, if it's larger than some
      // small fudge factor.  But if the user has actually scrolled into the backlog,
      // don't move the backlog while they're reading it -- instead, assume they want
      // to see the same messages in the same position, and adapt the target bottom
      // distance instead (and count what they haven't seen).
      const newMessages = visibleMessages.length - seenMessageCount.current;
      seenMessageCount.current = visibleMessages.length;
      trace("ChatHistory useLayoutEffect", {
        scrollBottomTarget: scrollBottomTarget.current,
        action: scrollBottomTarget.current > NEAR_BOTTOM_PX ? "save" : "snap",
        messageCount: visibleMessages.length,
      });
      if (scrollBottomTarget.current > NEAR_BOTTOM_PX) {
        saveScrollBottomTarget();
        if (newMessages > 0) {
          setUnreadCount((count) => count + newMessages);
        }
      } else {
        snapToBottom();
      }
    }, [visibleMessages.length, saveScrollBottomTarget, snapToBottom]);

    useLayoutEffect(() => {
      scrollChat();
      // Keyed on every message, reactions included: a reaction on the last
      // message adds a row of pills below the fold without adding a visible
      // message
    }, [scrollChat, chatMessages.length]);

    const { t } = useTranslation();

    trace("ChatHistory render", { messageCount: visibleMessages.length });
    return (
      <ChatHistoryWrapper>
        {unreadCount > 0 && (
          <UnreadPill type="button" onClick={snapToBottom}>
            <FontAwesomeIcon icon={faArrowDown} />{" "}
            {t("chat.newMessages", {
              count: unreadCount,
              shown: unreadCount > 99 ? "99+" : unreadCount,
            })}
          </UnreadPill>
        )}
        <ChatHistoryDiv ref={historyRef} onScroll={onScrollObserved}>
          {visibleMessages.length === 0 ? (
            <ChatMessageDiv
              key="no-message"
              $isSystemMessage={false}
              $isHighlighted={false}
            >
              <span>
                {t("chat.noChatter", "No chatter yet. Say something?")}
              </span>
            </ChatMessageDiv>
          ) : undefined}
          {visibleMessages.map((msg, index, messages) => {
            // Only suppress sender and timestamp if:
            // * this is not the first message
            // * this message was sent by the same person as the previous message
            // * this message was sent within 60 seconds (60000 milliseconds) of the previous message
            // * this message is not pinned
            const lastMessage = index > 0 ? messages[index - 1] : undefined;
            const isPinned = !!msg.pinTs;
            const suppressSender =
              !!lastMessage &&
              lastMessage.sender === msg.sender &&
              lastMessage.timestamp.getTime() + 60000 >
                msg.timestamp.getTime() &&
              !isPinned;
            const isHighlighted = messageDingsUser(msg, selfUser);
            return (
              <ChatHistoryMessage
                key={msg._id}
                message={msg}
                reactions={reactionsByParent.get(msg._id) ?? NO_REACTIONS}
                displayNames={displayNames}
                isSystemMessage={msg.sender === undefined}
                isHighlighted={isHighlighted}
                isPinned={isPinned}
                isReplyTarget={replyingTo === msg._id}
                isPulsing={pulsingMessageId === msg._id}
                suppressSender={suppressSender}
                selfUserId={selfUser._id}
                roles={roles}
                registerMessageRef={registerMessageRef}
                scrollToMessage={scrollToMessage}
                onReply={onReply}
                imageOnLoad={scrollChat}
              />
            );
          })}
        </ChatHistoryDiv>
      </ChatHistoryWrapper>
    );
  },
);

const StyledFancyEditor = styled(FancyEditor)`
  flex: 1;
  display: block;
  background-color: ${({ theme }) => theme.colors.fancyEditorBackground};
  max-height: 200px;
  overflow-y: auto;
  overflow-x: hidden;
  white-space: pre-wrap;
  line-height: 20px;
  padding: 9px 4px;
  resize: none;
`;

type ChatInputHandle = {
  focus: () => void;
};

const ChatInput = React.memo(
  ({
    onHeightChange,
    onMessageSent,
    huntId,
    puzzleId,
    puzzles,
    displayNames,
    disabled,
    replyingTo,
    onCancelReply,
    scrollToMessage,
    ref,
  }: {
    onHeightChange: () => void;
    onMessageSent: () => void;
    huntId: string;
    puzzleId: string;
    puzzles: PuzzleType[];
    displayNames: Map<string, string>;
    disabled: boolean;
    replyingTo: string | undefined;
    onCancelReply: () => void;
    scrollToMessage: (messageId: string) => void;
    ref: React.Ref<ChatInputHandle>;
  }) => {
    const users = useMentionableUsers(huntId);
    const [uploadImageError, setUploadImageError] = useState<string>();
    const clearUploadImageError = useCallback(
      () => setUploadImageError(undefined),
      [],
    );
    const onHeightChangeCb = useCallback(
      (newHeight: number) => {
        if (onHeightChange) {
          trace("ChatInput onHeightChange", { newHeight });
          onHeightChange();
        }
      },
      [onHeightChange],
    );

    const [content, setContent] = useState(emptyEditorContent);
    const fancyEditorRef = useRef<FancyEditorHandle | null>(null);
    const onContentChange = useCallback(
      (newContent: Descendant[]) => {
        setContent(newContent);
        onHeightChangeCb(0);
      },
      [onHeightChangeCb],
    );
    const hasNonTrivialContent = useMemo(
      () => hasSendableContent(content),
      [content],
    );
    const hasLoadingImage = useMemo(
      () => hasLoadingImageInContent(content),
      [content],
    );

    const replyTargetName = useTracker(() => {
      if (!replyingTo) {
        return undefined;
      }
      const parent = ChatMessages.findOne(replyingTo);
      if (!parent) {
        return undefined;
      }
      return parent.sender
        ? (displayNames.get(parent.sender) ?? "???")
        : "jolly-roger";
    }, [replyingTo, displayNames]);
    // A reply is only sent as one while its target is here to be shown; a
    // parent that has gone would be rejected and the message lost
    const parentId = replyTargetName === undefined ? undefined : replyingTo;

    // The reply bar takes its height from the history, so say when it comes,
    // goes or changes, as ChatPeople does
    useLayoutEffect(() => {
      onHeightChange();
    }, [onHeightChange, parentId, replyTargetName]);

    const sendContentMessage = useCallback(() => {
      if (hasNonTrivialContent && !hasLoadingImage) {
        sendChatMessage.call({
          puzzleId,
          content: JSON.stringify(cleanEditorMessage(content)),
          ...(parentId ? { parentId } : {}),
        });
        setContent(emptyEditorContent());
        fancyEditorRef.current?.clearInput();
        fancyEditorRef.current?.focus();
        if (onMessageSent) {
          onMessageSent();
        }
        return true;
      }
      return false;
    }, [
      hasNonTrivialContent,
      hasLoadingImage,
      content,
      puzzleId,
      parentId,
      onMessageSent,
    ]);

    useBlockUpdate(
      hasNonTrivialContent
        ? "You're in the middle of typing a message."
        : undefined,
    );

    useImperativeHandle(ref, () => ({
      focus: () => fancyEditorRef.current?.focus(),
    }));

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleButtonClick = useCallback(() => {
      fileInputRef.current?.click();
    }, []);

    const uploadImageFile = useCallback(
      (file: File) => {
        const tempId = Random.id();
        fancyEditorRef.current?.insertImage("", tempId, "loading");

        createChatImageUpload.call(
          {
            puzzleId,
            mimeType: file.type,
          },
          (err, upload) => {
            if (err || !upload) {
              fancyEditorRef.current?.replaceImage("", tempId, "error");
              setUploadImageError(
                err?.message ??
                  "S3 presignedPost creation failed, check server settings to ensure S3 image bucket is configured correctly.",
              );
            } else {
              const { publicUrl, uploadUrl, fields } = upload;
              const formData = new FormData();
              for (const [key, value] of Object.entries(fields)) {
                formData.append(key, value);
              }
              formData.append("file", file);
              fetch(uploadUrl, {
                method: "POST",
                mode: "no-cors",
                body: formData,
              })
                .then(() => {
                  fancyEditorRef.current?.replaceImage(
                    publicUrl,
                    tempId,
                    "success",
                  );
                })
                .catch((uploadErr) => {
                  fancyEditorRef.current?.replaceImage("", tempId, "error");
                  setUploadImageError(`S3 upload failed: ${uploadErr.message}`);
                });
            }
          },
        );
      },
      [puzzleId],
    );

    function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        setUploadImageError("Only image files can be uploaded in chat.");
        return;
      }
      uploadImageFile(file);
    }

    useSubscribe("enabledChatImage");
    const enabledChatImage = useTracker(
      () => EnabledChatImage.findOne("enabledChatImage")?.enabled ?? false,
      [],
    );

    const errorModal = (
      <Modal show onHide={clearUploadImageError}>
        <Modal.Header closeButton>Error uploading image to chat</Modal.Header>
        <Modal.Body>
          <p>
            Something went wrong while uploading images to the chat. Contact
            admin with the error message for help.
          </p>
          <p>Error message: {uploadImageError}</p>
        </Modal.Body>
      </Modal>
    );

    const { t } = useTranslation();

    const scrollToReplyTarget = useCallback(() => {
      if (replyingTo) {
        scrollToMessage(replyingTo);
      }
    }, [scrollToMessage, replyingTo]);

    return (
      <ChatInputRow>
        {uploadImageError && createPortal(errorModal, document.body)}
        {parentId && replyTargetName !== undefined && (
          <ReplyingTo>
            <ReplyingToTarget type="button" onClick={scrollToReplyTarget}>
              <FontAwesomeIcon icon={faReply} />{" "}
              {t("chat.replyingTo", "Replying to {{name}}", {
                name: replyTargetName,
                // The name lands in a text node, so escaping would only show
                // entities; this goes once both i18n inits switch escapeValue
                // off
                interpolation: { escapeValue: false },
              })}
            </ReplyingToTarget>
            <ReplyingToCancel
              type="button"
              title={t("chat.cancelReply", "Cancel reply")}
              onClick={onCancelReply}
            >
              <FontAwesomeIcon icon={faTimes} />
            </ReplyingToCancel>
          </ReplyingTo>
        )}
        <InputGroup>
          <StyledFancyEditor
            ref={fancyEditorRef}
            className="form-control"
            initialContent={content}
            placeholder={t("chat.chatPrompt", "Chat")}
            users={users}
            puzzles={puzzles}
            onContentChange={onContentChange}
            onSubmit={sendContentMessage}
            uploadImageFile={uploadImageFile}
            disabled={disabled}
          />
          <Button
            variant="secondary"
            onClick={sendContentMessage}
            disabled={disabled || !hasNonTrivialContent || hasLoadingImage}
          >
            <FontAwesomeIcon icon={faPaperPlane} />
          </Button>
          {enabledChatImage && (
            <>
              <Button variant="secondary" onClick={handleButtonClick}>
                <FontAwesomeIcon icon={faImage} />
              </Button>
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                ref={fileInputRef}
                onChange={handleImageUpload}
              />
            </>
          )}
        </InputGroup>
      </ChatInputRow>
    );
  },
);

interface ChatSectionHandle {
  scrollHistoryToTarget: () => void;
  // Says whether the history was there to scroll
  scrollToMessage: (messageId: string) => boolean;
}

const ChatSection = React.memo(
  ({
    chatDataLoading,
    disabled,
    displayNames,
    chatMessages,
    puzzles,
    puzzleId,
    huntId,
    callState,
    callDispatch,
    joinCall,
    selfUser,
    initialMessageId,
    onInitialMessageShown,
    ref,
  }: {
    chatDataLoading: boolean;
    disabled: boolean;
    displayNames: Map<string, string>;
    chatMessages: FilteredChatMessageType[];
    puzzles: PuzzleType[];
    puzzleId: string;
    huntId: string;
    callState: CallState;
    callDispatch: React.Dispatch<Action>;
    joinCall: (options?: JoinCallOptions) => void;
    selfUser: Meteor.User;
    // A message for the history to land on when it mounts
    initialMessageId: string | undefined;
    onInitialMessageShown: () => void;
    ref: React.Ref<ChatSectionHandle>;
  }) => {
    const historyRef = useRef<React.ComponentRef<typeof ChatHistory>>(null);
    const inputRef = useRef<ChatInputHandle>(null);
    const scrollToTargetRequestRef = useRef(false);

    const scrollHistoryToTarget = useCallback(() => {
      trace("ChatSection scrollHistoryToTarget", {
        hasRef: !!historyRef.current,
        alreadyWantsDeferredScroll: scrollToTargetRequestRef.current,
      });
      if (historyRef.current) {
        historyRef.current.scrollToTarget();
      } else {
        // useLayoutEffect runs effects depth-first, which means when this
        // component is being rendered, the layout effects of our children
        // will fire while historyRef is null.  So if we get a request to
        // scroll to target during that time window, save it for later, and
        // fire it off again in our own useLayoutEffect hook.
        scrollToTargetRequestRef.current = true;
      }
    }, []);

    // The message a reply is being written to. The page is reused when the
    // route changes puzzle in place, and a reply only counts on the puzzle it
    // was started on.
    const [replyTarget, setReplyTarget] = useState<{
      puzzleId: string;
      messageId: string;
    }>();
    const replyingTo =
      replyTarget?.puzzleId === puzzleId ? replyTarget.messageId : undefined;
    const onReply = useCallback(
      (messageId: string) => {
        setReplyTarget({ puzzleId, messageId });
        inputRef.current?.focus();
      },
      [puzzleId],
    );
    const cancelReply = useCallback(() => setReplyTarget(undefined), []);

    const onMessageSent = useCallback(() => {
      trace("ChatSection onMessageSent", { hasRef: !!historyRef.current });
      setReplyTarget(undefined);
      if (historyRef.current) {
        historyRef.current.snapToBottom();
      }
    }, []);

    const scrollToMessage = useCallback((messageId: string) => {
      if (!historyRef.current) {
        return false;
      }
      historyRef.current.scrollToMessage(messageId);
      return true;
    }, []);

    useImperativeHandle(ref, () => ({
      scrollHistoryToTarget,
      scrollToMessage,
    }));

    useLayoutEffect(() => {
      trace("ChatSection useLayoutEffect", {
        wantDeferredScroll: scrollToTargetRequestRef.current,
        hasRef: !!historyRef.current,
      });
      if (scrollToTargetRequestRef.current && historyRef.current) {
        scrollToTargetRequestRef.current = false;
        historyRef.current.scrollToTarget();
      }
    });

    // Assigned roles only, on purpose: an @operator mention only notifies
    // assigned operators (queryOperatorsForHunt), so the hunt's default roles
    // don't highlight it either
    const roles = useMemo(
      () => listAssignedRolesForHunt(selfUser, { _id: huntId }),
      [selfUser, huntId],
    );

    // Reactions grouped by the message they belong to, built once here
    // rather than queried by every message
    const reactionsByParent = useMemo(() => {
      const byParent = new Map<string, FilteredChatMessageType[]>();
      chatMessages.forEach((message) => {
        const parentId = message.parentId;
        if (!parentId || !isReaction(message)) {
          return;
        }
        let reactions = byParent.get(parentId);
        if (!reactions) {
          reactions = [];
          byParent.set(parentId, reactions);
        }
        reactions.push(message);
      });
      return byParent;
    }, [chatMessages]);

    const pinnedMessage = useMemo(() => {
      let newest: FilteredChatMessageType | undefined;
      chatMessages.forEach((message) => {
        if (
          message.pinTs &&
          !isReaction(message) &&
          (!newest?.pinTs || message.pinTs > newest.pinTs)
        ) {
          newest = message;
        }
      });
      return newest;
    }, [chatMessages]);
    const pinnedReactions =
      (pinnedMessage && reactionsByParent.get(pinnedMessage._id)) ??
      NO_REACTIONS;

    trace("ChatSection render", { chatDataLoading });

    if (chatDataLoading) {
      return <ChatSectionDiv>loading...</ChatSectionDiv>;
    }

    return (
      <ChatSectionDiv>
        <ChatPeople
          huntId={huntId}
          puzzleId={puzzleId}
          disabled={disabled}
          onHeightChange={scrollHistoryToTarget}
          callState={callState}
          callDispatch={callDispatch}
          joinCall={joinCall}
        />
        <PinnedMessagePane
          messageId={pinnedMessage?._id}
          reactionCount={pinnedReactions.length}
          onHeightChange={scrollHistoryToTarget}
        >
          {pinnedMessage && (
            <ChatHistoryMessage
              key={pinnedMessage._id}
              message={pinnedMessage}
              reactions={pinnedReactions}
              displayNames={displayNames}
              isSystemMessage={pinnedMessage.sender === undefined}
              isHighlighted={false}
              isPinned
              isReplyTarget={false}
              isPulsing={false}
              suppressSender={false}
              selfUserId={selfUser._id}
              roles={roles}
              scrollToMessage={scrollToMessage}
              onReply={onReply}
              imageOnLoad={scrollHistoryToTarget}
            />
          )}
        </PinnedMessagePane>
        <ChatHistory
          ref={historyRef}
          chatMessages={chatMessages}
          reactionsByParent={reactionsByParent}
          displayNames={displayNames}
          selfUser={selfUser}
          roles={roles}
          replyingTo={replyingTo}
          onReply={onReply}
          initialMessageId={initialMessageId}
          onInitialMessageShown={onInitialMessageShown}
        />
        <ChatInput
          ref={inputRef}
          huntId={huntId}
          puzzleId={puzzleId}
          puzzles={puzzles}
          displayNames={displayNames}
          disabled={disabled}
          onHeightChange={scrollHistoryToTarget}
          onMessageSent={onMessageSent}
          replyingTo={replyingTo}
          onCancelReply={cancelReply}
          scrollToMessage={scrollToMessage}
        />
        <HighlightsPanel
          chatMessages={chatMessages}
          displayNames={displayNames}
          selfUserId={selfUser._id}
          roles={roles}
          scrollToMessage={scrollToMessage}
          onHeightChange={scrollHistoryToTarget}
        />
      </ChatSectionDiv>
    );
  },
);

// The desktop layout embeds the document, so the metadata only needs a way to
// copy its link out
const DocumentCopyLinkButton = ({
  document,
  user,
}: {
  document: DocumentType;
  user: Meteor.User;
}) => {
  const { t } = useTranslation();
  const url = googleDocumentUrl(document, user);
  let tooltipText: string;
  switch (document.value.type) {
    case "spreadsheet":
      tooltipText = t(
        "puzzle.document.copySheetLink",
        "Copy link to spreadsheet for sharing or advanced features",
      );
      break;
    case "document":
      tooltipText = t(
        "puzzle.document.copyDocLink",
        "Copy link to document for sharing or advanced features",
      );
      break;
    default:
      return null;
  }
  if (!url) {
    return null;
  }
  return (
    <CopyToClipboardButton
      variant="link"
      size="sm"
      tooltipPlacement="right"
      tooltipText={tooltipText}
      text={url}
    >
      <FontAwesomeIcon icon={faCopy} />
    </CopyToClipboardButton>
  );
};

const PuzzlePageMetadata = ({
  puzzle,
  allPuzzles,
  renderAsLocked,
  bookmarked,
  displayNames,
  document,
  isDesktop,
  selfUser,
  onMinimizeMetadata,
}: {
  puzzle: PuzzleType;
  // The hunt's puzzles, for the related puzzles under each tag
  allPuzzles: PuzzleType[];
  // Takes interest votes instead of guesses
  renderAsLocked: boolean;
  bookmarked: boolean;
  displayNames: Map<string, string>;
  document?: DocumentType;
  isDesktop: boolean;
  selfUser: Meteor.User;
  onMinimizeMetadata: () => void;
}) => {
  const huntId = puzzle.hunt;
  const puzzleId = puzzle._id;
  const idPrefix = useId();

  const hunt = useTracker(() => Hunts.findOne(huntId), [huntId]);
  const hasGuessQueue = hunt?.hasGuessQueue ?? false;
  const canUpdate = useTracker(
    () => userMayWritePuzzlesForHunt(Meteor.user(), hunt),
    [hunt],
  );

  const allTags = useTracker(
    () => Tags.find({ hunt: huntId }).fetch(),
    [huntId],
  );
  const guesses = useTracker(
    () => Guesses.find({ hunt: huntId, puzzle: puzzleId }).fetch(),
    [huntId, puzzleId],
  );

  const {
    interests,
    myInterest,
    interestScore,
    showInterestPopover,
    interestButtonRef,
    toggleInterestPopover,
    hideInterestPopover,
    renderUnlockModal,
    unlockModalRef,
    showUnlockModal,
  } = usePuzzleInterest(puzzleId, renderAsLocked);

  const editModalRef = useRef<React.ComponentRef<typeof PuzzleModalForm>>(null);
  const guessModalRef =
    useRef<React.ComponentRef<typeof PuzzleGuessModal>>(null);
  const answerModalRef =
    useRef<React.ComponentRef<typeof PuzzleAnswerModal>>(null);
  const onCreateTag = useCallback(
    (tagName: string) => {
      addPuzzleTag.call({ puzzleId, tagName });
    },
    [puzzleId],
  );

  const onRemoveTag = useCallback(
    (tagId: string) => {
      removePuzzleTag.call({ puzzleId, tagId });
    },
    [puzzleId],
  );

  const onRemoveAnswer = useCallback(
    (guessId: string) => {
      removePuzzleAnswer.call({ puzzleId, guessId });
    },
    [puzzleId],
  );

  const onEdit = useCallback(
    (state: PuzzleModalFormSubmitPayload, callback: (err?: Error) => void) => {
      const { huntId: _huntId, docType: _docType, ...rest } = state;
      updatePuzzle.call({ puzzleId, ...rest }, callback);
    },
    [puzzleId],
  );

  const showGuessModal = useCallback(() => {
    if (guessModalRef.current) {
      guessModalRef.current.show();
    }
  }, []);

  const showAnswerModal = useCallback(() => {
    if (answerModalRef.current) {
      answerModalRef.current.show();
    }
  }, []);

  const showEditModal = useCallback(() => {
    if (editModalRef.current) {
      editModalRef.current.show();
    }
  }, []);

  const tagsById = indexedById(allTags);
  const maybeTags: (TagType | undefined)[] = puzzle.tags.map((tagId) => {
    return tagsById.get(tagId);
  });
  const tags: TagType[] = maybeTags.filter<TagType>(
    (t): t is TagType => t !== undefined,
  );
  const correctGuesses = guesses.filter((guess) => guess.state === "correct");
  const numGuesses = guesses.length;

  // The tags sit on the action row while they fit beside everything else on
  // one line; otherwise they get a row of their own. Measured from the
  // elements' own widths (tags are laid out at their natural width in both
  // places), so moving them doesn't change the answer.
  const actionRowRef = useRef<HTMLDivElement>(null);
  const tagsRef = useRef<HTMLDivElement>(null);
  const [tagsOnOwnRow, setTagsOnOwnRow] = useState(false);
  const measureTagLayout = useCallback(() => {
    const row = actionRowRef.current;
    const tagsEl = tagsRef.current;
    if (!row || !tagsEl) {
      return;
    }
    const outerWidth = (el: Element) => {
      const style = window.getComputedStyle(el);
      return (
        el.getBoundingClientRect().width +
        Number.parseFloat(style.marginLeft) +
        Number.parseFloat(style.marginRight)
      );
    };
    // The tag list renders with display: contents, so the tags themselves
    // are the holder's grandchildren
    const tagsWidth = [...tagsEl.querySelectorAll(":scope > * > *")].reduce(
      (sum, el) => sum + outerWidth(el),
      0,
    );
    const othersWidth = [...row.children]
      .filter((el) => el !== tagsEl)
      .reduce((sum, el) => sum + outerWidth(el), 0);
    setTagsOnOwnRow(tagsWidth + othersWidth > row.clientWidth);
  }, []);
  useLayoutEffect(() => {
    measureTagLayout();
  }, [measureTagLayout, tags]);
  useEffect(() => {
    const row = actionRowRef.current;
    if (!row) {
      return undefined;
    }
    // The row doesn't wrap and the inline tag holder clips, so a sibling
    // growing (the buttons operator mode adds, the document link once the
    // sheet exists) leaves the row the same size: watch the children too,
    // again once the tags have moved rows and the children have changed.
    const observer = new ResizeObserver(() => measureTagLayout());
    observer.observe(row);
    [...row.children].forEach((child) => observer.observe(child));
    return () => observer.disconnect();
  }, [measureTagLayout, tagsOnOwnRow]);

  const answersElement =
    correctGuesses.length > 0 ? (
      <PuzzleMetadataAnswers>
        {correctGuesses.map((guess) => (
          <PuzzleMetadataAnswer key={`answer-${guess._id}`}>
            <PuzzleAnswer answer={guess.guess} breakable />
            {!hasGuessQueue && (
              <AnswerRemoveButton
                variant="success"
                onClick={() => onRemoveAnswer(guess._id)}
              >
                <FontAwesomeIcon icon={faTimes} />
              </AnswerRemoveButton>
            )}
          </PuzzleMetadataAnswer>
        ))}
      </PuzzleMetadataAnswers>
    ) : null;

  const puzzleLink = puzzle.url ? (
    <PuzzleMetadataExternalLink
      href={puzzle.url}
      target="_blank"
      rel="noreferrer noopener"
    >
      <FontAwesomeIcon icon={faPuzzlePiece} /> <span>Puzzle</span>
    </PuzzleMetadataExternalLink>
  ) : null;

  const imageInsert = isDesktop &&
    document?.provider === "google" &&
    document.value.type === "spreadsheet" && (
      <InsertImage documentId={document._id} />
    );

  const documentLink =
    document && !isDesktop ? (
      <DocumentDisplay document={document} displayMode="link" user={selfUser} />
    ) : null;
  const documentCopyLink =
    document && isDesktop ? (
      <DocumentCopyLinkButton document={document} user={selfUser} />
    ) : null;

  const { t } = useTranslation();

  const editButton = canUpdate ? (
    <Button
      onClick={showEditModal}
      variant="secondary"
      size="sm"
      title={`${t("puzzle.edit.editPuzzle", "Edit puzzle")}...`}
    >
      <FontAwesomeIcon icon={faEdit} />{" "}
      {t("puzzle.edit.editButtonText", "Edit")}
    </Button>
  ) : null;

  let guessButton = null;
  if (renderAsLocked) {
    guessButton = (
      <>
        <Button
          ref={interestButtonRef}
          variant="info"
          size="sm"
          onClick={toggleInterestPopover}
        >
          <FontAwesomeIcon
            icon={myInterest ? faLightbulbSolid : faLightbulbRegular}
          />{" "}
          {myInterest
            ? t("puzzle.interest.update", "Update interest")
            : t("puzzle.interest.register", "I'm interested")}
          {interestScore > 0 && (
            <>
              {" "}
              <Badge bg="light" text="dark">
                {interestScore}
              </Badge>
            </>
          )}
        </Button>
        <PuzzleInterestPopover
          puzzleId={puzzleId}
          lockedSummary={puzzle.lockedSummary}
          myInterest={myInterest}
          target={interestButtonRef.current}
          show={showInterestPopover}
          placement="bottom"
          onHide={hideInterestPopover}
        />
        {canUpdate && (
          <Button variant="danger" size="sm" onClick={showUnlockModal}>
            <FontAwesomeIcon icon={faUnlock} />{" "}
            {t("puzzle.unlock.button", "Unlock")}
          </Button>
        )}
        {renderUnlockModal && (
          <PuzzleUnlockModal
            ref={unlockModalRef}
            puzzle={puzzle}
            interests={interests}
            showOnMount
          />
        )}
      </>
    );
  } else if (puzzle.expectedAnswerCount > 0) {
    guessButton = hasGuessQueue ? (
      <>
        <Button variant="primary" size="sm" onClick={showGuessModal}>
          <FontAwesomeIcon icon={faKey} />
          {` ${t("puzzle.answerOrGuess.guessButtonText", "Guess")} `}
          <Badge bg="light" text="dark">
            {numGuesses}
          </Badge>
        </Button>
        <PuzzleGuessModal
          ref={guessModalRef}
          puzzle={puzzle}
          guesses={guesses}
          displayNames={displayNames}
        />
      </>
    ) : (
      <>
        <Button variant="primary" size="sm" onClick={showAnswerModal}>
          <FontAwesomeIcon icon={faKey} />
          {` ${t("puzzle.answerOrGuess.answerButtonText", "Answer")}`}
        </Button>
        <PuzzleAnswerModal
          ref={answerModalRef}
          puzzle={puzzle}
          guesses={guesses}
        />
      </>
    );
  }

  const minimizeMetadataButton = (
    <OverlayTrigger
      placement="bottom"
      overlay={
        <Tooltip id={`${idPrefix}-hide-puzzle-info`}>
          {t("puzzle.pageView.hideInfo", "Hide puzzle info")}
        </Tooltip>
      }
    >
      <Button onClick={onMinimizeMetadata} size="sm">
        <FontAwesomeIcon icon={faAngleDoubleUp} />
      </Button>
    </OverlayTrigger>
  );

  const tagList = (
    <PuzzleMetadataTags ref={tagsRef} $inline={!tagsOnOwnRow}>
      <StyledTagList
        puzzle={puzzle}
        tags={tags}
        onCreateTag={onCreateTag}
        onRemoveTag={onRemoveTag}
        linkToSearch={false}
        showControls={isDesktop}
        popoverRelated
        allPuzzles={allPuzzles}
        allTags={allTags}
        emptyMessage={t("tags.puzzleNoTagsYet", "No tags yet")}
      />
    </PuzzleMetadataTags>
  );

  return (
    <PuzzleMetadata>
      <PuzzleModalForm
        key={puzzleId}
        ref={editModalRef}
        puzzle={puzzle}
        huntId={huntId}
        tags={allTags}
        onSubmit={onEdit}
      />
      <PuzzleMetadataActionRow ref={actionRowRef}>
        <BookmarkButton
          puzzleId={puzzleId}
          bookmarked={bookmarked}
          variant="link"
          size="sm"
        />
        {puzzleLink}
        {documentLink}
        {documentCopyLink}
        {!tagsOnOwnRow && tagList}
        <PuzzleMetadataButtons>
          {editButton}
          {imageInsert}
          {guessButton}
          {minimizeMetadataButton}
        </PuzzleMetadataButtons>
      </PuzzleMetadataActionRow>
      {renderAsLocked && puzzle.lockedSummary && (
        <PuzzleMetadataRow>
          <strong>{t("puzzle.locked.summaryLabel", "Locked puzzle")}:</strong>{" "}
          {puzzle.lockedSummary}
        </PuzzleMetadataRow>
      )}
      <PuzzleMetadataRow>{answersElement}</PuzzleMetadataRow>
      {tagsOnOwnRow && <PuzzleMetadataRow>{tagList}</PuzzleMetadataRow>}
    </PuzzleMetadata>
  );
};

const GuessTable = styled.div`
  display: grid;
  grid-template-columns:
    [status] 2em
    [answer] auto
    [timestamp] auto
    [submitter] auto
    [direction] 4em
    [confidence] 4em;
  border-bottom: 1px solid #ddd;
  ${mediaBreakpointDown(
    "sm",
    css`
      grid-template-columns: minmax(0, auto) minmax(0, auto);
    `,
  )}
`;

const GuessTableSmallRow = styled.div`
  display: contents;
  background-color: inherit;
  ${mediaBreakpointDown(
    "sm",
    css`
      grid-column: 1 / -1;
      display: flex;
    `,
  )}
`;

const GuessRow = styled.div<{ $state: GuessType["state"] }>`
  display: contents;
  background-color: ${({ $state, theme }) =>
    theme.colors.guess[$state].background};

  &::before {
    content: " ";
    border-top: 1px solid #ddd;
    grid-column: 1 / -1;
  }

  :hover {
    background-color: ${({ $state, theme }) =>
      theme.colors.guess[$state].hoverBackground};
  }
`;

const GuessCell = styled.div`
  display: flex;
  overflow: hidden;
  background-color: inherit;
  align-items: center;
  padding: 0.25rem;
  ${mediaBreakpointDown(
    "sm",
    css`
      outline: 0;
    `,
  )}
`;

const GuessAnswerCell = styled(GuessCell)`
  ${mediaBreakpointDown(
    "sm",
    css`
      flex-grow: 1;
    `,
  )}
`;

const GuessTimestampCell = styled(GuessCell)`
  ${mediaBreakpointDown(
    "sm",
    css`
      flex-grow: 1;
    `,
  )}
`;

const GuessSubmitterCell = styled(GuessCell)`
  ${mediaBreakpointDown(
    "sm",
    css`
      flex-grow: 1;
    `,
  )}
`;

const GuessDirectionCell = styled(GuessCell)`
  ${mediaBreakpointDown(
    "sm",
    css`
      display: none;
    `,
  )}
`;

const GuessConfidenceCell = styled(GuessCell)`
  ${mediaBreakpointDown(
    "sm",
    css`
      display: none;
    `,
  )}
`;

const AdditionalNotesCell = styled(GuessCell)`
  grid-column: 1 / -1;
  overflow-wrap: break-word;
  ${mediaBreakpointDown(
    "sm",
    css`
      order: 1;
    `,
  )}
`;

const StyledCopyToClipboardButton = styled(CopyToClipboardButton)`
  padding: 0;
  vertical-align: baseline;
`;

const MinimizeChatButton = styled.button`
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 10;
  background-color: ${({ theme }) => theme.colors.secondary};
  border: 1px solid ${({ theme }) => theme.colors.text};
  color: ${({ theme }) => theme.colors.text};
  border-left: none;
  border-top-right-radius: 8px;
  border-bottom-right-radius: 8px;
  padding: 8px 4px;
  cursor: pointer;
  height: 40px;
`;

enum PuzzleGuessSubmitState {
  IDLE = "idle",
  FAILED = "failed",
}

type PuzzleGuessModalHandle = {
  show: () => void;
};

// New guesses start out as a confident forward solve, the common case
const DEFAULT_GUESS_DIRECTION = 10;
const DEFAULT_GUESS_CONFIDENCE = 100;

const PuzzleGuessModal = ({
  puzzle,
  guesses,
  displayNames,
  ref,
}: {
  puzzle: PuzzleType;
  guesses: GuessType[];
  displayNames: Map<string, string>;
  ref: React.Ref<PuzzleGuessModalHandle>;
}) => {
  const [guessInput, setGuessInput] = useState("");
  const [directionInput, setDirectionInput] = useState(DEFAULT_GUESS_DIRECTION);
  const [confidenceInput, setConfidenceInput] = useState(
    DEFAULT_GUESS_CONFIDENCE,
  );
  const [confirmingSubmit, setConfirmingSubmit] = useState(false);
  const [confirmationMessage, setConfirmationMessage] = useState("");
  const [submitState, setSubmitState] = useState(PuzzleGuessSubmitState.IDLE);
  const [submitError, setSubmitError] = useState("");
  const formRef = useRef<React.ComponentRef<typeof ModalForm>>(null);

  const { t, i18n } = useTranslation();

  useImperativeHandle(ref, () => ({
    show: () => {
      if (formRef.current) {
        formRef.current.show();
      }
    },
  }));

  const onGuessInputChange: NonNullable<FormControlProps["onChange"]> =
    useCallback((event) => {
      setGuessInput(event.currentTarget.value.toUpperCase());
      setConfirmingSubmit(false);
    }, []);

  const solvedness = useMemo(() => {
    return computeSolvedness(puzzle);
  }, [puzzle]);

  // Operators mark guesses from the notification toasts, which stay hidden
  // while the operator interface is off
  const canUpdateGuesses = useTracker(
    () =>
      userMayUpdateGuessesForHunt(Meteor.user(), Hunts.findOne(puzzle.hunt)),
    [puzzle.hunt],
  );
  const [operatorActionsHidden] = useOperatorActionsHiddenForHunt(puzzle.hunt);

  const onSubmitGuess = useCallback(
    (hideModal: () => void) => {
      const strippedGuess = guessInput.replaceAll(/\s/g, "");
      const repeatGuess = guesses.find((g) => {
        return g.guess.replaceAll(/\s/g, "") === strippedGuess;
      });
      if ((repeatGuess || solvedness !== "unsolved") && !confirmingSubmit) {
        const repeatGuessStr = repeatGuess
          ? t(
              "puzzle.answerOrGuess.repeatAnswer",
              "This answer has already been submitted. ",
            )
          : "";
        const solvednessStr = {
          solved: t(
            "puzzle.answerOrGuess.alreadySolved",
            "This puzzle has already been solved. ",
          ),
          noAnswers: t(
            "puzzle.answerOrGuess.expectNoAnswer",
            "This puzzle does not expect any answers to be submitted. ",
          ),
          unsolved: "",
        }[solvedness];
        const msg = `${solvednessStr} ${repeatGuessStr} ${t("puzzle.answerOrGuess.areYouSure", "Are you sure you want to submit this guess?")}`;
        setConfirmationMessage(msg);
        setConfirmingSubmit(true);
      } else {
        createGuess.call(
          {
            puzzleId: puzzle._id,
            guess: guessInput,
            direction: directionInput,
            confidence: confidenceInput,
          },
          (error) => {
            if (error) {
              setSubmitError(error.message);
              setSubmitState(PuzzleGuessSubmitState.FAILED);
            } else {
              // Reset for the next guess and dismiss the dialog
              setGuessInput("");
              setDirectionInput(DEFAULT_GUESS_DIRECTION);
              setConfidenceInput(DEFAULT_GUESS_CONFIDENCE);
              setSubmitError("");
              setSubmitState(PuzzleGuessSubmitState.IDLE);
              hideModal();
            }
            setConfirmingSubmit(false);
          },
        );
      }
    },
    [
      guesses,
      puzzle._id,
      solvedness,
      guessInput,
      directionInput,
      confidenceInput,
      confirmingSubmit,
      t,
    ],
  );

  const idPrefix = useId();

  const clearError = useCallback(() => {
    setSubmitState(PuzzleGuessSubmitState.IDLE);
  }, []);

  const title = {
    unsolved: t(
      "puzzle.answerOrGuess.guessTitle.submitGuess",
      `Submit answer to {{puzzle}}`,
      {
        puzzle: puzzle.title,
      },
    ),
    solved: t(
      "puzzle.answerOrGuess.guessTitle.history",
      `Guess history for {{puzzle}}`,
      {
        puzzle: puzzle.title,
      },
    ),
    noAnswers: t(
      "puzzle.answerOrGuess.guessTitle.history",
      `Guess history for {{puzzle}}`,
      {
        puzzle: puzzle.title,
      },
    ),
  }[solvedness];

  return (
    <ModalForm
      ref={formRef}
      title={title}
      onSubmit={onSubmitGuess}
      submitLabel={
        confirmingSubmit
          ? t("common.confirmSubmit", "Confirm Submit")
          : t("common.submit", "Submit")
      }
      size="lg"
    >
      <FormGroup as={Row} className="mb-3" controlId={`${idPrefix}-guess`}>
        <FormLabel column xs={3}>
          {t("puzzle.answerOrGuess.guess", "Guess")}
        </FormLabel>
        <Col xs={9}>
          <AnswerFormControl
            type="text"
            id={`${idPrefix}-guess`}
            autoFocus
            autoComplete="off"
            onChange={onGuessInputChange}
            value={guessInput}
            disabled={puzzle.deleted}
          />
        </Col>
      </FormGroup>

      <FormGroup as={Row} className="mb-3">
        <FormLabel column xs={3} id={`${idPrefix}-guess-direction-label`}>
          {t("puzzle.answerOrGuess.direction", "Solve direction")}:
        </FormLabel>
        <Col xs={9}>
          <ToggleButtonGroup
            type="radio"
            name={`${idPrefix}-guess-direction`}
            aria-labelledby={`${idPrefix}-guess-direction-label`}
            value={directionInput}
            onChange={setDirectionInput}
          >
            {GUESS_DIRECTION_LEVELS.map(({ level, value, toggle }) => (
              <ToggleButton
                key={level}
                id={`${idPrefix}-guess-direction-${level}`}
                variant={toggle.variant}
                value={value}
                disabled={puzzle.deleted}
              >
                {t(toggle.key, toggle.label)}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <FormText>
            {t(
              "puzzle.answerOrGuess.directionOptionsHelp",
              "Select the direction of your solve.",
            )}
          </FormText>
        </Col>
      </FormGroup>

      <FormGroup as={Row} className="mb-3">
        <FormLabel column xs={3} id={`${idPrefix}-guess-confidence-label`}>
          {t("puzzle.answerOrGuess.confidence", "Confidence")}
        </FormLabel>
        <Col xs={9}>
          <ToggleButtonGroup
            type="radio"
            name={`${idPrefix}-guess-confidence`}
            aria-labelledby={`${idPrefix}-guess-confidence-label`}
            value={confidenceInput}
            onChange={setConfidenceInput}
          >
            {GUESS_CONFIDENCE_LEVELS.map(({ level, value, toggle }) => (
              <ToggleButton
                key={level}
                id={`${idPrefix}-guess-confidence-${level}`}
                variant={toggle.variant}
                value={value}
                disabled={puzzle.deleted}
              >
                {t(toggle.key, toggle.label)}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <FormText>
            {t(
              "puzzle.answerOrGuess.confidenceOptionsHelp",
              "Tell us how confident you are about your guess.",
            )}
          </FormText>
        </Col>
      </FormGroup>

      {guesses.length === 0 ? (
        <div>
          {t("puzzle.answerOrGuess.noGuesses", "No previous submissions.")}{" "}
        </div>
      ) : (
        <>
          <div>
            {t(
              "puzzle.answerOrGuess.previousSubmissions",
              "Previous submissions",
            )}
            :
          </div>
          <GuessTable>
            {sortedBy(guesses, (g) => g.createdAt)
              .toReversed()
              .map((guess) => {
                return (
                  <GuessRow $state={guess.state} key={guess._id}>
                    <GuessTableSmallRow>
                      <GuessCell>
                        <GuessState state={guess.state} short />
                      </GuessCell>
                      <GuessAnswerCell>
                        <StyledCopyToClipboardButton
                          variant="link"
                          aria-label="Copy"
                          text={guess.guess}
                        >
                          <FontAwesomeIcon icon={faCopy} />
                        </StyledCopyToClipboardButton>
                        <PuzzleAnswer answer={guess.guess} breakable indented />
                      </GuessAnswerCell>
                    </GuessTableSmallRow>
                    <GuessTimestampCell>
                      {calendarTimeFormat(guess.createdAt, t, i18n.language)}
                    </GuessTimestampCell>
                    <GuessSubmitterCell>
                      <Breakable>
                        {displayNames.get(guess.createdBy) ?? "???"}
                      </Breakable>
                    </GuessSubmitterCell>
                    <GuessDirectionCell>
                      <GuessDirectionBadge value={guess.direction} />
                    </GuessDirectionCell>
                    <GuessConfidenceCell>
                      <GuessConfidenceBadge value={guess.confidence} />
                    </GuessConfidenceCell>
                    <GuessTableSmallRow>
                      {guess.additionalNotes && (
                        <Markdown
                          as={AdditionalNotesCell}
                          text={guess.additionalNotes}
                        />
                      )}
                    </GuessTableSmallRow>
                  </GuessRow>
                );
              })}
          </GuessTable>
          {canUpdateGuesses && (
            <Alert variant="info" className="mt-3">
              {operatorActionsHidden
                ? t(
                    "puzzle.answerOrGuess.operatorHint.switchToDeputy",
                    'To mark answers correct or incorrect, use the popup alerts. To see alerts, turn on Deputy View: open the profile menu in the top-right, and choose "Switch to Deputy".',
                  )
                : t(
                    "puzzle.answerOrGuess.operatorHint.reload",
                    "To mark answers correct or incorrect, use the popup alerts. If you've dismissed them, reload the page.",
                  )}
            </Alert>
          )}
        </>
      )}
      {confirmingSubmit ? (
        <Alert variant="warning">{confirmationMessage}</Alert>
      ) : null}
      {submitState === PuzzleGuessSubmitState.FAILED ? (
        <Alert variant="danger" dismissible onClose={clearError}>
          {submitError}
        </Alert>
      ) : null}
    </ModalForm>
  );
};

enum PuzzleAnswerSubmitState {
  IDLE = "idle",
  SUBMITTING = "submitting",
  SUCCESS = "success",
  FAILED = "failed",
}

type PuzzleAnswerModalHandle = {
  show: () => void;
};

const PuzzleAnswerModal = ({
  puzzle,
  guesses,
  ref,
}: {
  puzzle: PuzzleType;
  guesses: GuessType[];
  ref: React.Ref<PuzzleAnswerModalHandle>;
}) => {
  const [answer, setAnswer] = useState("");
  const [confirmingSubmit, setConfirmingSubmit] = useState(false);
  const [confirmationMessage, setConfirmationMessage] = useState("");
  const [submitState, setSubmitState] = useState(PuzzleAnswerSubmitState.IDLE);
  const [submitError, setSubmitError] = useState("");

  const formRef = useRef<ModalFormHandle>(null);

  const show = useCallback(() => {
    if (formRef.current) {
      formRef.current.show();
    }
  }, []);

  useImperativeHandle(ref, () => ({
    show,
  }));

  const hide = useCallback(() => {
    if (formRef.current) {
      formRef.current.hide();
    }
  }, []);

  const onAnswerChange: NonNullable<FormControlProps["onChange"]> = useCallback(
    (e) => {
      setAnswer(e.currentTarget.value.toUpperCase());
      setConfirmingSubmit(false);
    },
    [],
  );

  const onDismissError = useCallback(() => {
    setSubmitState(PuzzleAnswerSubmitState.IDLE);
    setSubmitError("");
  }, []);

  const solvedness = useMemo(() => {
    return computeSolvedness(puzzle);
  }, [puzzle]);

  const { t } = useTranslation("PuzzlePage");

  const onSubmit = useCallback(() => {
    const strippedAnswer = answer.replaceAll(/\s/g, "");
    const repeatAnswer = guesses.find((g) => {
      return (
        g.state === "correct" &&
        g.guess.replaceAll(/\s/g, "") === strippedAnswer
      );
    });
    if ((repeatAnswer || solvedness !== "unsolved") && !confirmingSubmit) {
      const repeatAnswerStr = repeatAnswer
        ? t(
            "puzzle.answerOrGuess.repeatAnswer",
            "This answer has already been submitted. ",
          )
        : "";
      const solvednessStr = {
        solved: t(
          "puzzle.answerOrGuess.alreadySolved",
          "This puzzle has already been solved. ",
        ),
        noAnswers: t(
          "puzzle.answerOrGuess.expectNoAnswer",
          "This puzzle does not expect any answers to be submitted. ",
        ),
        unsolved: "",
      }[solvedness];
      const msg = `${solvednessStr} ${repeatAnswerStr} ${t("puzzle.answerOrGuess.areYouSure", "Are you sure you want to submit this answer?")}`;
      setConfirmationMessage(msg);
      setConfirmingSubmit(true);
      return;
    }
    setSubmitState(PuzzleAnswerSubmitState.SUBMITTING);
    setSubmitError("");
    addPuzzleAnswer.call(
      {
        puzzleId: puzzle._id,
        answer,
      },
      (error) => {
        if (error) {
          setSubmitError(error.message);
          setSubmitState(PuzzleAnswerSubmitState.FAILED);
        } else {
          setAnswer("");
          setSubmitState(PuzzleAnswerSubmitState.IDLE);
          hide();
        }
        setConfirmingSubmit(false);
      },
    );
  }, [puzzle._id, confirmingSubmit, guesses, solvedness, answer, hide, t]);

  const idPrefix = useId();

  return (
    <ModalForm
      ref={formRef}
      title={t(
        "puzzle.answerOrGuess.answerTitle",
        "Submit answer to {{puzzleTitle}}",
        { puzzleTitle: puzzle.title },
      )}
      onSubmit={onSubmit}
      submitLabel={
        confirmingSubmit
          ? t("common.confirmSubmit", "Confirm Submit")
          : t("common.submit", "Submit")
      }
    >
      <FormGroup as={Row} className="mb-3" controlId={`${idPrefix}-answer`}>
        <FormLabel column xs={3}>
          {t("puzzle.answerOrGuess.answer", "Answer")}
        </FormLabel>
        <Col xs={9}>
          <AnswerFormControl
            type="text"
            id={`${idPrefix}-answer`}
            autoFocus
            autoComplete="off"
            onChange={onAnswerChange}
            value={answer}
          />
        </Col>
      </FormGroup>

      {confirmingSubmit ? (
        <Alert variant="warning">{confirmationMessage}</Alert>
      ) : null}
      {submitState === PuzzleAnswerSubmitState.FAILED ? (
        <Alert variant="danger" dismissible onClose={onDismissError}>
          {submitError ||
            "Something went wrong. Try again, or contact an admin?"}
        </Alert>
      ) : undefined}
    </ModalForm>
  );
};

const PuzzleDocumentDiv = styled.div`
  width: 100%;
  height: 100%;
  flex: auto;
  position: relative;
`;

const PuzzlePageMultiplayerDocument = React.memo(
  ({
    document,
    selfUser,
  }: {
    document?: DocumentType;
    selfUser: Meteor.User;
  }) => {
    let inner = (
      <DocumentMessage>
        Attempting to load collaborative document...
      </DocumentMessage>
    );
    if (document) {
      inner = (
        <DocumentDisplay
          key={document._id}
          document={document}
          displayMode="embed"
          user={selfUser}
        />
      );
    }

    return <PuzzleDocumentDiv>{inner}</PuzzleDocumentDiv>;
  },
);

const PuzzleDeletedModal = ({
  puzzleId,
  huntId,
  replacedBy,
}: {
  puzzleId: string;
  huntId: string;
  replacedBy?: string;
}) => {
  const canUpdate = useTracker(
    () => userMayWritePuzzlesForHunt(Meteor.user(), Hunts.findOne(huntId)),
    [huntId],
  );

  const replacement = useTracker(
    () => Puzzles.findOneAllowingDeleted(replacedBy),
    [replacedBy],
  );

  const [show, setShow] = useState(true);
  const hide = useCallback(() => setShow(false), []);

  const undelete = useCallback(() => {
    undestroyPuzzle.call({ puzzleId });
    hide();
  }, [puzzleId, hide]);

  const { t } = useTranslation();

  const modal = (
    <Modal show={show} onHide={hide} backdrop="static">
      <Modal.Header closeButton>
        <Modal.Title>
          {t(
            "puzzle.deleted.modalTitle",
            "This Jolly Roger entry has been removed",
          )}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>
          {t(
            "puzzle.deleted.body1",
            `An operator has deleted this puzzle from Jolly Roger. You can
            still view it to extract information, but you won't be able to
            edit the shared document or send new chat messages going forward.`,
          )}
        </p>
        <p>
          {t(
            "puzzle.deleted.body2",
            `We want to make sure this page doesn&apos;t distract folks on the
            team going forward, so there are no links back to this page. If you
            need to save any information, make sure to hold onto the URL until
            you're done.`,
          )}
        </p>
        {replacedBy && (
          <p>
            This puzzle has been replaced by{" "}
            <Link to={`/hunts/${huntId}/puzzles/${replacedBy}`}>
              {replacement?.title ?? "Another puzzle"}
            </Link>
            .
          </p>
        )}
        {canUpdate && (
          <>
            <p>
              {t(
                "puzzle.deleted.undeleteHelp",
                "As an operator, you can un-delete this puzzle:",
              )}
            </p>
            <Button variant="primary" onClick={undelete}>
              {t("puzzle.deleted.undelete", "Undelete")}
            </Button>
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={hide}>
          {t("common.close", "Close")}
        </Button>
      </Modal.Footer>
    </Modal>
  );

  return createPortal(modal, document.body);
};

const NarrowPaneToggle = styled.div`
  display: flex;
  justify-content: center;
  padding: 4px;
`;

const NarrowPanes = styled.div`
  flex: 1 1 auto;
  min-height: 0;
  position: relative;
`;

// Chat stays mounted (and laid out, which its scrolling relies on) while
// hidden, so a call keeps playing and an unsent message survives switching
// panes.
const NarrowPane = styled.div<{ $hidden?: boolean }>`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  visibility: ${({ $hidden }) => ($hidden ? "hidden" : "visible")};
  z-index: ${({ $hidden }) => ($hidden ? -1 : "auto")};
`;

type PuzzlePageProps = {
  // The whiteboard reuses this page's chat and call around its own canvas, on
  // its hidden puzzle: content replaces the puzzle's document and metadata.
  puzzleIdOverride?: string;
  content?: React.ReactNode;
  // A new value brings the content back into view on a narrow screen (a link
  // to a whiteboard comment).
  showContentFor?: string;
};

const PuzzlePage = React.memo((props: PuzzlePageProps) => {
  const { puzzleIdOverride, content, showContentFor } = props;
  const puzzlePageDivRef = useRef<HTMLDivElement | null>(null);
  const chatSectionRef = useRef<ChatSectionHandle | null>(null);
  // One chat width is kept across puzzles
  const [persistedSidebarWidth, setPersistedSidebarWidth] =
    usePersistedSidebarWidth(DefaultSidebarWidth);
  const [sidebarWidth, setSidebarWidth] = useState(persistedSidebarWidth);
  const [isChatMinimized, setIsChatMinimized] = useState(false);
  const [isMetadataMinimized, setIsMetadataMinimized] = useState(false);
  const [isDesktop, setIsDesktop] = useState(
    window.innerWidth >= MinimumDesktopWidth,
  );
  const [narrowPane, setNarrowPane] = useState<"content" | "chat">("content");
  useEffect(() => {
    if (showContentFor) setNarrowPane("content");
  }, [showContentFor]);
  const outerBoardFocus = useContext(BoardFocusContext);
  // Showing a comment from chat on a narrow screen switches to the board.
  const boardFocus = useMemo<BoardFocus | undefined>(
    () =>
      outerBoardFocus && {
        focusComment: (threadId) => {
          setNarrowPane("content");
          outerBoardFocus.focusComment(threadId);
        },
      },
    [outerBoardFocus],
  );

  const huntId = useParams<"huntId">().huntId!;
  const routePuzzleId = useParams<"puzzleId">().puzzleId;
  const puzzleId = puzzleIdOverride ?? routePuzzleId!;
  const idPrefix = useId();
  const location = useLocation();
  // Chat notifications link straight to the message that dinged
  const messageIdFromHash = /^#msg=(.+)$/.exec(location.hash)?.[1];

  // Add the current user to the collection of people viewing this puzzle,
  // noting whether the tab is actually visible (re-subscribing when that
  // changes, which is what the viewer list's status dots go on).
  const subscribersTopic = `puzzle:${puzzleId}`;
  const visible = useDocumentVisible();
  useSubscribe("subscribers.inc", subscribersTopic, {
    puzzle: puzzleId,
    hunt: huntId,
    visible,
  });

  // Get the _list_ of subscribers to this puzzle and the _count_ of subscribers
  // for all puzzles (it's OK if the latter trickles in)
  const subscribersLoading = useSubscribe(
    "subscribers.fetch",
    subscribersTopic,
  );
  useSubscribe("subscribers.counts", { hunt: huntId });

  const displayNamesLoading = useSubscribeDisplayNames(huntId);

  const puzzleLoading = useTypedSubscribe(puzzleForPuzzlePage, {
    puzzleId,
    huntId,
  });

  const chatMessagesLoading = useTypedSubscribe(chatMessagesForPuzzle, {
    puzzleId,
    huntId,
  });

  // There are some model dependencies that we have to be careful about:
  //
  // * We show the displayname of the person who submitted a guess, so guesses
  //   depends on display names
  // * Chat messages show the displayname of the sender, so chatmessages depends
  //   on display names, and we need to know if the puzzle has been deleted to
  //   block new messages
  // * Puzzle metadata needs puzzles, tags, guesses, documents, and display
  //   names.
  //
  // We can render some things on incomplete data, but most of them really need
  // full data:
  // * Chat can be rendered with chat messages and display names and whether we
  //   should disable chat/voice because the puzzle is deleted (but we can
  //   assume it's deleted until the puzzle loads)
  // * Puzzle metadata needs puzzles, tags, documents, guesses, and display
  //   names
  const puzzleDataLoading =
    puzzleLoading() || subscribersLoading() || displayNamesLoading();
  const chatDataLoading = chatMessagesLoading() || displayNamesLoading();

  const displayNames = useTracker(
    () =>
      puzzleDataLoading && chatDataLoading
        ? new Map<string, string>()
        : indexedDisplayNames(),
    [puzzleDataLoading, chatDataLoading],
  );

  const chatMessages: FilteredChatMessageType[] = useTracker(() => {
    return chatDataLoading
      ? []
      : ChatMessages.find(
          { puzzle: puzzleId },
          { sort: { timestamp: 1 } },
        ).fetch();
  }, [puzzleId, chatDataLoading]);

  // The hunt's puzzles (from the puzzle page publication), for the editor's
  // !-completion and for rendering puzzle links in messages
  const puzzles = useTracker(
    () =>
      puzzleDataLoading
        ? []
        : Puzzles.find({ hunt: huntId, kind: { $ne: "whiteboard" } }).fetch(),
    [puzzleDataLoading, huntId],
  );
  const puzzleTitles = useMemo(
    () => new Map(puzzles.map((p) => [p._id, p.title])),
    [puzzles],
  );

  // Sort by created at so that the "first" document always has consistent meaning
  const document = useTracker(
    () =>
      puzzleDataLoading
        ? undefined
        : Documents.findOne({ puzzle: puzzleId }, { sort: { createdAt: 1 } }),
    [puzzleDataLoading, puzzleId],
  );

  const activePuzzle = useTracker(
    () => Puzzles.findOneAllowingDeleted(puzzleId),
    [puzzleId],
  );
  const bookmarked = useTracker(
    () => !!Bookmarks.findOne({ puzzle: puzzleId, user: Meteor.userId()! }),
    [puzzleId],
  );

  // While locked (and the hunt allows locked puzzles) the puzzle takes
  // interest votes instead of guesses
  const allowUnlockablePuzzles = useTracker(
    () => Hunts.findOne(huntId)?.allowUnlockablePuzzles ?? false,
    [huntId],
  );
  const renderAsLocked =
    (activePuzzle?.locked ?? false) && allowUnlockablePuzzles;
  // The interest in it; fine for it to trickle in
  useTypedSubscribe(renderAsLocked ? puzzleInterestsForHunt : undefined, {
    huntId,
    puzzleId,
  });

  const selfUser = useTracker(() => Meteor.user()!, []);

  const { t } = useTranslation();

  const puzzleTitle = activePuzzle
    ? `${activePuzzle.title}${activePuzzle.deleted ? ` (${t("puzzle.errorStatus.deleted", "deleted")})` : ""}`
    : `(${t("puzzle.errorStatus.noSuchPuzzle", "no such puzzle")})`;
  const title = puzzleDataLoading ? "loading..." : puzzleTitle;
  const isWhiteboard = isWhiteboardPuzzle(activePuzzle);
  useBreadcrumb({
    title,
    path: isWhiteboard
      ? `/hunts/${huntId}/whiteboard`
      : `/hunts/${huntId}/puzzles/${puzzleId}`,
  });

  const documentTitle = `${title} :: Jolly Roger`;
  useDocumentTitle(documentTitle);

  const {
    state: callState,
    dispatch,
    joinCall,
  } = useCallState({ huntId, puzzleId, tabId });

  const onResize = useCallback(() => {
    setIsDesktop(window.innerWidth >= MinimumDesktopWidth);
    trace("PuzzlePage onResize", { hasRef: !!chatSectionRef.current });
    if (chatSectionRef.current) {
      chatSectionRef.current.scrollHistoryToTarget();
    }
  }, []);

  // Messages that arrive while the chat is minimised show as ticker toasts
  // and count on the restore button until it is restored or they are
  // dismissed. The page is reused when the route changes puzzle in place, so
  // each is kept with its puzzle and only shown on that one.
  const [tickerQueue, setTickerQueue] = useState<TickerToastType[]>([]);
  const [messagesWhileMinimized, setMessagesWhileMinimized] = useState<
    { puzzleId: string; id: string }[]
  >([]);
  const tickerToasts = useMemo(
    () => tickerQueue.filter((m) => m.puzzleId === puzzleId),
    [tickerQueue, puzzleId],
  );
  const missedMessages = useMemo(
    () => messagesWhileMinimized.filter((m) => m.puzzleId === puzzleId),
    [messagesWhileMinimized, puzzleId],
  );
  const [isTickerHovered, setIsTickerHovered] = useState(false);
  const tickerHoverTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const tickerChannel = useRef<BroadcastChannel>(undefined);
  const lastSeenMessageTs = useRef(0);
  // The puzzle that timestamp belongs to
  const lastSeenPuzzleId = useRef(puzzleId);
  // A message for the chat history to land on when it next mounts, rather
  // than the bottom: one a ticker toast or a #msg= link brings the chat back
  // for, or a link followed before the history is showing. The history says
  // once it has.
  const [pendingScrollTo, setPendingScrollTo] = useState<string>();
  const clearPendingScrollTo = useCallback(
    () => setPendingScrollTo(undefined),
    [],
  );

  useEffect(() => {
    const channel = new BroadcastChannel(`puzzle_ticker_${puzzleId}`);
    channel.addEventListener("message", (event: MessageEvent) => {
      const message: unknown = event.data;
      if (!isTickerSyncMessage(message)) {
        return;
      }
      switch (message.type) {
        case "dismiss":
          setTickerQueue((prev) => prev.filter((m) => m.id !== message.id));
          if (!message.auto) {
            setMessagesWhileMinimized((prev) =>
              prev.filter((m) => m.id !== message.id),
            );
          }
          break;
        case "clear":
          setTickerQueue([]);
          setMessagesWhileMinimized([]);
          break;
        default:
          message satisfies never;
      }
    });
    tickerChannel.current = channel;
    return () => {
      channel.close();
      tickerChannel.current = undefined;
    };
  }, [puzzleId]);

  const broadcastTicker = useCallback((message: TickerSyncMessage) => {
    tickerChannel.current?.postMessage(message);
  }, []);

  const clearTicker = useCallback(() => {
    setTickerQueue([]);
    setMessagesWhileMinimized([]);
    setIsTickerHovered(false);
    broadcastTicker({ type: "clear" });
  }, [broadcastTicker]);

  const minimizeChat = useCallback(() => {
    setIsChatMinimized(true);
  }, []);

  const restoreChatToMessage = useCallback(
    (messageId?: string) => {
      setPendingScrollTo(messageId);
      setIsChatMinimized(false);
      clearTicker();
    },
    [clearTicker],
  );

  const restoreChat = useCallback(
    () => restoreChatToMessage(),
    [restoreChatToMessage],
  );

  useEffect(() => {
    if (chatDataLoading) {
      // chatMessages is empty until then, which is not the same as nothing
      // having been seen
      return;
    }
    const newest = chatMessages.at(-1)?.timestamp.getTime() ?? 0;
    if (lastSeenPuzzleId.current !== puzzleId) {
      // Another puzzle's history is not news
      lastSeenPuzzleId.current = puzzleId;
      lastSeenMessageTs.current = newest;
      setIsTickerHovered(false);
      return;
    }
    if (!isChatMinimized) {
      lastSeenMessageTs.current = newest;
      return;
    }
    const lastSeen = lastSeenMessageTs.current;
    lastSeenMessageTs.current = newest;
    const toasts: TickerToastType[] = [];
    for (const message of chatMessages) {
      if (
        message.sender === undefined ||
        message.timestamp.getTime() <= lastSeen ||
        isReaction(message)
      ) {
        continue;
      }
      const text = chatMessagePlainText(
        message.content,
        displayNames,
        puzzleTitles,
      );
      toasts.push({
        puzzleId,
        id: message._id,
        text,
        sender: displayNames.get(message.sender) ?? "???",
        duration: tickerDuration(text),
      });
    }
    if (toasts.length === 0) {
      return;
    }
    setTickerQueue((prev) => [...prev, ...toasts]);
    setMessagesWhileMinimized((prev) => [
      ...prev,
      ...toasts.map((toast) => ({ puzzleId, id: toast.id })),
    ]);
  }, [
    chatMessages,
    chatDataLoading,
    puzzleId,
    isChatMinimized,
    displayNames,
    puzzleTitles,
  ]);

  const dismissTickerMessage = useCallback(
    (id: string, auto: boolean) => {
      setTickerQueue((prev) => prev.filter((m) => m.id !== id));
      if (!auto) {
        // Dismissed by hand counts as read
        setMessagesWhileMinimized((prev) => prev.filter((m) => m.id !== id));
      }
      broadcastTicker({ type: "dismiss", id, auto });
    },
    [broadcastTicker],
  );

  const onTickerMouseEnter = useCallback(() => {
    clearTimeout(tickerHoverTimeout.current);
    setIsTickerHovered(true);
  }, []);
  const onTickerMouseLeave = useCallback(() => {
    // A short grace period before the countdown resumes
    clearTimeout(tickerHoverTimeout.current);
    tickerHoverTimeout.current = setTimeout(
      () => setIsTickerHovered(false),
      500,
    );
  }, []);
  useEffect(() => () => clearTimeout(tickerHoverTimeout.current), []);

  useEffect(() => {
    // There's no point hiding the chat scrollback at mobile widths; we don't
    // embed the sheet at that size, so we'd just get a blank white area.
    if (!isDesktop) {
      setIsChatMinimized(false);
    }
  }, [isDesktop]);

  // Each link is followed once: a new location.key is a new one, even to the
  // same message, but minimising the chat afterwards isn't
  const followedLink = useRef<string>(undefined);
  useEffect(() => {
    const link = `${location.key}#msg=${messageIdFromHash}`;
    if (!messageIdFromHash || followedLink.current === link) {
      return;
    }
    followedLink.current = link;
    if (isChatMinimized) {
      restoreChatToMessage(messageIdFromHash);
    } else if (!chatSectionRef.current?.scrollToMessage(messageIdFromHash)) {
      // Still loading, as on arriving by the link
      setPendingScrollTo(messageIdFromHash);
    }
  }, [messageIdFromHash, location.key, isChatMinimized, restoreChatToMessage]);

  const onChangeSideBarSize = useCallback(
    (newSize: number) => {
      // Why only when !isChatMinimized?
      // We'll still get sidebar size change events from SplitPaneMinus when the
      // window size changes. Ignore them, lest we commit the new sidebar size
      // of 0.
      if (!isChatMinimized) {
        setSidebarWidth(newSize);
        trace("PuzzlePage onChangeSideBarSize", {
          hasRef: !!chatSectionRef.current,
          newSize,
        });
        if (chatSectionRef.current) {
          chatSectionRef.current.scrollHistoryToTarget();
        }
      }
    },
    [isChatMinimized],
  );

  // Remembered only once a drag ends: the window-resize clamp reports sizes
  // too, and a briefly narrow window shouldn't shrink the chat for good
  const onCommitSideBarSize = useCallback(
    (newSize: number) => {
      if (!isChatMinimized) {
        setPersistedSidebarWidth(newSize);
      }
    },
    [isChatMinimized, setPersistedSidebarWidth],
  );

  const toggleMetadata = useCallback(() => {
    setIsMetadataMinimized((prev) => !prev);
  }, []);

  const answersCount = activePuzzle?.answers?.length ?? 0;
  useEffect(
    () => {
      setIsMetadataMinimized(false);
    },
    // We want to force the metadata section to be visible when the set of answers
    // change so solvers don't miss that it was solved, so use answersCount as a
    // trigger for the effect even though the effect doesn't actually use it.
    [answersCount],
  );

  useLayoutEffect(
    () => {
      trace("PuzzlePage useLayoutEffect", { hasRef: !!chatSectionRef.current });
      if (chatSectionRef.current) {
        chatSectionRef.current.scrollHistoryToTarget();
      }
    },
    // Use scrollbarWidth as a trigger for this effect (even though it's not
    // actually used in the effect) so that when the sidebar width changes, we
    // scroll to the target. Likewise isMetadataMinimized: on narrow screens
    // the metadata sits above the chat.
    [sidebarWidth, isMetadataMinimized],
  );

  useEffect(() => {
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, [onResize]);

  useLayoutEffect(() => {
    // Adjust sidebar width based on window size on initial mount
    if (puzzlePageDivRef.current) {
      const clientWidth = puzzlePageDivRef.current.clientWidth;
      setSidebarWidth((sidebarWidth) => {
        return Math.min(sidebarWidth, clientWidth - MinimumDocumentWidth);
      });
    }
  }, []);

  useEffect(() => {
    if (activePuzzle && !activePuzzle.deleted && !isWhiteboard) {
      ensurePuzzleDocument.call({ puzzleId: activePuzzle._id });
    }
  }, [activePuzzle, isWhiteboard]);

  trace("PuzzlePage render", { puzzleDataLoading, chatDataLoading });

  if (puzzleDataLoading) {
    return (
      <FixedLayout ref={puzzlePageDivRef}>
        <span>loading...</span>
      </FixedLayout>
    );
  }
  if (!activePuzzle) {
    return (
      <FixedLayout ref={puzzlePageDivRef}>
        <span>
          {t(
            "puzzle.errorStatus.noSuchPuzzleBody",
            "No puzzle found :( Did you get that URL right?",
          )}
        </span>
      </FixedLayout>
    );
  }
  // The whiteboard's puzzle lives on the whiteboard page.
  if (isWhiteboard && !content) {
    return <Navigate to={`/hunts/${huntId}/whiteboard`} replace />;
  }
  const metadata =
    isMetadataMinimized || content ? null : (
      <PuzzlePageMetadata
        puzzle={activePuzzle}
        allPuzzles={puzzles}
        renderAsLocked={renderAsLocked}
        bookmarked={bookmarked}
        document={document}
        displayNames={displayNames}
        isDesktop={isDesktop}
        selfUser={selfUser}
        onMinimizeMetadata={toggleMetadata}
      />
    );

  const effectiveSidebarWidth = isChatMinimized ? 0 : sidebarWidth;

  const chat = isChatMinimized ? null : (
    <BoardFocusContext value={boardFocus}>
      <ChatSection
        ref={chatSectionRef}
        chatDataLoading={chatDataLoading}
        disabled={
          activePuzzle.deleted ?? true /* disable while still loading */
        }
        displayNames={displayNames}
        chatMessages={chatMessages}
        puzzles={puzzles}
        huntId={huntId}
        puzzleId={puzzleId}
        callState={callState}
        callDispatch={dispatch}
        joinCall={joinCall}
        selfUser={selfUser}
        initialMessageId={pendingScrollTo}
        onInitialMessageShown={clearPendingScrollTo}
      />
    </BoardFocusContext>
  );
  const deletedModal = activePuzzle.deleted && (
    <PuzzleDeletedModal
      puzzleId={puzzleId}
      huntId={huntId}
      replacedBy={activePuzzle.replacedBy}
    />
  );

  let debugPane: React.ReactNode | undefined;
  if (DEBUG_SHOW_CALL_STATE) {
    (window as any).globalCallState = callState;
    const peerStreamsForRendering = new Map();
    callState.peerStreams.forEach((stream, peerId) => {
      peerStreamsForRendering.set(
        peerId,
        `active: ${stream.active}, tracks: ${stream.getTracks().length}`,
      );
    });
    const callStateForRendering = {
      ...callState,
      peerStreams: peerStreamsForRendering,
      audioState: {
        mediaSource: callState.audioState?.mediaSource ? "present" : "absent",
        audioContext: callState.audioState?.audioContext ? "present" : "absent",
      },
      device: callState.device ? "present" : "absent",
      transports: {
        recv: callState.transports.recv ? "present" : "absent",
        send: callState.transports.send ? "present" : "absent",
      },
      router: callState.router ? "present" : "absent",
    };
    debugPane = (
      <pre
        style={{
          position: "absolute",
          right: "0",
          bottom: "0",
          fontSize: "12px",
          backgroundColor: "rgba(255,255,255,.7)",
        }}
      >
        {JSON.stringify(callStateForRendering, undefined, 2)}
      </pre>
    );
  }

  const showMetadataButton =
    isMetadataMinimized && !content ? (
      <OverlayTrigger
        placement="bottom-end"
        overlay={
          <Tooltip id={`${idPrefix}-show-puzzle-info`}>
            {t("puzzle.pageView.showInfo", "Show puzzle info")}
          </Tooltip>
        }
      >
        <PuzzleMetadataFloatingButton
          variant="secondary"
          size="sm"
          onClick={toggleMetadata}
        >
          <FontAwesomeIcon icon={faAngleDoubleDown} />
        </PuzzleMetadataFloatingButton>
      </OverlayTrigger>
    ) : null;

  const ticker =
    isChatMinimized && tickerToasts.length > 0 ? (
      <ChatTicker
        toasts={tickerToasts}
        isHovered={isTickerHovered}
        onMouseEnter={onTickerMouseEnter}
        onMouseLeave={onTickerMouseLeave}
        dismiss={dismissTickerMessage}
        onRestore={restoreChatToMessage}
      />
    ) : null;

  if (isDesktop) {
    return (
      <>
        {deletedModal}
        {ticker}
        <FixedLayout ref={puzzlePageDivRef}>
          {isChatMinimized ? (
            <MinimizedChatInfo
              huntId={huntId}
              puzzleId={puzzleId}
              callState={callState}
              callDispatch={dispatch}
              joinCall={joinCall}
              onRestore={restoreChat}
              missedMessages={missedMessages.length}
            />
          ) : (
            <OverlayTrigger
              placement="right"
              overlay={
                <Tooltip id={`${idPrefix}-hide-chat`}>
                  {t("chat.minimizeChat", "Minimize chat")}
                </Tooltip>
              }
            >
              <MinimizeChatButton
                style={{ left: `${isChatMinimized ? 1 : sidebarWidth + 15}px` }}
                onClick={minimizeChat}
              >
                <FontAwesomeIcon icon={faChevronLeft} />
              </MinimizeChatButton>
            </OverlayTrigger>
          )}
          <SplitPaneMinus
            split="vertical"
            minSize={isChatMinimized ? 0 : MinimumSidebarWidth}
            maxSize={-MinimumDocumentWidth}
            primary="first"
            size={effectiveSidebarWidth}
            onChanged={onChangeSideBarSize}
            onCommitted={onCommitSideBarSize}
            allowResize={!isChatMinimized}
          >
            {chat}
            <PuzzleContent>
              {metadata}
              {showMetadataButton}
              {content ?? (
                <PuzzlePageMultiplayerDocument
                  document={document}
                  selfUser={selfUser}
                />
              )}
              {debugPane}
            </PuzzleContent>
          </SplitPaneMinus>
        </FixedLayout>
      </>
    );
  }

  // Non-desktop (narrow layout)
  if (content) {
    return (
      <FixedLayout $narrow>
        <NarrowPaneToggle>
          <ButtonGroup size="sm">
            <Button
              variant={
                narrowPane === "content" ? "secondary" : "outline-secondary"
              }
              onClick={() => setNarrowPane("content")}
            >
              {t("whiteboard.narrow.board", "Board")}
            </Button>
            <Button
              variant={
                narrowPane === "chat" ? "secondary" : "outline-secondary"
              }
              onClick={() => setNarrowPane("chat")}
            >
              {t("whiteboard.narrow.chat", "Chat")}
            </Button>
          </ButtonGroup>
        </NarrowPaneToggle>
        <NarrowPanes>
          {narrowPane === "content" && <NarrowPane>{content}</NarrowPane>}
          <NarrowPane $hidden={narrowPane !== "chat"}>{chat}</NarrowPane>
        </NarrowPanes>
      </FixedLayout>
    );
  }
  return (
    <>
      {deletedModal}
      <FixedLayout $narrow>
        {metadata}
        {showMetadataButton}
        {chat}
      </FixedLayout>
    </>
  );
});

export default PuzzlePage;
