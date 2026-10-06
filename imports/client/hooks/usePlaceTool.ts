import { Random } from "meteor/random";
import type { XYPosition } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";
import type React from "react";
import { useCallback, useRef, useState } from "react";
import type { WhiteboardShape } from "../../lib/models/WhiteboardNodes";
import { MIN_SIZES } from "../components/whiteboard/NodeChrome";
import type { PlaceTool, Tool } from "../components/whiteboard/tools";
import { DEFAULT_SIZES, isPlaceTool } from "../components/whiteboard/tools";
import { CLICK_SLOP } from "../components/whiteboard/touch";
import type { WhiteboardActions } from "../components/whiteboard/WhiteboardContext";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// The sticky, text, frame and shape tools: the box a press (or a drag) with
// one gives, the ghost shown for it, and placing the node. A touch press's
// own tracking (tapPress) stays with the canvas's pointer handling.
export default function usePlaceTool({
  tool,
  shapeKind,
  placementFor,
  updateNodes,
  tidyLater,
  setTool,
  setEditOnAppear,
}: {
  tool: Tool;
  shapeKind: WhiteboardShape;
  // The frame (if any) a box lands in, and its position in that frame.
  placementFor: (
    id: string,
    rect: Rect,
    moving: Set<string>,
  ) => { parent: string | undefined; position: XYPosition };
  updateNodes: WhiteboardActions["updateNodes"];
  // Runs something after a while, unless the canvas has gone by then.
  tidyLater: (tidy: () => void, ms: number) => void;
  setTool: React.Dispatch<React.SetStateAction<Tool>>;
  setEditOnAppear: React.Dispatch<React.SetStateAction<string | undefined>>;
}) {
  const flow = useReactFlow();
  // Takes focus in the moment a tap places a note, so a phone or tablet
  // brings up its keyboard (which it only does for a focus inside the tap
  // itself) and keeps it up as the note's editor takes focus over.
  const keyboardCatcher = useRef<HTMLInputElement>(null);
  const catchKeyboard = useCallback(() => {
    keyboardCatcher.current?.focus({ preventScroll: true });
  }, []);
  // Anything typed before the note's editor took over isn't kept for the
  // next tap.
  const clearKeyboardCatcher = useCallback(
    (event: React.FocusEvent<HTMLInputElement>) => {
      event.currentTarget.value = "";
    },
    [],
  );
  // Where a sticky, text box or frame will go: the press point and the
  // current pointer while placing, or just the pointer while hovering.
  const [placing, setPlacing] = useState<{
    start: XYPosition;
    current: XYPosition;
  }>();
  const [hover, setHover] = useState<XYPosition>();

  // Places a sticky, text box, frame or shape. If it lands inside a frame it
  // goes into that frame. Anything but a shape opens for typing in.
  const placeNode = useCallback(
    (type: PlaceTool, rect: Rect) => {
      const _id = Random.id();
      const { parent, position } = placementFor(_id, rect, new Set());
      updateNodes([
        {
          _id,
          type,
          position: { x: Math.round(position.x), y: Math.round(position.y) },
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          parent: parent ?? null,
          color: type === "sticky" ? "yellow" : undefined,
          ...(type === "shape" ? { shape: shapeKind } : {}),
        },
      ]);
      if (type === "shape") {
        setTool("select");
        return;
      }
      setEditOnAppear(_id);
      // If the new node can't open for editing (e.g. a frame placed while
      // zoomed right out shows no label), don't let it grab focus later, nor
      // leave the keyboard up for it.
      tidyLater(() => {
        setEditOnAppear((current) => (current === _id ? undefined : current));
        if (document.activeElement === keyboardCatcher.current) {
          keyboardCatcher.current?.blur();
        }
      }, 3000);
      setTool("select");
    },
    [placementFor, updateNodes, tidyLater, shapeKind, setTool, setEditOnAppear],
  );

  const placementRect = useCallback(
    (type: PlaceTool, start: XYPosition, end: XYPosition) => {
      const dragged =
        Math.hypot(end.x - start.x, end.y - start.y) * flow.getZoom() >=
        CLICK_SLOP;
      if (!dragged) {
        const size = DEFAULT_SIZES[type];
        return {
          x: start.x - size.width / 2,
          y: start.y - size.height / 2,
          ...size,
        };
      }
      const min = MIN_SIZES[type];
      return {
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        width: Math.max(min.width, Math.abs(end.x - start.x)),
        height: Math.max(min.height, Math.abs(end.y - start.y)),
      };
    },
    [flow],
  );

  // Where a sticky, text box or frame would go.
  const placeAt = placing ?? (hover && { start: hover, current: hover });
  const placeGhost =
    isPlaceTool(tool) && placeAt
      ? placementRect(tool, placeAt.start, placeAt.current)
      : undefined;

  return {
    placing,
    setPlacing,
    setHover,
    keyboardCatcher,
    catchKeyboard,
    clearKeyboardCatcher,
    placeNode,
    placementRect,
    placeGhost,
  };
}
