import { useSubscribe, useTracker } from "meteor/react-meteor-data";
import React, { useCallback, useRef, useState } from "react";
import Button from "react-bootstrap/Button";
import type { Descendant } from "slate";
import styled from "styled-components";
import MeteorUsers from "../../../lib/models/MeteorUsers";
import Puzzles from "../../../lib/models/Puzzles";
import {
  cleanEditorMessage,
  emptyEditorContent,
  hasLoadingImage,
  hasSendableContent,
} from "../../chatEditorContent";
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

const ignorePaste = () => {};
const noImageUploads = () => {};

// The chat editor, with @-mentions, for writing a comment or a reply. Enter
// sends; the content is cleaned exactly as chat cleans it.
const CommentComposer = ({
  huntId,
  placeholder,
  disabled,
  onSend,
}: {
  huntId: string;
  placeholder: string;
  disabled?: boolean;
  // Receives the message content as the JSON string sendChatMessage takes.
  onSend: (content: string) => void;
}) => {
  const profilesLoading = useSubscribe("huntProfiles", huntId)();
  const users = useTracker(
    () =>
      profilesLoading
        ? []
        : MeteorUsers.find({
            hunts: huntId,
            displayName: { $ne: undefined },
          }).fetch(),
    [huntId, profilesLoading],
  );
  const puzzles = useTracker(
    () => Puzzles.find({ hunt: huntId, kind: { $ne: "whiteboard" } }).fetch(),
    [huntId],
  );
  const [content, setContent] = useState<Descendant[]>(emptyEditorContent);
  const editor = useRef<FancyEditorHandle | null>(null);

  const send = useCallback(() => {
    if (disabled || !hasSendableContent(content) || hasLoadingImage(content)) {
      return false;
    }
    onSend(JSON.stringify(cleanEditorMessage(content)));
    setContent(emptyEditorContent);
    editor.current?.clearInput();
    return true;
  }, [content, disabled, onSend]);

  return (
    <Row className="nodrag nowheel">
      <EditorBox>
        <FancyEditor
          ref={editor}
          initialContent={emptyEditorContent}
          placeholder={placeholder}
          users={users}
          puzzles={puzzles}
          onContentChange={setContent}
          uploadImageFile={noImageUploads}
          onSubmit={send}
          disabled={disabled}
          onPaste={ignorePaste}
        />
      </EditorBox>
      <Button
        size="sm"
        onClick={send}
        disabled={disabled || !hasSendableContent(content)}
      >
        Send
      </Button>
    </Row>
  );
};

export default React.memo(CommentComposer);
