import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import styled, { css } from "styled-components";
import ChatMarkdown from "../ChatMarkdown";

const editorStyles = css`
  width: 100%;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  color: inherit;
  font: inherit;
  padding: 0;
`;

const TextArea = styled.textarea`
  ${editorStyles}
  height: 100%;
`;

const Input = styled.input`
  ${editorStyles}
`;

const Display = styled.div<{ $multiline: boolean; $empty: boolean }>`
  width: 100%;
  overflow: hidden;
  overflow-wrap: anywhere;
  ${({ $multiline }) =>
    $multiline &&
    css`
      height: 100%;
      white-space: pre-wrap;
    `}
  ${({ $empty }) =>
    $empty &&
    css`
      opacity: 0.5;
      font-style: italic;
    `}
`;

// Code and links take the note's own text colour so they read on any fill;
// Bootstrap's pink code and blue links are hard to read on some of them.
const MarkdownBody = styled.div`
  code {
    background: rgb(0 0 0 / 10%);
    color: inherit;
  }

  a {
    color: inherit;
    text-decoration: underline;
  }
`;

// Following a link shouldn't also select the node or start an edit.
const stopLinkClicks = (e: React.MouseEvent) => {
  if (e.target instanceof Element && e.target.closest("a")) {
    e.stopPropagation();
  }
};

const selectAll = (
  e: React.FocusEvent<HTMLTextAreaElement | HTMLInputElement>,
) => e.target.select();

// Never rendered as HTML. With markdown set, chat's markdown subset is shown
// (raw HTML stays literal and unsafe links become plain text), but editing is
// still on the raw text. Double-click to edit; blur or Enter (single line)
// saves, Escape cancels. Keeps showing what was typed until the server catches
// up, so the old text doesn't flash back.
const EditableText = ({
  value,
  onCommit,
  readOnly,
  multiline,
  markdown,
  maxLength,
  placeholder,
  startEditing,
  onStartedEditing,
  saveOnReadOnly = false,
}: {
  value: string | undefined;
  onCommit: (text: string) => void;
  readOnly: boolean;
  multiline: boolean;
  markdown?: boolean;
  maxLength: number;
  placeholder: string;
  startEditing?: boolean;
  onStartedEditing?: () => void;
  // Whether text being typed when readOnly turns on is saved rather than
  // dropped.
  saveOnReadOnly?: boolean;
}) => {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | undefined>(undefined);
  const cancelled = useRef(false);

  const begin = useCallback(() => {
    if (readOnly) return;
    cancelled.current = false;
    setDraft(pending ?? value ?? "");
    setEditing(true);
  }, [readOnly, pending, value]);

  // An edit the canvas asks for (a note just placed, or one someone pressed
  // Enter on) starts in an effect: telling the canvas it has started updates
  // the canvas, which can't happen while this renders.
  useEffect(() => {
    if (startEditing && !readOnly) {
      begin();
      onStartedEditing?.();
    }
  }, [startEditing, readOnly, begin, onStartedEditing]);

  useEffect(() => {
    if (pending === undefined) return undefined;
    if ((value ?? "") === pending) {
      setPending(undefined);
      return undefined;
    }
    const timeout = setTimeout(() => setPending(undefined), 5000);
    return () => clearTimeout(timeout);
  }, [value, pending]);

  const commit = useCallback(() => {
    setEditing(false);
    if (cancelled.current) return;
    const trimmed = draft.trim() === "" ? "" : draft;
    if (trimmed !== (value ?? "")) {
      setPending(trimmed);
      onCommit(trimmed);
    }
  }, [draft, value, onCommit]);

  // Losing edit rights mid-edit (the edit policy changes, or the hunt is
  // archived) closes the editor without saving what was typed, which the
  // server would refuse. A screen narrowing only stops further edits, so
  // what was typed is saved.
  useEffect(() => {
    if (!readOnly || !editing) return;
    if (saveOnReadOnly) {
      commit();
    } else {
      setEditing(false);
    }
    cancelled.current = true;
  }, [readOnly, editing, saveOnReadOnly, commit]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      e.stopPropagation();
      if (e.key === "Escape") {
        cancelled.current = true;
        e.currentTarget.blur();
      } else if (e.key === "Enter" && !multiline) {
        e.currentTarget.blur();
      }
    },
    [multiline],
  );

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) =>
      setDraft(e.target.value),
    [],
  );

  if (editing) {
    const props = {
      className: "nodrag nowheel",
      autoFocus: true,
      value: draft,
      maxLength,
      onChange,
      onBlur: commit,
      onKeyDown,
      onFocus: selectAll,
    };
    return multiline ? <TextArea {...props} /> : <Input {...props} />;
  }

  const shown = pending ?? value;
  let body: React.ReactNode;
  if (!shown) {
    body = readOnly ? "" : placeholder;
  } else if (markdown) {
    body = (
      <MarkdownBody onClick={stopLinkClicks} onDoubleClick={stopLinkClicks}>
        <ChatMarkdown text={shown} safeLinks linkClassName="nodrag nopan" />
      </MarkdownBody>
    );
  } else {
    body = shown;
  }
  return (
    <Display
      $multiline={multiline}
      $empty={!shown}
      onDoubleClick={begin}
      title={
        readOnly
          ? undefined
          : t("whiteboard.text.doubleClickToEdit", "Double-click to edit")
      }
    >
      {body}
    </Display>
  );
};

export default React.memo(EditableText);
