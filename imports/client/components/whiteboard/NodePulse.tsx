import type { XYPosition } from "@xyflow/react";
import { useInternalNode, ViewportPortal } from "@xyflow/react";
import React from "react";
import styled, { keyframes } from "styled-components";
import { boxOf } from "./floatingEdgeParams";

// Spreads out from the outline, fading as it goes, like a comment pin's
// pulse.
const ring = keyframes`
  0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--node-pulse) 70%, transparent); }
  70% { box-shadow: 0 0 0 24px color-mix(in srgb, var(--node-pulse) 0%, transparent); }
  100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--node-pulse) 0%, transparent); }
`;

const Ring = styled.div<{ $round: boolean }>`
  --node-pulse: ${({ theme }) => theme.colors.primary};

  position: absolute;
  left: 0;
  top: 0;
  z-index: 1001;
  pointer-events: none;
  border: 3px solid var(--node-pulse);
  border-radius: ${({ $round }) => ($round ? "50%" : "10px")};
  animation: ${ring} 0.7s ease-out 3;
`;

// How far the outline stands off what it marks.
const MARGIN = 6;
// The size of the mark at a point, such as a line's middle.
const POINT_RING = 32;

const PulseAtNode = ({ id }: { id: string }) => {
  const node = useInternalNode(id);
  if (!node) return null;
  const { x, y, width, height } = boxOf(node);
  return (
    <Ring
      className="jr-node-pulse"
      data-node={id}
      $round={false}
      style={{
        transform: `translate(${x - MARGIN}px, ${y - MARGIN}px)`,
        width: width + 2 * MARGIN,
        height: height + 2 * MARGIN,
      }}
    />
  );
};

// Marks something the board has just panned to: a node, followed as it
// moves, or a point.
const NodePulse = ({ node, point }: { node?: string; point?: XYPosition }) => (
  <ViewportPortal>
    {node && <PulseAtNode id={node} />}
    {!node && point && (
      <Ring
        className="jr-node-pulse"
        $round
        style={{
          transform: `translate(${point.x - POINT_RING / 2}px, ${point.y - POINT_RING / 2}px)`,
          width: POINT_RING,
          height: POINT_RING,
        }}
      />
    )}
  </ViewportPortal>
);

export default React.memo(NodePulse);
