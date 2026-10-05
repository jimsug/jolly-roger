import { useCallback, useEffect, useMemo, useRef } from "react";
import type { WhiteboardLiveState } from "../../methods/setWhiteboardLive";
import setWhiteboardLive from "../../methods/setWhiteboardLive";

// While dragging or drawing we send more often, so other people see smooth
// movement; plain pointer movement can be a little coarser.
const ACTIVE_INTERVAL = 100;
const IDLE_INTERVAL = 200;
const MIN_CURSOR_MOVE = 2;

type LiveState = Required<WhiteboardLiveState>;

interface LiveSender {
  setCursor: (cursor: LiveState["cursor"]) => void;
  setDrag: (drag: LiveState["drag"]) => void;
  setStroke: (stroke: LiveState["stroke"]) => void;
  setSelection: (selection: LiveState["selection"]) => void;
  setEditing: (editing: LiveState["editing"]) => void;
}

const empty = (): LiveState => ({
  cursor: null,
  drag: null,
  stroke: null,
  selection: null,
  editing: null,
});

// Sends this tab's cursor, drag, half-drawn stroke, selection and the text
// being typed in to everyone else on the board, throttled, and only when
// something changed. Nothing goes out from a hidden tab, and the selection
// and text being typed in aren't shown while the window is in the
// background. Live updates are best-effort: one that's lost (or removed by
// the server when the presence subscription restarts) is replaced by the
// next.
export default function useWhiteboardLive(
  boardId: string,
  enabled: boolean,
): LiveSender {
  const state = useRef<LiveState>(empty());
  const lastSent = useRef<string>(JSON.stringify(empty()));
  const lastSentAt = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  // Whether the window has focus. Assumed until it's lost, since a tab can
  // be opened without ever getting a focus event.
  const focused = useRef(true);
  // The board this tab is live on, cleared when the canvas leaves it or live
  // updates are turned off. Something still holding an older sender (a save
  // that finishes after the user has left the board, say) then can't put the
  // tab back on the board, where nothing would take it off again.
  const liveOn = useRef<string | undefined>(undefined);

  // What others are shown: the selection and editing only while the window
  // has focus.
  const shown = useCallback(
    (): LiveState =>
      focused.current
        ? state.current
        : { ...state.current, selection: null, editing: null },
    [],
  );

  const flush = useCallback(() => {
    timer.current = undefined;
    if (liveOn.current !== boardId || document.visibilityState === "hidden") {
      return;
    }
    const payload = shown();
    const json = JSON.stringify(payload);
    if (json === lastSent.current) return;
    lastSent.current = json;
    lastSentAt.current = Date.now();
    setWhiteboardLive.call({ boardId, ...payload });
  }, [boardId, shown]);

  const schedule = useCallback(() => {
    if (liveOn.current !== boardId || timer.current !== undefined) return;
    const active = !!state.current.drag || !!state.current.stroke;
    const interval = active ? ACTIVE_INTERVAL : IDLE_INTERVAL;
    const wait = Math.max(0, lastSentAt.current + interval - Date.now());
    timer.current = window.setTimeout(flush, wait);
  }, [boardId, flush]);

  useEffect(() => {
    liveOn.current = enabled ? boardId : undefined;
    // A hidden tab drops off the board at once. Its selection and editing
    // are kept, to show again once it's back.
    const onVisibility = () => {
      if (!enabled) return;
      if (document.visibilityState === "hidden") {
        state.current = {
          ...empty(),
          selection: state.current.selection,
          editing: state.current.editing,
        };
        lastSent.current = JSON.stringify(empty());
        setWhiteboardLive.call({ boardId, ...empty() });
      } else {
        schedule();
      }
    };
    const onFocus = () => {
      focused.current = true;
      schedule();
    };
    const onBlur = () => {
      focused.current = false;
      schedule();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    return () => {
      liveOn.current = undefined;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
      if (timer.current !== undefined) window.clearTimeout(timer.current);
      timer.current = undefined;
    };
  }, [boardId, enabled, schedule]);

  return useMemo(
    () => ({
      setCursor: (cursor) => {
        const previous = state.current.cursor;
        if (
          cursor &&
          previous &&
          Math.hypot(cursor.x - previous.x, cursor.y - previous.y) <
            MIN_CURSOR_MOVE
        ) {
          return;
        }
        state.current = { ...state.current, cursor };
        schedule();
      },
      setDrag: (drag) => {
        state.current = { ...state.current, drag };
        schedule();
      },
      setStroke: (stroke) => {
        state.current = { ...state.current, stroke };
        schedule();
      },
      setSelection: (selection) => {
        state.current = {
          ...state.current,
          selection: selection?.length ? selection : null,
        };
        schedule();
      },
      setEditing: (editing) => {
        state.current = { ...state.current, editing };
        schedule();
      },
    }),
    [schedule],
  );
}
