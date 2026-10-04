import type React from "react";
import { useEffect, useRef } from "react";
import type { Action, AudioControls } from "./useCallState";

// Ctrl+Space has its own meaning while typing (the chat editor is a
// contenteditable), so push-to-talk stays out of the way of text entry.
// Inputs that take no text (a focused radio in a ToggleButtonGroup, say)
// don't count.
const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

export function isTypingTarget(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) {
    return false;
  }
  if (element instanceof HTMLInputElement) {
    return !NON_TEXT_INPUT_TYPES.has(element.type);
  }
  return (
    element.isContentEditable ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  );
}

// Push-to-talk: while muted, holding Ctrl+Space unmutes until Space is
// released. The keydown checks read the mute state through a ref so the
// dispatch doesn't re-register the listeners mid-press; set-muted is
// idempotent, so a keyup that lands after the call has ended (navigating
// away mid-press resets the call state from an effect, one render before
// the listeners come off) is a no-op rather than a reducer error.
export default function usePushToTalk({
  inCall,
  audioControls,
  callDispatch,
}: {
  inCall: boolean;
  audioControls: AudioControls;
  callDispatch: React.Dispatch<Action>;
}) {
  const audioControlsRef = useRef(audioControls);
  useEffect(() => {
    audioControlsRef.current = audioControls;
  }, [audioControls]);
  const pushToTalkHeld = useRef(false);
  useEffect(() => {
    if (!inCall) {
      return undefined;
    }

    const release = () => {
      if (!pushToTalkHeld.current) {
        return;
      }
      pushToTalkHeld.current = false;
      callDispatch({ type: "set-muted", muted: true });
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key !== " " ||
        !e.ctrlKey ||
        e.repeat ||
        pushToTalkHeld.current ||
        isTypingTarget(document.activeElement)
      ) {
        return;
      }
      const current = audioControlsRef.current;
      if (!current.muted || current.deafened) {
        return;
      }
      e.preventDefault();
      pushToTalkHeld.current = true;
      callDispatch({ type: "set-muted", muted: false });
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== " " || !pushToTalkHeld.current) {
        return;
      }
      e.preventDefault();
      release();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    // Losing the window mid-press would otherwise leave the mic open
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", release);
      // So would going away mid-press (minimising the chat, say), with no
      // listener left to hear the release
      release();
    };
  }, [inCall, callDispatch]);
}
