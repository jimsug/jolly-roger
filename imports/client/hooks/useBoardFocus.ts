import type { RefObject } from "react";
import { useEffect, useRef } from "react";

// Whether the board has focus: the last press or focus was on it. Read when
// a key or a copy or paste arrives, to tell whether it's the board's.
export default function useBoardFocus(
  wrapperRef: RefObject<HTMLElement | null>,
): RefObject<boolean> {
  const canvasActive = useRef(false);
  useEffect(() => {
    const track = (event: Event) => {
      canvasActive.current =
        event.target instanceof globalThis.Node &&
        !!wrapperRef.current?.contains(event.target);
    };
    window.addEventListener("pointerdown", track, true);
    window.addEventListener("focusin", track, true);
    return () => {
      window.removeEventListener("pointerdown", track, true);
      window.removeEventListener("focusin", track, true);
    };
  }, [wrapperRef]);
  return canvasActive;
}
