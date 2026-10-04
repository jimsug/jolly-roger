import { Meteor } from "meteor/meteor";
import { useTracker } from "meteor/react-meteor-data";
import { faXmark } from "@fortawesome/free-solid-svg-icons/faXmark";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import React, { useCallback, useMemo } from "react";
import Button from "react-bootstrap/Button";
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

const Panel = styled.div`
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
// render exactly as they do in chat, and stay in the board's chat too.
const CommentPanel = ({
  huntId,
  puzzleId,
  thread,
  draft,
  targetLabel,
  canComment,
  onClose,
  onDraftSent,
}: {
  huntId: string;
  puzzleId: string;
  thread?: CommentThread<ChatMessageType>;
  draft?: ChatMessageCommentAnchorType;
  targetLabel: string;
  // Off once the hunt is archived; the edit policy never takes it away.
  canComment: boolean;
  onClose: () => void;
  onDraftSent: (sentAt: Date) => void;
}) => {
  const { t } = useTranslation();
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

  const onSend = useCallback(
    (content: string) => {
      if (draft) {
        sendChatMessage.call({
          puzzleId,
          content,
          comment: { node: draft.node, x: draft.x, y: draft.y },
        });
        onDraftSent(new Date());
        return;
      }
      if (thread) {
        sendChatMessage.call({ puzzleId, content, parentId: thread.root._id });
      }
    },
    [draft, thread, puzzleId, onDraftSent],
  );

  const toggleResolved = useCallback(() => {
    if (!thread) return;
    setWhiteboardCommentResolved.call({
      messageId: thread.root._id,
      resolved: !thread.resolved,
    });
  }, [thread]);

  const remove = useCallback(() => {
    if (!thread) return;
    if (
      // oxlint-disable-next-line no-alert -- a plain confirmation is all deleting a thread needs, as on the fork
      !window.confirm(
        t(
          "whiteboard.comments.confirmDelete",
          "Delete this comment and its replies?",
        ),
      )
    ) {
      return;
    }
    deleteWhiteboardComment.call({ messageId: thread.root._id });
    onClose();
  }, [thread, onClose, t]);

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
    <Panel className="nodrag nowheel nopan">
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
          <Button size="sm" variant="outline-danger" onClick={remove}>
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
      {canComment && (
        <Footer>
          <CommentComposer
            huntId={huntId}
            placeholder={
              draft
                ? t("whiteboard.comments.writePlaceholder", "Write a comment")
                : t("whiteboard.comments.replyPlaceholder", "Reply")
            }
            onSend={onSend}
          />
        </Footer>
      )}
    </Panel>
  );
};

export default React.memo(CommentPanel);
