import React, { useCallback, useEffect, useRef, useState } from "react";
import Button from "react-bootstrap/Button";
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
  position: relative;
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

// Text the server hasn't taken, with a way to try again. It sits in the
// corner of a note, and after a one-line label.
const Unsaved = styled.span<{ $multiline: boolean }>`
  font-size: 12px;
  font-style: normal;
  white-space: nowrap;
  ${({ $multiline }) =>
    $multiline
      ? css`
          position: absolute;
          left: 0;
          bottom: 0;
        `
      : css`
          margin-left: 6px;
        `}
`;

const RetryButton = styled(Button)`
  padding: 0 6px;
  font-size: 12px;
  line-height: 1.5;
`;

const UnsavedNote = styled.span`
  opacity: 0.7;
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

const stopPropagation = (e: React.SyntheticEvent) => e.stopPropagation();

// Text sent to the server and not yet back. A refused save stays "unsaved",
// showing what was typed, until it's retried or edited.
interface Pending {
  text: string;
  state: "saving" | "saved" | "unsaved";
}

// Never rendered as HTML. With markdown set, chat's markdown subset is shown
// (raw HTML stays literal and unsafe links become plain text), but editing is
// still on the raw text. Double-click to edit; blur or Enter (single line)
// saves, Escape cancels. Keeps showing what was typed until the server catches
// up, so the old text doesn't flash back, and keeps showing it with a Retry
// button if the server refuses it.
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
  // Saves the text, then says whether the server refused it.
  onCommit: (text: string, onSaved: (refused: boolean) => void) => void;
  readOnly: boolean;
  multiline: boolean;
  markdown?: boolean;
  maxLength: number;
  placeholder: string;
  startEditing?: boolean;
  onStartedEditing?: () => void;
  // Whether text being typed when readOnly turns on is saved rather than
  // kept unsaved.
  saveOnReadOnly?: boolean;
}) => {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<Pending | undefined>(undefined);
  const cancelled = useRef(false);
  // Counts saves, so an answer to an older one is ignored.
  const saves = useRef(0);

  const begin = useCallback(() => {
    if (readOnly) return;
    cancelled.current = false;
    setDraft(pending?.text ?? value ?? "");
    setEditing(true);
  }, [readOnly, pending, value]);

  const save = useCallback(
    (text: string) => {
      saves.current += 1;
      const attempt = saves.current;
      setPending({ text, state: "saving" });
      onCommit(text, (refused) => {
        if (attempt !== saves.current) return;
        setPending((current) =>
          current?.text === text
            ? { text, state: refused ? "unsaved" : "saved" }
            : current,
        );
      });
    },
    [onCommit],
  );

  // An edit the canvas asks for (a note just placed, or one someone pressed
  // Enter on) starts in an effect: telling the canvas it has started updates
  // the canvas, which can't happen while this renders.
  useEffect(() => {
    if (startEditing && !readOnly) {
      begin();
      onStartedEditing?.();
    }
  }, [startEditing, readOnly, begin, onStartedEditing]);

  // Saved text shows until the server's copy matches it. Should someone
  // else's edit land first, the server's copy wins after a few seconds.
  useEffect(() => {
    if (pending === undefined) return undefined;
    if ((value ?? "") === pending.text) {
      setPending(undefined);
      return undefined;
    }
    if (pending.state !== "saved") return undefined;
    const timeout = setTimeout(() => setPending(undefined), 5000);
    return () => clearTimeout(timeout);
  }, [value, pending]);

  const trimmedDraft = draft.trim() === "" ? "" : draft;

  const commit = useCallback(() => {
    setEditing(false);
    if (cancelled.current) return;
    if (trimmedDraft === (value ?? "")) {
      setPending(undefined);
      return;
    }
    save(trimmedDraft);
  }, [trimmedDraft, value, save]);

  // Losing edit rights mid-edit (the edit policy changes, the hunt is
  // archived, or the connection drops) closes the editor, keeping what was
  // typed unsaved, since the server would refuse it, to retry once the board
  // can be edited again. A screen becoming phone-sized (compact, see
  // WhiteboardPage) only stops further edits, so what was typed is saved.
  useEffect(() => {
    if (!readOnly || !editing) return;
    if (saveOnReadOnly) {
      commit();
    } else {
      setEditing(false);
      if (trimmedDraft !== (value ?? "")) {
        setPending({ text: trimmedDraft, state: "unsaved" });
      }
    }
    cancelled.current = true;
  }, [readOnly, editing, saveOnReadOnly, commit, trimmedDraft, value]);

  const retry = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (pending) save(pending.text);
    },
    [pending, save],
  );

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

  const shown = pending?.text ?? value;
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
  let unsaved: React.ReactNode = null;
  if (pending?.state === "unsaved") {
    unsaved = (
      <Unsaved $multiline={multiline}>
        {readOnly ? (
          <UnsavedNote>{t("whiteboard.text.unsaved", "Not saved")}</UnsavedNote>
        ) : (
          <RetryButton
            size="sm"
            variant="danger"
            className="nodrag nopan"
            title={t(
              "whiteboard.text.retryTitle",
              "This wasn't saved. Try saving it again",
            )}
            onClick={retry}
            onDoubleClick={stopPropagation}
          >
            {t("whiteboard.text.retry", "Retry")}
          </RetryButton>
        )}
      </Unsaved>
    );
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
      {unsaved}
    </Display>
  );
};

export default React.memo(EditableText);
