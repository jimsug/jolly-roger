import type { Node, NodeProps } from "@xyflow/react";
import React, { useMemo } from "react";
import styled, { useTheme } from "styled-components";
import type { WhiteboardNodeType } from "../../../lib/models/WhiteboardNodes";
import type { InkPoint } from "../../../lib/whiteboard/ink";
import { inkPath } from "../../../lib/whiteboard/ink";
import { STROKE_COLOURS } from "./colours";
import NodeContributors from "./NodeContributors";
import useHoverIntent from "./useHoverIntent";

export type InkNodeType = Node<
  { doc: WhiteboardNodeType; erasing?: boolean },
  "ink"
>;

// The node wrapper ignores the pointer (see the .react-flow__node-ink rule in
// WhiteboardCanvas), so only the painted stroke itself can be clicked, not the
// empty middle of a loop.
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
    () =>
      inkPath(
        (doc.points ?? []) as InkPoint[],
        doc.strokeWidth ?? "medium",
        true,
      ),
    [doc.points, doc.strokeWidth],
  );
  const colour =
    (doc.colour && STROKE_COLOURS[doc.colour]) || theme.colors.text;

  return (
    <>
      <InkSvg
        width={width}
        height={height}
        $selected={!!selected}
        $erasing={!!data.erasing}
      >
        {/* biome-ignore lint/a11y/noStaticElementInteractions: hover only reveals who drew it */}
        <path
          d={path}
          fill={colour}
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
