import { useCallback, useEffect, useMemo, useRef } from "react";
import type { WhiteboardLiveState } from "../../methods/setWhiteboardLive";
import setWhiteboardLive from "../../methods/setWhiteboardLive";

// While dragging or drawing we send more often, so other people see smooth
// movement; plain pointer movement can be a little coarser.
const ACTIVE_INTERVAL = 100;
const IDLE_INTERVAL = 200;
const MIN_CURSOR_MOVE = 2;

export interface LiveSender {
  setCursor: (cursor: WhiteboardLiveState["cursor"]) => void;
  setDrag: (drag: WhiteboardLiveState["drag"]) => void;
  setStroke: (stroke: WhiteboardLiveState["stroke"]) => void;
}

const empty = (): WhiteboardLiveState => ({
  cursor: null,
  drag: null,
  stroke: null,
});

export default function useWhiteboardLive(
  boardId: string,
  enabled: boolean,
): LiveSender {
  const state = useRef<WhiteboardLiveState>(empty());
  const lastSent = useRef<string>(JSON.stringify(empty()));
  const lastSentAt = useRef(0);
  const timer = useRef<number | undefined>(undefined);

  const flush = useCallback(() => {
    timer.current = undefined;
    if (!enabled || document.visibilityState === "hidden") return;
    const json = JSON.stringify(state.current);
    if (json === lastSent.current) return;
    lastSent.current = json;
    lastSentAt.current = Date.now();
    setWhiteboardLive.call({ boardId, ...state.current }, () => {
      // Live updates are best-effort; a dropped one is replaced by the next.
    });
  }, [boardId, enabled]);

  const schedule = useCallback(() => {
    if (!enabled || timer.current !== undefined) return;
    const active = !!state.current.drag || !!state.current.stroke;
    const interval = active ? ACTIVE_INTERVAL : IDLE_INTERVAL;
    const wait = Math.max(0, lastSentAt.current + interval - Date.now());
    timer.current = window.setTimeout(flush, wait);
  }, [enabled, flush]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden" && enabled) {
        state.current = empty();
        lastSent.current = JSON.stringify(state.current);
        setWhiteboardLive.call({ boardId, ...state.current }, () => {});
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
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
