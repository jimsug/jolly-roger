import type { Node, NodeProps } from "@xyflow/react";
import React, { useMemo } from "react";
import styled, { useTheme } from "styled-components";
import type { WhiteboardNodeType } from "../../../lib/models/WhiteboardNodes";
import { inkPath } from "../../../lib/whiteboard/ink";
import { STROKE_COLORS } from "./colors";
import NodeContributors from "./NodeContributors";
import useHoverIntent from "./useHoverIntent";

type InkNodeType = Node<{ doc: WhiteboardNodeType; erasing?: boolean }, "ink">;

// The node wrapper ignores the pointer (see INK_STYLE in useWhiteboardSync), so
// only the painted stroke itself can be clicked, not the empty middle of a
// loop.
const InkSvg = styled.svg<{ $selected: boolean; $erasing: boolean }>`
  display: block;
  overflow: visible;
  opacity: ${({ $erasing }) => ($erasing ? 0.25 : 1)};
  outline: ${({ $selected, theme }) =>
    $selected ? `1px dashed ${theme.colors.primary}` : "none"};

  path {
    pointer-events: visiblepainted;
    cursor: pointer;
  }
`;

const Attribution = styled.div`
  position: absolute;
  right: 0;
  bottom: 100%;
  pointer-events: auto;
`;

const InkNode = ({ data, selected, width, height }: NodeProps<InkNodeType>) => {
  const theme = useTheme();
  const hover = useHoverIntent();
  const { doc } = data;

  const path = useMemo(
    () => inkPath(doc.points ?? [], doc.strokeWidth ?? "medium", true),
    [doc.points, doc.strokeWidth],
  );
  const color = (doc.colour && STROKE_COLORS[doc.colour]) ?? theme.colors.text;

  return (
    <>
      <InkSvg
        width={width}
        height={height}
        $selected={selected}
        $erasing={!!data.erasing}
      >
        <path
          d={path}
          fill={color}
          onMouseEnter={hover.onMouseEnter}
          onMouseLeave={hover.onMouseLeave}
        />
      </InkSvg>
      {(hover.hovered || selected) && (
        <Attribution
          onMouseEnter={hover.onMouseEnter}
          onMouseLeave={hover.onMouseLeave}
        >
          <NodeContributors contributors={doc.contributors} />
        </Attribution>
      )}
    </>
  );
};

export default React.memo(InkNode);
