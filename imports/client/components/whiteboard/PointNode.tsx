import type { Node, NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import React from "react";
import styled from "styled-components";
import type { WhiteboardNodeType } from "../../../lib/models/WhiteboardNodes";
import { useZoom } from "./useDetail";

export type PointNodeType = Node<{ doc: WhiteboardNodeType }, "point">;

// On-screen size of the area that grabs a free end, whatever the zoom.
const GRAB_SIZE = 16;

const Dot = styled.div`
  position: relative;
  width: 100%;
  height: 100%;
`;

// Larger than the node itself and counter-scaled, so a free end is easy to
// grab even zoomed out. Shows a dot on hover or when selected.
const GrabArea = styled.div<{ $selected: boolean }>`
  position: absolute;
  left: 50%;
  top: 50%;
  border-radius: 50%;
  cursor: grab;
  background: ${({ $selected, theme }) =>
    $selected ? theme.colors.primary : "transparent"};

  &:hover {
    background: ${({ theme }) => theme.colors.primary};
  }
`;

const hiddenHandle = {
  opacity: 0,
  left: "50%",
  top: "50%",
  width: 1,
  height: 1,
  minWidth: 0,
  minHeight: 0,
  border: "none",
  pointerEvents: "none" as const,
};

// The free end of a line: invisible until hovered or selected.
const PointNode = ({ selected }: NodeProps<PointNodeType>) => {
  const size = GRAB_SIZE / useZoom();
  return (
    <Dot>
      <GrabArea
        $selected={!!selected}
        style={{
          width: size,
          height: size,
          transform: "translate(-50%, -50%)",
        }}
      />
      <Handle
        type="source"
        position={Position.Top}
        isConnectable={false}
        style={hiddenHandle}
      />
    </Dot>
  );
};

export default React.memo(PointNode);
