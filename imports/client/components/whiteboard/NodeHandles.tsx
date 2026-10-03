import { Handle, Position, useStore } from "@xyflow/react";
import React from "react";
import { useWhiteboard } from "./WhiteboardContext";

const SIDES = [
  [Position.Top, "top"],
  [Position.Right, "right"],
  [Position.Bottom, "bottom"],
  [Position.Left, "left"],
] as const;

// React Flow won't draw a line to a node with no handles, so these are always
// rendered, just hidden and inert when the board is read-only or a drawing
// tool is in use.
const inertStyle = { opacity: 0, pointerEvents: "none" as const };

// One handle per side. The canvas uses loose connections, so any handle can
// start or end an arrow; WhiteboardEdge works out where the line meets each
// node itself.
const NodeHandles = () => {
  const { readOnly } = useWhiteboard();
  const connectable = useStore((s) => s.nodesConnectable) && !readOnly;
  return (
    <>
      {SIDES.map(([position, side]) => (
        <Handle
          key={side}
          type="source"
          position={position}
          id={side}
          isConnectable={connectable}
          style={connectable ? undefined : inertStyle}
        />
      ))}
    </>
  );
};

export default React.memo(NodeHandles);
