import { useCallback, useEffect, useMemo, useRef } from "react";
import type { WhiteboardLiveState } from "../../methods/setWhiteboardLive";
import setWhiteboardLive from "../../methods/setWhiteboardLive";

// While dragging or drawing we send more often, so other people see smooth
// movement; plain pointer movement can be a little coarser.
const ACTIVE_INTERVAL = 100;
const IDLE_INTERVAL = 200;
const MIN_CURSOR_MOVE = 2;

interface LiveSender {
  setCursor: (cursor: WhiteboardLiveState["cursor"]) => void;
  setDrag: (drag: WhiteboardLiveState["drag"]) => void;
  setStroke: (stroke: WhiteboardLiveState["stroke"]) => void;
}

const empty = (): WhiteboardLiveState => ({
  cursor: null,
  drag: null,
  stroke: null,
});

// Sends this tab's cursor, drag and half-drawn stroke to everyone else on the
// board, throttled, and only when something changed. Nothing goes out from a
// hidden tab. Live updates are best-effort: one that's lost (or removed by the
// server when the presence subscription restarts) is replaced by the next.
export default function useWhiteboardLive(
  boardId: string,
  enabled: boolean,
): LiveSender {
  const state = useRef<WhiteboardLiveState>(empty());
  const lastSent = useRef<string>(JSON.stringify(empty()));
  const lastSentAt = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  // The board this tab is live on, cleared when the canvas leaves it or live
  // updates are turned off. Something still holding an older sender (a save
  // that finishes after the user has left the board, say) then can't put the
  // tab back on the board, where nothing would take it off again.
  const liveOn = useRef<string | undefined>(undefined);

  const flush = useCallback(() => {
    timer.current = undefined;
    if (liveOn.current !== boardId || document.visibilityState === "hidden") {
      return;
    }
    const json = JSON.stringify(state.current);
    if (json === lastSent.current) return;
    lastSent.current = json;
    lastSentAt.current = Date.now();
    setWhiteboardLive.call({ boardId, ...state.current });
  }, [boardId]);

  const schedule = useCallback(() => {
    if (liveOn.current !== boardId || timer.current !== undefined) return;
    const active = !!state.current.drag || !!state.current.stroke;
    const interval = active ? ACTIVE_INTERVAL : IDLE_INTERVAL;
    const wait = Math.max(0, lastSentAt.current + interval - Date.now());
    timer.current = window.setTimeout(flush, wait);
  }, [boardId, flush]);

  useEffect(() => {
    liveOn.current = enabled ? boardId : undefined;
    const onVisibility = () => {
      if (document.visibilityState === "hidden" && enabled) {
        state.current = empty();
        lastSent.current = JSON.stringify(state.current);
        setWhiteboardLive.call({ boardId, ...state.current });
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      liveOn.current = undefined;
      document.removeEventListener("visibilitychange", onVisibility);
      if (timer.current !== undefined) window.clearTimeout(timer.current);
      timer.current = undefined;
    };
  }, [boardId, enabled]);

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
    }),
    [schedule],
  );
}
