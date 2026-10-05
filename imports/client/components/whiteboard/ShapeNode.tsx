import type { Node, NodeProps } from "@xyflow/react";
import React from "react";
import { useTranslation } from "react-i18next";
import styled, { useTheme } from "styled-components";
import type { WhiteboardNodeType } from "../../../lib/models/WhiteboardNodes";
import useHoverIntent from "../../hooks/useHoverIntent";
import useWhiteboardDetail from "../../hooks/useWhiteboardDetail";
import colors from "./colors";
import { CornerLockBadge } from "./LockBadge";
import NodeChrome from "./NodeChrome";
import NodeContributors from "./NodeContributors";

type ShapeNodeType = Node<{ doc: WhiteboardNodeType }, "shape">;

// How thick a shape's outline is, in board units. Zoomed right out it's
// drawn this many pixels thick instead, so it doesn't fade away.
const OUTLINE = 2;

const Box = styled.div<{ $selected: boolean }>`
  position: relative;
  width: 100%;
  height: 100%;
  outline: ${({ $selected, theme }) =>
    $selected ? `2px dashed ${theme.colors.primary}` : "none"};
  outline-offset: 2px;
`;

const ShapeSvg = styled.svg`
  display: block;
  overflow: visible;
`;

const Attribution = styled.div`
  position: absolute;
  right: 0;
  bottom: 100%;
`;

// A rectangle or an ellipse filling the node, in its colour's pastel with
// an outline in the strong version, or clear with an outline in the text
// colour when it has no colour. It takes lines, comments and locks like a
// note, but holds no text: a text box goes on top for that.
const ShapeNode = ({
  id,
  data,
  selected,
  width,
  height,
}: NodeProps<ShapeNodeType>) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const hover = useHoverIntent();
  const far = useWhiteboardDetail() === "far";
  const { doc } = data;
  const w = width ?? doc.width ?? 0;
  const h = height ?? doc.height ?? 0;
  const fill = doc.color ? colors.fill[doc.color] : "none";
  const stroke = (doc.color && colors.stroke[doc.color]) ?? theme.colors.text;
  const ellipse = doc.shape === "ellipse";
  const label = ellipse
    ? t("whiteboard.shape.ellipse", "Ellipse")
    : t("whiteboard.shape.rect", "Rectangle");
  // Inset by half the outline, so all of it is inside the node.
  const inset = OUTLINE / 2;
  const outline = {
    fill,
    stroke,
    strokeWidth: OUTLINE,
    vectorEffect: far ? "non-scaling-stroke" : undefined,
  };

  return (
    <Box
      $selected={selected}
      onMouseEnter={hover.onMouseEnter}
      onMouseLeave={hover.onMouseLeave}
    >
      <NodeChrome
        id={id}
        kind="shape"
        selected={selected}
        locked={!!doc.locked}
        color={doc.color}
        palette={colors.fill}
        clearable
      />
      <ShapeSvg
        className={far ? "jr-shape jr-shape-far" : "jr-shape"}
        width={w}
        height={h}
      >
        <title>{label}</title>
        {ellipse ? (
          <ellipse
            cx={w / 2}
            cy={h / 2}
            rx={Math.max(0, w / 2 - inset)}
            ry={Math.max(0, h / 2 - inset)}
            {...outline}
          />
        ) : (
          <rect
            x={inset}
            y={inset}
            width={Math.max(0, w - OUTLINE)}
            height={Math.max(0, h - OUTLINE)}
            rx={2}
            {...outline}
          />
        )}
      </ShapeSvg>
      {!far && (hover.hovered || selected) && (
        <Attribution>
          <NodeContributors contributors={doc.contributors} />
        </Attribution>
      )}
      {doc.locked && <CornerLockBadge lockedBy={doc.lockedBy} />}
    </Box>
  );
};

export default React.memo(ShapeNode);
