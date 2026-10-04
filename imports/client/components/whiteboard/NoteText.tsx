import React, { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { MAX_TEXT_LENGTH } from "../../../lib/whiteboard/limits";
import EditableText from "./EditableText";
import { useWhiteboard } from "./WhiteboardContext";

// A sticky's or text box's markdown, edited in place.
const NoteText = ({ id, text }: { id: string; text: string | undefined }) => {
  const {
    readOnly,
    readOnlyForLayout,
    updateNodes,
    editOnAppear,
    clearEditOnAppear,
  } = useWhiteboard();
  const { t } = useTranslation();
  const onText = useCallback(
    (next: string) => updateNodes([{ _id: id, text: next || null }]),
    [id, updateNodes],
  );
  return (
    <EditableText
      value={text}
      onCommit={onText}
      readOnly={readOnly}
      saveOnReadOnly={readOnlyForLayout}
      multiline
      markdown
      maxLength={MAX_TEXT_LENGTH}
      placeholder={t("whiteboard.text.placeholder", "Double-click to write")}
      startEditing={editOnAppear === id}
      onStartedEditing={clearEditOnAppear}
    />
  );
};

export default React.memo(NoteText);
