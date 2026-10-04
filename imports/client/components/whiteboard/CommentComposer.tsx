import { useSubscribe, useTracker } from "meteor/react-meteor-data";
import React, { useCallback, useEffect, useRef, useState } from "react";
import Button from "react-bootstrap/Button";
import { useTranslation } from "react-i18next";
import type { Descendant } from "slate";
import styled from "styled-components";
import Puzzles from "../../../lib/models/Puzzles";
import {
  cleanEditorMessage,
  emptyEditorContent,
  hasLoadingImage,
  hasSendableContent,
} from "../../chatEditorContent";
import EnabledChatImage from "../../EnabledChatImage";
import type { ChatImageUploadFailure } from "../../hooks/useChatImageUpload";
import useChatImageUpload from "../../hooks/useChatImageUpload";
import useMentionableUsers from "../../hooks/useMentionableUsers";
import type { FancyEditorHandle } from "../FancyEditor";
import FancyEditor from "../FancyEditor";

const Row = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 6px;
`;

const EditorBox = styled.div`
  flex: 1 1 auto;
  min-width: 0;
  max-height: 160px;
  overflow-y: auto;
  padding: 4px 6px;
  border-radius: 4px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.fancyEditorBackground};
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

  useSubscribe("enabledChatImage");
  const imagesEnabled = useTracker(
    () => EnabledChatImage.findOne("enabledChatImage")?.enabled ?? false,
    [],
  );
  const [imageNote, setImageNote] = useState<string>();
  // Chat's own words for a server with nowhere to put images.
  const imagesOff = t(
    "whiteboard.comments.imagesOff",
    "S3 presignedPost creation failed, check server settings to ensure S3 image bucket is configured correctly.",
  );
  const onUploadFailed = useCallback(
    (failure: ChatImageUploadFailure) => {
      let reason: string;
      if (failure.stage === "request") {
        reason = failure.error?.reason ?? failure.error?.message ?? imagesOff;
      } else {
        reason =
          failure.error instanceof Error
            ? failure.error.message
            : String(failure.error);
      }
      setImageNote(
        t(
          "whiteboard.comments.imageFailed",
          "Couldn't add the image: {{reason}}",
          {
            reason,
            // React escapes text, so i18next's escaping would only show
            // entities. Goes once both i18n inits stop escaping.
            interpolation: { escapeValue: false },
          },
        ),
      );
    },
    [imagesOff, t],
  );
  const upload = useChatImageUpload(puzzleId, editor, onUploadFailed);
  const uploadImage = useCallback(
    (file: File) => {
      if (!imagesEnabled) {
        setImageNote(imagesOff);
        return;
      }
      setImageNote(undefined);
      upload(file);
    },
    [imagesEnabled, imagesOff, upload],
  );
  // The editor keeps the function it was made with, so it calls through this
  // for the current one.
  const uploadRef = useRef(uploadImage);
  useEffect(() => {
    uploadRef.current = uploadImage;
  }, [uploadImage]);
  const uploadImageFile = useCallback(
    (file: File) => uploadRef.current(file),
    [],
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
  }, [disabled, content, onSend, changeContent]);

  return (
    <>
      <Row ref={rowRef} className="nodrag nowheel">
        <EditorBox>
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
        <Button
          size="sm"
          onClick={send}
          disabled={disabled || !hasText || loadingImage}
        >
          {t("whiteboard.comments.send", "Send")}
        </Button>
      </Row>
      {imageNote ? <ImageNote>{imageNote}</ImageNote> : null}
    </>
  );
};

export default React.memo(CommentComposer);
