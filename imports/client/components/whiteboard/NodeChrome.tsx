import { NodeResizer, NodeToolbar, Position } from "@xyflow/react";
import React, { useCallback } from "react";
import type { WhiteboardColor } from "../../../lib/models/WhiteboardNodes";
import { CARD_HEIGHT } from "../../../lib/whiteboard/layout";
import ColorPicker from "./ColorPicker";
import NodeHandles from "./NodeHandles";
import { useWhiteboard } from "./WhiteboardContext";

// The smallest each kind can be, whether dragged out or resized.
export const MIN_SIZES = {
  sticky: { width: 80, height: 60 },
  text: { width: 60, height: 32 },
  frame: { width: CARD_HEIGHT, height: CARD_HEIGHT },
};

// What stickies, text boxes and frames all have: handles for lines and, while
// the board can be edited, resize handles and a colour picker.
const NodeChrome = ({
  id,
  kind,
  selected,
  color,
  palette,
  fallback,
}: {
  id: string;
  kind: keyof typeof MIN_SIZES;
  selected: boolean;
  color: WhiteboardColor | undefined;
  palette: Record<WhiteboardColor, string | undefined>;
  fallback?: string;
}) => {
  const { readOnly, updateNodes, persistResize } = useWhiteboard();
  const onColor = useCallback(
    (colour: WhiteboardColor) => updateNodes([{ _id: id, colour }]),
    [id, updateNodes],
  );
  const onResizeEnd = useCallback(() => persistResize(id), [id, persistResize]);
  return (
    <>
      {!readOnly && (
        <>
          <NodeResizer
            isVisible={selected}
            minWidth={MIN_SIZES[kind].width}
            minHeight={MIN_SIZES[kind].height}
            onResizeEnd={onResizeEnd}
          />
          <NodeToolbar position={Position.Top}>
            <ColorPicker
              value={color}
              palette={palette}
              onChange={onColor}
              fallback={fallback}
            />
          </NodeToolbar>
        </>
      )}
      <NodeHandles />
    </>
  );
};

export default React.memo(NodeChrome);
