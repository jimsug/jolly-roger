import React, { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { MAX_TEXT_LENGTH } from "../../../lib/whiteboard/limits";
import EditableText from "./EditableText";
import { useWhiteboard } from "./WhiteboardContext";

// A sticky's or text box's markdown, edited in place unless it's locked.
const NoteText = ({
  id,
  text,
  locked,
}: {
  id: string;
  text: string | undefined;
  locked: boolean;
}) => {
  const {
    readOnly,
    readOnlyForLayout,
    updateNodes,
    editOnAppear,
    clearEditOnAppear,
  } = useWhiteboard();
  const { t } = useTranslation();
  const onText = useCallback(
    (next: string, onSaved: (refused: boolean) => void) =>
      updateNodes([{ _id: id, text: next || null }], (error) =>
        onSaved(!!error),
      ),
    [id, updateNodes],
  );
  return (
    <EditableText
      value={text}
      onCommit={onText}
      readOnly={readOnly || locked}
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
