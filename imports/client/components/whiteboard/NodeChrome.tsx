import { NodeResizer, NodeToolbar, Position } from "@xyflow/react";
import React, { useCallback } from "react";
import styled from "styled-components";
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

const ToolbarRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`;

// What stickies, text boxes and frames all have: handles for lines and, while
// the board can be edited and the node isn't locked, resize handles and a
// colour picker, with anything else the node offers beside it.
const NodeChrome = ({
  id,
  kind,
  selected,
  color,
  palette,
  fallback,
  resizable = true,
  locked = false,
  tools,
}: {
  id: string;
  kind: keyof typeof MIN_SIZES;
  selected: boolean;
  color: WhiteboardColor | undefined;
  palette: Record<WhiteboardColor, string | undefined>;
  fallback?: string;
  // Off for a collapsed frame, whose size on screen isn't its own.
  resizable?: boolean;
  locked?: boolean;
  tools?: React.ReactNode;
}) => {
  const { readOnly, updateNodes, persistResize } = useWhiteboard();
  const onColor = useCallback(
    (color: WhiteboardColor) => updateNodes([{ _id: id, color }]),
    [id, updateNodes],
  );
  const onResizeEnd = useCallback(() => persistResize(id), [id, persistResize]);
  return (
    <>
      {!readOnly && (
        <>
          {resizable && !locked && (
            <NodeResizer
              isVisible={selected}
              minWidth={MIN_SIZES[kind].width}
              minHeight={MIN_SIZES[kind].height}
              onResizeEnd={onResizeEnd}
            />
          )}
          {(!locked || tools) && (
            <NodeToolbar position={Position.Top}>
              <ToolbarRow>
                {!locked && (
                  <ColorPicker
                    value={color}
                    palette={palette}
                    onChange={onColor}
                    fallback={fallback}
                  />
                )}
                {tools}
              </ToolbarRow>
            </NodeToolbar>
          )}
        </>
      )}
      <NodeHandles locked={locked} />
    </>
  );
};

export default React.memo(NodeChrome);
