import React, { useCallback, useEffect, useRef, useState } from "react";
import styled, { css } from "styled-components";
import { MarkdownText } from "../ChatMarkdown";

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
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | undefined>(undefined);
  const cancelled = useRef(false);

  useEffect(() => {
    if (startEditing && !readOnly) {
      setDraft(value ?? "");
      setEditing(true);
      onStartedEditing?.();
    }
  }, [startEditing, readOnly, value, onStartedEditing]);

  useEffect(() => {
    if (pending === undefined) return undefined;
    if ((value ?? "") === pending) {
      setPending(undefined);
      return undefined;
    }
    const timeout = setTimeout(() => setPending(undefined), 5000);
    return () => clearTimeout(timeout);
  }, [value, pending]);

  const begin = useCallback(() => {
    if (readOnly) return;
    cancelled.current = false;
    setDraft(pending ?? value ?? "");
    setEditing(true);
  }, [readOnly, pending, value]);

  const commit = useCallback(() => {
    setEditing(false);
    if (cancelled.current) return;
    const trimmed = draft.trim() === "" ? "" : draft;
    if (trimmed !== (value ?? "")) {
      setPending(trimmed);
      onCommit(trimmed);
    }
  }, [draft, value, onCommit]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === "Escape") {
        cancelled.current = true;
        (e.target as HTMLElement).blur();
      } else if (e.key === "Enter" && !multiline) {
        (e.target as HTMLElement).blur();
      }
    },
    [multiline],
  );

  if (editing) {
    const props = {
      className: "nodrag nowheel",
      autoFocus: true,
      value: draft,
      maxLength,
      onChange: (
        e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>,
      ) => setDraft(e.target.value),
      onBlur: commit,
      onKeyDown,
      onFocus: (e: React.FocusEvent<HTMLTextAreaElement | HTMLInputElement>) =>
        e.target.select(),
    };
    return multiline ? <TextArea {...props} /> : <Input {...props} />;
  }

  const shown = pending ?? value;
  return (
    <Display
      $multiline={multiline}
      $empty={!shown}
      onDoubleClick={begin}
      title={readOnly ? undefined : "Double-click to edit"}
    >
      {shown && markdown ? (
        <MarkdownBody onClick={stopLinkClicks} onDoubleClick={stopLinkClicks}>
          <MarkdownText text={shown} safeLinks linkClassName="nodrag nopan" />
        </MarkdownBody>
      ) : (
        shown || (readOnly ? "" : placeholder)
      )}
    </Display>
  );
};

export default React.memo(EditableText);
