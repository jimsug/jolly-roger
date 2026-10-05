import type { Meteor } from "meteor/meteor";
import { useCallback, useEffect, useRef, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Modal from "react-bootstrap/Modal";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import type { ChatMessageType } from "../../lib/models/ChatMessages";
import deleteChatMessage from "../../methods/deleteChatMessage";
import deleteWhiteboardComment from "../../methods/deleteWhiteboardComment";
import ChatMessage from "./ChatMessage";

const Preview = styled.div`
  border-left: 3px solid ${({ theme }) => theme.colors.border};
  padding: 6px 10px;
  margin-top: 12px;
  font-size: 14px;
  overflow-wrap: break-word;
  max-height: 200px;
  overflow-y: auto;
`;

// Asks before deleting one of the user's own messages. A whiteboard comment
// goes with its whole thread, under the board's rules for comments; anything
// else is left as "Message deleted", with replies to it kept.
const DeleteChatMessageModal = ({
  message,
  displayNames,
  selfUserId,
  roles,
  onHide,
}: {
  // The message to delete; nothing shows without one
  message: Pick<ChatMessageType, "_id" | "content" | "comment"> | undefined;
  displayNames: Map<string, string>;
  selfUserId: string;
  roles: string[];
  onHide: () => void;
}) => {
  const { t } = useTranslation();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string>();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // The message last asked about, still shown while the dialog fades out
  const [shown, setShown] = useState(message);
  if (message && message !== shown) {
    setShown(message);
    setDeleting(false);
    setError(undefined);
  }

  const messageId = message?._id;
  const isComment = !!shown?.comment;
  const confirm = useCallback(() => {
    if (!messageId) return;
    setDeleting(true);
    setError(undefined);
    const done = (err?: Meteor.Error) => {
      if (!mounted.current) return;
      setDeleting(false);
      if (err) {
        setError(err.reason ?? err.message);
      } else {
        onHide();
      }
    };
    if (isComment) {
      deleteWhiteboardComment.call({ messageId }, done);
    } else {
      deleteChatMessage.call({ messageId }, done);
    }
  }, [messageId, isComment, onHide]);

  return (
    <Modal show={!!message} onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>
          {isComment
            ? t("whiteboard.comments.deleteTitle", "Delete comment")
            : t("chat.deleteModal.title", "Delete message")}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {isComment
          ? t(
              "whiteboard.comments.confirmDelete",
              "Delete this comment and every reply to it? This can't be undone.",
            )
          : t(
              "chat.deleteModal.confirm",
              'Delete this message? Everyone will see "Message deleted" in its place, and replies to it stay. This can\'t be undone.',
            )}
        {shown && (
          <Preview>
            <ChatMessage
              message={shown.content}
              displayNames={displayNames}
              selfUserId={selfUserId}
              roles={roles}
            />
          </Preview>
        )}
        {error && (
          <Alert variant="danger" className="mt-3 mb-0">
            {error}
          </Alert>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          {t("chat.deleteModal.cancel", "Cancel")}
        </Button>
        <Button variant="danger" disabled={deleting} onClick={confirm}>
          {t("chat.deleteModal.delete", "Delete")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default DeleteChatMessageModal;
