import { useTracker } from "meteor/react-meteor-data";
import React, { useCallback, useRef, useState } from "react";
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

const noImageUploads = () => {
  // Comments are text, mentions and puzzle links; a pasted or dropped image
  // is left out.
};

// The chat editor, with @-mentions and !-puzzle links, for writing a comment
// or a reply. Enter sends; the content is cleaned exactly as chat cleans it.
const CommentComposer = ({
  huntId,
  placeholder,
  onSend,
}: {
  huntId: string;
  placeholder: string;
  // Receives the message content as the JSON string sendChatMessage takes.
  onSend: (content: string) => void;
}) => {
  const { t } = useTranslation();
  const users = useMentionableUsers(huntId);
  const puzzles = useTracker(
    () => Puzzles.find({ hunt: huntId, kind: { $ne: "whiteboard" } }).fetch(),
    [huntId],
  );
  const [content, setContent] = useState<Descendant[]>(emptyEditorContent);
  const editor = useRef<FancyEditorHandle | null>(null);

  const send = useCallback(() => {
    if (!hasSendableContent(content) || hasLoadingImage(content)) {
      return false;
    }
    onSend(JSON.stringify(cleanEditorMessage(content)));
    setContent(emptyEditorContent());
    editor.current?.clearInput();
    return true;
  }, [content, onSend]);

  return (
    <Row className="nodrag nowheel">
      <EditorBox>
        <FancyEditor
          ref={editor}
          initialContent={content}
          placeholder={placeholder}
          users={users}
          puzzles={puzzles}
          onContentChange={setContent}
          uploadImageFile={noImageUploads}
          onSubmit={send}
        />
      </EditorBox>
      <Button size="sm" onClick={send} disabled={!hasSendableContent(content)}>
        {t("whiteboard.comments.send", "Send")}
      </Button>
    </Row>
  );
};

export default React.memo(CommentComposer);
