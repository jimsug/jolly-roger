import { Meteor } from "meteor/meteor";
import { useTracker } from "meteor/react-meteor-data";
import { faXmark } from "@fortawesome/free-solid-svg-icons/faXmark";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Button from "react-bootstrap/Button";
import Modal from "react-bootstrap/Modal";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import chatMessagePlainText from "../../../lib/chatMessagePlainText";
import type {
  ChatMessageCommentAnchorType,
  ChatMessageType,
} from "../../../lib/models/ChatMessages";
import Hunts from "../../../lib/models/Hunts";
import MeteorUsers from "../../../lib/models/MeteorUsers";
import {
  listAssignedRolesForHunt,
  userMayWritePuzzlesForHunt,
} from "../../../lib/permission_stubs";
import type { CommentThread } from "../../../lib/whiteboard/comments";
import deleteWhiteboardComment from "../../../methods/deleteWhiteboardComment";
import sendChatMessage from "../../../methods/sendChatMessage";
import setWhiteboardCommentResolved from "../../../methods/setWhiteboardCommentResolved";
import indexedDisplayNames from "../../indexedDisplayNames";
import Avatar from "../Avatar";
import ChatMessage from "../ChatMessage";
import RelativeTime from "../RelativeTime";
import CommentComposer from "./CommentComposer";

// A dialog that isn't modal, so it sits where it's put rather than where the
// browser puts dialogs.
const Panel = styled.dialog`
  position: static;
  margin: 0;
  padding: 0;
  color: inherit;
  display: flex;
  flex-direction: column;
  width: min(320px, calc(100vw - 32px));
  max-height: 70vh;
  border-radius: 8px;
  background: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.border};
  box-shadow: 0 2px 8px rgb(0 0 0 / 15%);
  font-size: 13px;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const Title = styled.div`
  flex: 1 1 auto;
  min-width: 0;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Messages = styled.div`
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 6px 8px;
`;

const Entry = styled.div`
  display: flex;
  gap: 6px;
  padding: 4px 0;
`;

const EntryBody = styled.div`
  flex: 1 1 auto;
  min-width: 0;
  overflow-wrap: anywhere;
`;

const Meta = styled.div`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 12px;
`;

const Footer = styled.div`
  padding: 6px 8px;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`;

const ResolvedNote = styled.div`
  padding: 4px 8px;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

// A comment thread on the board, or a new comment being written. Messages
// render exactly as they do in chat, and stay in the board's chat too. It's
// a dialog beside the board: when it opens, focus goes to its composer (or
// the panel itself, with nothing to write in, or for a thread opened on a
// touch screen, which would otherwise bring up the keyboard), and Escape
// closes it.
const CommentPanel = ({
  huntId,
  puzzleId,
  thread,
  draft,
  targetLabel,
  canComment,
  offline,
  onClose,
  onDeleted,
  onDraftSent,
  onError,
}: {
  huntId: string;
  puzzleId: string;
  thread?: CommentThread<ChatMessageType>;
  draft?: ChatMessageCommentAnchorType;
  targetLabel: string;
  // Off once the hunt is archived; the edit policy never takes it away.
  canComment: boolean;
  // The connection is down, which takes commenting away until it's back.
  offline: boolean;
  onClose: () => void;
  // Closes the panel once its thread has been deleted.
  onDeleted: () => void;
  onDraftSent: (sentAt: Date) => void;
  // A send, resolve or delete the server refused.
  onError: (error: Meteor.Error) => void;
}) => {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDialogElement>(null);
  // Where focus goes is settled when the panel opens; access changing later
  // (going offline, say) leaves focus wherever the viewer has put it.
  const [focusComposer] = useState(
    () =>
      canComment &&
      (!!draft || !window.matchMedia("(pointer: coarse)").matches),
  );
  const composerFocusPending = useRef(focusComposer);
  useEffect(() => {
    composerFocusPending.current = false;
    if (!focusComposer) panelRef.current?.focus({ preventScroll: true });
  }, [focusComposer]);
  // The composer stays while the connection is down, with Send off, so
  // whatever is being written survives it.
  const [composerShown, setComposerShown] = useState(canComment);
  if (!offline && composerShown !== canComment) setComposerShown(canComment);
  const composerHasText = useRef(false);
  const setComposerHasText = useCallback((hasText: boolean) => {
    composerHasText.current = hasText;
  }, []);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const selfUserId = useTracker(() => Meteor.userId() ?? "", []);
  const displayNames = useTracker(() => indexedDisplayNames(), []);
  const { roles, isOperator } = useTracker(() => {
    const user = Meteor.user();
    const hunt = Hunts.findOne(huntId);
    return {
      // Assigned roles only, on purpose: an @operator mention only notifies
      // assigned operators (queryOperatorsForHunt), so the hunt's default roles
      // don't highlight it either
      roles: listAssignedRolesForHunt(user, { _id: huntId }),
      isOperator: userMayWritePuzzlesForHunt(user, hunt),
    };
  }, [huntId]);
  const discordAccounts = useTracker(
    () =>
      new Map(
        MeteorUsers.find(
          { _id: { $in: thread?.participants ?? [] } },
          { projection: { discordAccount: 1 } },
        ).map((u) => [u._id, u.discordAccount]),
      ),
    [thread?.participants],
  );
  const resolvedBy = useTracker(
    () =>
      thread?.root.comment?.resolvedBy
        ? MeteorUsers.findOne(thread.root.comment.resolvedBy)?.displayName
        : undefined,
    [thread?.root.comment?.resolvedBy],
  );

  const messages = useMemo(
    () => (thread ? [thread.root, ...thread.replies] : []),
    [thread],
  );
  // Authors can take back a comment until someone else replies; operators
  // can always remove one.
  const canDelete =
    !!thread &&
    canComment &&
    (isOperator ||
      (thread.root.sender === selfUserId &&
        thread.replies.every((r) => r.sender === selfUserId)));

  const reportError = useCallback(
    (error?: Meteor.Error) => {
      if (error) onError(error);
    },
    [onError],
  );

  // A refused comment or reply goes back in the composer, and a new comment
  // stays open until the server has it.
  const onSend = useCallback(
    (content: string, onRefused: () => void) => {
      if (draft) {
        const sentAt = new Date();
        sendChatMessage.call(
          {
            puzzleId,
            content,
            comment: { node: draft.node, x: draft.x, y: draft.y },
          },
          (error) => {
            if (error) {
              onError(error);
              onRefused();
            } else if (mounted.current) {
              onDraftSent(sentAt);
            }
          },
        );
        return;
      }
      if (thread) {
        sendChatMessage.call(
          { puzzleId, content, parentId: thread.root._id },
          (error) => {
            if (!error) return;
            onError(error);
            onRefused();
          },
        );
      }
    },
    [draft, thread, puzzleId, onDraftSent, onError],
  );

  const toggleResolved = useCallback(() => {
    if (!thread) return;
    setWhiteboardCommentResolved.call(
      {
        messageId: thread.root._id,
        resolved: !thread.resolved,
      },
      reportError,
    );
  }, [thread, reportError]);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const askToDelete = useCallback(() => setConfirmingDelete(true), []);
  const cancelDelete = useCallback(() => setConfirmingDelete(false), []);
  const remove = useCallback(() => {
    if (!thread) return;
    setConfirmingDelete(false);
    deleteWhiteboardComment.call({ messageId: thread.root._id }, reportError);
    onDeleted();
  }, [thread, onDeleted, reportError]);

  // Escape anywhere in the panel closes it, unless something in it (the
  // composer's suggestions, say) has used it, or it comes from the composer
  // with something written there, which it would throw away. The delete
  // dialog is drawn elsewhere on the page, and has its own Escape.
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDialogElement>) => {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        !(event.target instanceof Node) ||
        !event.currentTarget.contains(event.target)
      ) {
        return;
      }
      if (
        event.target instanceof HTMLElement &&
        event.target.isContentEditable &&
        composerHasText.current
      ) {
        return;
      }
      event.stopPropagation();
      onClose();
    },
    [onClose],
  );

  const title = draft
    ? t("whiteboard.comments.newOn", "New comment on {{target}}", {
        target: targetLabel,
        // React escapes the text and title, so i18next's escaping would only
        // show entities. Goes once both i18n inits stop escaping.
        interpolation: { escapeValue: false },
      })
    : t("whiteboard.comments.on", "Comment on {{target}}", {
        target: targetLabel,
        // React escapes the text and title, so i18next's escaping would only
        // show entities. Goes once both i18n inits stop escaping.
        interpolation: { escapeValue: false },
      });

  return (
    <Panel
      ref={panelRef}
      open
      className="nodrag nowheel nopan"
      aria-label={title}
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      <Header>
        <Title title={title}>{title}</Title>
        {thread && canComment && (
          <Button
            size="sm"
            variant="outline-secondary"
            onClick={toggleResolved}
          >
            {thread.resolved
              ? t("whiteboard.comments.reopen", "Reopen")
              : t("whiteboard.comments.resolve", "Resolve")}
          </Button>
        )}
        {canDelete && (
          <Button size="sm" variant="outline-danger" onClick={askToDelete}>
            {t("whiteboard.comments.delete", "Delete")}
          </Button>
        )}
        <Button
          size="sm"
          variant="link"
          onClick={onClose}
          aria-label={t("common.close", "Close")}
        >
          <FontAwesomeIcon icon={faXmark} />
        </Button>
      </Header>
      {thread?.resolved && (
        <ResolvedNote>
          {resolvedBy
            ? t(
                "whiteboard.comments.resolvedBy",
                "Resolved by {{name}}. Replying reopens it.",
                {
                  name: resolvedBy,
                  // React escapes text, so i18next's escaping would only show
                  // entities. Goes once both i18n inits stop escaping.
                  interpolation: { escapeValue: false },
                },
              )
            : t(
                "whiteboard.comments.resolved",
                "Resolved. Replying reopens it.",
              )}
        </ResolvedNote>
      )}
      {messages.length > 0 && (
        <Messages>
          {messages.map((m) => (
            <Entry key={m._id}>
              <Avatar
                size={20}
                _id={m.sender}
                displayName={m.sender ? displayNames.get(m.sender) : undefined}
                discordAccount={
                  m.sender ? discordAccounts.get(m.sender) : undefined
                }
                rounded
              />
              <EntryBody>
                <Meta>
                  {(m.sender && displayNames.get(m.sender)) ??
                    t("whiteboard.comments.unknownAuthor", "Someone")}{" "}
                  · <RelativeTime date={m.timestamp} minimumUnit="minute" />
                </Meta>
                <ChatMessage
                  message={m.content}
                  displayNames={displayNames}
                  selfUserId={selfUserId}
                  roles={roles}
                />
              </EntryBody>
            </Entry>
          ))}
          {thread && thread.reactions.length > 0 && (
            <Meta>
              {thread.reactions
                .map((r) => chatMessagePlainText(r.content))
                .join(" ")}
            </Meta>
          )}
        </Messages>
      )}
      {composerShown && (
        <Footer>
          <CommentComposer
            huntId={huntId}
            placeholder={
              draft
                ? t("whiteboard.comments.writePlaceholder", "Write a comment")
                : t("whiteboard.comments.replyPlaceholder", "Reply")
            }
            autoFocus={composerFocusPending.current}
            disabled={!canComment}
            onSend={onSend}
            onHasTextChange={setComposerHasText}
          />
        </Footer>
      )}
      <Modal show={confirmingDelete} onHide={cancelDelete}>
        <Modal.Header closeButton>
          <Modal.Title>
            {t("whiteboard.comments.deleteTitle", "Delete comment")}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {t(
            "whiteboard.comments.confirmDelete",
            "Delete this comment and every reply to it? This can't be undone.",
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={cancelDelete}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button variant="danger" onClick={remove}>
            {t("whiteboard.comments.delete", "Delete")}
          </Button>
        </Modal.Footer>
      </Modal>
    </Panel>
  );
};

export default React.memo(CommentPanel);
