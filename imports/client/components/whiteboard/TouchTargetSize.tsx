import { useStore } from "@xyflow/react";
import type { RefObject } from "react";
import { useEffect } from "react";

// How big a finger's target is on screen, in pixels.
const TOUCH_TARGET = 44;

// Sets the sizes, in board units, that keep a finger's target on a handle
// or resize corner 44px on screen at any zoom (see CanvasWrapper in
// WhiteboardCanvas). A handle only scales with the board, so its target is
// 44px over the zoom. A resize corner also scales itself up by 1 / zoom
// when zoomed out (React Flow's autoScale), so its target only shrinks when
// zoomed in.
const TouchTargetSize = ({
  wrapperRef,
}: {
  wrapperRef: RefObject<HTMLDivElement | null>;
}) => {
  const zoom = useStore((s) => s.transform[2]);
  useEffect(() => {
    const style = wrapperRef.current?.style;
    style?.setProperty("--jr-touch-target", `${TOUCH_TARGET / zoom}px`);
    style?.setProperty(
      "--jr-resize-target",
      `${TOUCH_TARGET / Math.max(1, zoom)}px`,
    );
  }, [wrapperRef, zoom]);
  return null;
};

export default TouchTargetSize;
