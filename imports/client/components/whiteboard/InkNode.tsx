import type { Node, NodeProps } from "@xyflow/react";
import { useStore } from "@xyflow/react";
import React, { useMemo } from "react";
import styled, { useTheme } from "styled-components";
import type { WhiteboardNodeType } from "../../../lib/models/WhiteboardNodes";
import { inkPath } from "../../../lib/whiteboard/ink";
import useHoverIntent from "../../hooks/useHoverIntent";
import colors from "./colors";
import { CornerLockBadge } from "./LockBadge";
import { MARKER_CLASS, strokeOpacity } from "./marker";
import NodeContributors from "./NodeContributors";

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

const InkLockBadge = styled(CornerLockBadge)`
  pointer-events: auto;
`;

const InkNode = ({
  id,
  data,
  selected,
  width,
  height,
}: NodeProps<InkNodeType>) => {
  const theme = useTheme();
  const hover = useHoverIntent();
  const { doc } = data;
  // A stroke saved in several segments shows one padlock, on the segment
  // that reaches furthest right.
  const showsLock = useStore((s) => {
    if (!doc.locked || !doc.stroke) return !!doc.locked;
    let best: { id: string; right: number } | undefined;
    for (const n of s.nodeLookup.values()) {
      const other = n.data.doc as WhiteboardNodeType | undefined;
      if (other?.stroke !== doc.stroke) continue;
      const right =
        n.internals.positionAbsolute.x + (n.measured.width ?? n.width ?? 0);
      if (
        !best ||
        right > best.right ||
        (right === best.right && n.id < best.id)
      ) {
        best = { id: n.id, right };
      }
    }
    return best?.id === id;
  });

  const path = useMemo(
    () => inkPath(doc.points ?? [], doc.strokeWidth ?? "medium", true),
    [doc.points, doc.strokeWidth],
  );
  const color = (doc.color && colors.stroke[doc.color]) ?? theme.colors.text;
  const strokeWidth = doc.strokeWidth ?? "medium";

  return (
    <>
      <InkSvg
        className={strokeWidth === "marker" ? MARKER_CLASS : undefined}
        width={width}
        height={height}
        $selected={selected}
        $erasing={!!data.erasing}
      >
        <path
          d={path}
          fill={color}
          fillOpacity={strokeOpacity(strokeWidth)}
          onMouseEnter={hover.onMouseEnter}
          onMouseLeave={hover.onMouseLeave}
        />
      </InkSvg>
      {showsLock && <InkLockBadge lockedBy={doc.lockedBy} />}
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
