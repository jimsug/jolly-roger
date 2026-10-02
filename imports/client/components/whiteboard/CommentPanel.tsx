import { Meteor } from "meteor/meteor";
import { useTracker } from "meteor/react-meteor-data";
import { faXmark } from "@fortawesome/free-solid-svg-icons/faXmark";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import React, { useCallback, useMemo } from "react";
import Button from "react-bootstrap/Button";
import styled from "styled-components";
import type { ChatMessageType } from "../../../lib/models/ChatMessages";
import Hunts from "../../../lib/models/Hunts";
import MeteorUsers from "../../../lib/models/MeteorUsers";
import Puzzles from "../../../lib/models/Puzzles";
import {
  listAllRolesForHunt,
  userMayWritePuzzlesForHunt,
} from "../../../lib/permission_stubs";
import type {
  CommentAnchor,
  CommentThread,
} from "../../../lib/whiteboard/comments";
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
  readOnly,
  onClose,
  onDraftSent,
}: {
  huntId: string;
  puzzleId: string;
  thread?: CommentThread<ChatMessageType>;
  draft?: CommentAnchor;
  targetLabel: string;
  readOnly: boolean;
  onClose: () => void;
  onDraftSent: (sentAt: Date) => void;
}) => {
  const selfUserId = useTracker(() => Meteor.userId() ?? "", []);
  const displayNames = useTracker(() => indexedDisplayNames(), []);
  const puzzleData = useTracker(
    () => new Map(Puzzles.find({ hunt: huntId }).map((p) => [p._id, p])),
    [huntId],
  );
  const { roles, isOperator } = useTracker(() => {
    const user = Meteor.user();
    const hunt = Hunts.findOne(huntId);
    return {
      roles: listAllRolesForHunt(user, { _id: huntId }),
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
    !readOnly &&
    (isOperator ||
      (thread.root.sender === selfUserId &&
        thread.replies.every((r) => r.sender === selfUserId)));

  const onSend = useCallback(
    (content: string) => {
      if (draft) {
        sendChatMessage.call(
          {
            puzzleId,
            content,
            comment: { node: draft.node, x: draft.x, y: draft.y },
          },
          () => {},
        );
        onDraftSent(new Date());
        return;
      }
      if (thread) {
        sendChatMessage.call(
          { puzzleId, content, parentId: thread.root._id },
          () => {},
        );
      }
    },
    [draft, thread, puzzleId, onDraftSent],
  );

  const toggleResolved = useCallback(() => {
    if (!thread) return;
    setWhiteboardCommentResolved.call(
      { messageId: thread.root._id, resolved: !thread.resolved },
      () => {},
    );
  }, [thread]);

  const remove = useCallback(() => {
    if (!thread) return;
    if (!window.confirm("Delete this comment and its replies?")) return;
    deleteWhiteboardComment.call({ messageId: thread.root._id }, () => {});
    onClose();
  }, [thread, onClose]);

  return (
    <Panel className="nodrag nowheel nopan">
      <Header>
        <Title title={targetLabel}>
          {draft ? "New comment" : "Comment"} on {targetLabel}
        </Title>
        {thread && !readOnly && (
          <Button
            size="sm"
            variant="outline-secondary"
            onClick={toggleResolved}
          >
            {thread.resolved ? "Reopen" : "Resolve"}
          </Button>
        )}
        {canDelete && (
          <Button size="sm" variant="outline-danger" onClick={remove}>
            Delete
          </Button>
        )}
        <Button size="sm" variant="link" onClick={onClose} aria-label="Close">
          <FontAwesomeIcon icon={faXmark} />
        </Button>
      </Header>
      {thread?.resolved && (
        <ResolvedNote>
          Resolved{resolvedBy ? ` by ${resolvedBy}` : ""}. Replying reopens it.
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
                  {(m.sender && displayNames.get(m.sender)) ?? "Someone"} ·{" "}
                  <RelativeTime date={m.timestamp} minimumUnit="minute" />
                </Meta>
                <ChatMessage
                  message={m.content}
                  displayNames={displayNames}
                  puzzleData={puzzleData}
                  selfUserId={selfUserId}
                  attachments={m.attachments}
                  roles={roles}
                />
              </EntryBody>
            </Entry>
          ))}
          {thread && thread.reactions.length > 0 && (
            <Meta>
              {thread.reactions
                .map((r) =>
                  r.content.children
                    .map((c) => ("text" in c ? c.text : ""))
                    .join(""),
                )
                .join(" ")}
            </Meta>
          )}
        </Messages>
      )}
      {!readOnly && (
        <Footer>
          <CommentComposer
            huntId={huntId}
            placeholder={draft ? "Write a comment" : "Reply"}
            onSend={onSend}
          />
        </Footer>
      )}
    </Panel>
  );
};

export default React.memo(CommentPanel);
