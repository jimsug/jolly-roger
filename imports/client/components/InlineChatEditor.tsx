import { useTracker } from "meteor/react-meteor-data";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import Button from "react-bootstrap/Button";
import { useTranslation } from "react-i18next";
import type { Descendant } from "slate";
import styled from "styled-components";
import type { ChatMessageType } from "../../lib/models/ChatMessages";
import Puzzles from "../../lib/models/Puzzles";
import editChatMessage from "../../methods/editChatMessage";
import {
  cleanEditorMessage,
  editorContentFromMessage,
  hasLoadingImage,
  hasSendableContent,
} from "../chatEditorContent";
import useBlockUpdate from "../hooks/useBlockUpdate";
import useEditorImageUpload from "../hooks/useEditorImageUpload";
import useMentionableUsers from "../hooks/useMentionableUsers";
import type { FancyEditorHandle } from "./FancyEditor";
import FancyEditor from "./FancyEditor";

// Holds the editor and its buttons, and hears Escape from the editor.
const Editing = styled.div`
  margin: 2px 0;
`;

const EditorBox = styled.div`
  max-height: 200px;
  overflow-y: auto;
  padding: 4px 6px;
  margin-bottom: 4px;
  border-radius: 4px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background-color: ${({ theme }) => theme.colors.fancyEditorBackground};
  white-space: pre-wrap;
`;

const Buttons = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-bottom: 2px;
`;

const Note = styled.output`
  display: block;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const ErrorNote = styled.div`
  font-size: 12px;
  color: var(--bs-danger);
`;

// Edits one of the user's own chat messages in place: the chat editor,
// filled with the message as it is, where Enter saves and Escape gives up,
// with Save and Cancel for touch screens. onDone is called once the edit is
// saved or abandoned; a refused edit stays open with the reason under it.
const InlineChatEditor = ({
  message,
  onDone,
}: {
  message: Pick<ChatMessageType, "_id" | "hunt" | "puzzle" | "content">;
  onDone: () => void;
}) => {
  const { t } = useTranslation();
  const users = useMentionableUsers(message.hunt);
  const puzzles = useTracker(
    () =>
      Puzzles.find({ hunt: message.hunt, kind: { $ne: "whiteboard" } }).fetch(),
    [message.hunt],
  );
  const [initialContent] = useState(() =>
    editorContentFromMessage(message.content),
  );
  const [content, setContent] = useState<Descendant[]>(initialContent);
  const editor = useRef<FancyEditorHandle | null>(null);
  useEffect(() => {
    editor.current?.focus(true);
  }, []);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useBlockUpdate(
    t("chat.edit.blocksUpdate", "You're in the middle of editing a message."),
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const { imageNote, uploadImageFile } = useEditorImageUpload(
    message.puzzle,
    editor,
  );

  const canSave =
    !saving && hasSendableContent(content) && !hasLoadingImage(content);

  // Always false, so the editor keeps what's written: it goes away once the
  // edit is saved, and stays as it was if the edit is refused.
  const save = useCallback(() => {
    if (!canSave) return false;
    const cleaned = JSON.stringify(cleanEditorMessage(content));
    if (cleaned === JSON.stringify(message.content)) {
      onDone();
      return false;
    }
    setSaving(true);
    setError(undefined);
    editChatMessage.call(
      { messageId: message._id, content: cleaned },
      (err) => {
        if (!mounted.current) return;
        setSaving(false);
        if (err) {
          setError(err.reason ?? err.message);
        } else {
          onDone();
        }
      },
    );
    return false;
  }, [canSave, content, message._id, message.content, onDone]);

  // Escape that the editor hasn't used (to close its suggestions) gives up.
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      onDone();
    },
    [onDone],
  );

  return (
    <Editing onKeyDown={onKeyDown}>
      <EditorBox>
        <FancyEditor
          ref={editor}
          initialContent={initialContent}
          users={users}
          puzzles={puzzles}
          onContentChange={setContent}
          uploadImageFile={uploadImageFile}
          onSubmit={save}
        />
      </EditorBox>
      {imageNote ? <Note>{imageNote}</Note> : null}
      {error ? <ErrorNote role="alert">{error}</ErrorNote> : null}
      <Buttons>
        <Button size="sm" variant="secondary" onClick={onDone}>
          {t("chat.edit.cancel", "Cancel")}
        </Button>
        <Button size="sm" variant="primary" disabled={!canSave} onClick={save}>
          {t("chat.edit.save", "Save")}
        </Button>
      </Buttons>
    </Editing>
  );
};

export default InlineChatEditor;
