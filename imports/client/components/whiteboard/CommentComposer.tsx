import { useTracker } from "meteor/react-meteor-data";
import React, { useCallback, useEffect, useRef, useState } from "react";
import Button from "react-bootstrap/Button";
import { useTranslation } from "react-i18next";
import type { Descendant } from "slate";
import styled, { css } from "styled-components";
import Puzzles from "../../../lib/models/Puzzles";
import {
  cleanEditorMessage,
  emptyEditorContent,
  hasLoadingImage,
  hasSendableContent,
} from "../../chatEditorContent";
import useEditorImageUpload from "../../hooks/useEditorImageUpload";
import useMentionableUsers from "../../hooks/useMentionableUsers";
import type { FancyEditorHandle } from "../FancyEditor";
import FancyEditor from "../FancyEditor";

const Row = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 6px;
`;

// On a phone the text is 16px, below which iOS zooms in on focus.
const EditorBox = styled.div<{ $compact: boolean }>`
  flex: 1 1 auto;
  min-width: 0;
  max-height: 160px;
  overflow-y: auto;
  padding: 4px 6px;
  border-radius: 4px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.fancyEditorBackground};
  ${({ $compact }) =>
    $compact &&
    css`
      font-size: 16px;
    `}
`;

const SendButton = styled(Button)<{ $compact: boolean }>`
  ${({ $compact }) =>
    $compact &&
    css`
      min-height: 44px;
    `}
`;

const ImageNote = styled.output`
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

// The chat editor, with @-mentions and !-puzzle links, for writing a comment
// or a reply. Enter sends; the content is cleaned exactly as chat cleans it.
// A pasted or dropped image is uploaded and put in, as chat does, when the
// server has somewhere to put it.
const CommentComposer = ({
  huntId,
  puzzleId,
  placeholder,
  autoFocus = false,
  compact = false,
  disabled = false,
  onSend,
  onHasTextChange,
}: {
  huntId: string;
  // The board's backing puzzle, which images are uploaded for.
  puzzleId: string;
  placeholder: string;
  // Takes focus when it first shows.
  autoFocus?: boolean;
  // Sized for a phone.
  compact?: boolean;
  // Keeps what's written but won't send it.
  disabled?: boolean;
  // Receives the message content as the JSON string sendChatMessage takes,
  // and a callback for when the server refuses it, which puts the text back
  // if nothing new has been written since.
  onSend: (content: string, onRefused: () => void) => void;
  // Whether there's anything written that could be sent.
  onHasTextChange?: (hasText: boolean) => void;
}) => {
  const { t } = useTranslation();
  const users = useMentionableUsers(huntId);
  const puzzles = useTracker(
    () => Puzzles.find({ hunt: huntId, kind: { $ne: "whiteboard" } }).fetch(),
    [huntId],
  );
  const [content, setContent] = useState<Descendant[]>(emptyEditorContent);
  // The latest content, for a refusal that arrives after more typing.
  const latest = useRef(content);
  const changeContent = useCallback((next: Descendant[]) => {
    latest.current = next;
    setContent(next);
  }, []);
  // Bumped to remount the editor with restored content, which Slate only
  // reads when it mounts.
  const [editorKey, setEditorKey] = useState(0);
  const refocus = useRef(false);
  const editor = useRef<FancyEditorHandle | null>(null);
  useEffect(() => {
    if (autoFocus) editor.current?.focus();
  }, [autoFocus]);
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    editor.current?.focus();
  }, [editorKey]);
  const rowRef = useRef<HTMLDivElement>(null);

  const { imageNote, setImageNote, uploadImageFile } = useEditorImageUpload(
    puzzleId,
    editor,
  );

  const hasText = hasSendableContent(content);
  const loadingImage = hasLoadingImage(content);
  useEffect(() => {
    onHasTextChange?.(hasText);
  }, [hasText, onHasTextChange]);

  const send = useCallback(() => {
    if (disabled || !hasSendableContent(content) || hasLoadingImage(content)) {
      return false;
    }
    setImageNote(undefined);
    const sent = content;
    changeContent(emptyEditorContent());
    editor.current?.clearInput();
    onSend(JSON.stringify(cleanEditorMessage(sent)), () => {
      if (hasSendableContent(latest.current)) return;
      refocus.current = !!rowRef.current?.contains(document.activeElement);
      changeContent(sent);
      setEditorKey((key) => key + 1);
    });
    return true;
  }, [disabled, content, onSend, changeContent, setImageNote]);

  return (
    <>
      <Row ref={rowRef} className="nodrag nowheel">
        <EditorBox $compact={compact}>
          <FancyEditor
            key={editorKey}
            ref={editor}
            initialContent={content}
            placeholder={placeholder}
            users={users}
            puzzles={puzzles}
            onContentChange={changeContent}
            uploadImageFile={uploadImageFile}
            onSubmit={send}
          />
        </EditorBox>
        <SendButton
          size="sm"
          $compact={compact}
          onClick={send}
          disabled={disabled || !hasText || loadingImage}
        >
          {t("whiteboard.comments.send", "Send")}
        </SendButton>
      </Row>
      {imageNote ? <ImageNote>{imageNote}</ImageNote> : null}
    </>
  );
};

export default React.memo(CommentComposer);
