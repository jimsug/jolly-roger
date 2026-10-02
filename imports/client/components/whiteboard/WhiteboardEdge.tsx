import type { Edge, EdgeProps } from "@xyflow/react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  useInternalNode,
} from "@xyflow/react";
import React, { useCallback } from "react";
import styled, { useTheme } from "styled-components";
import type { WhiteboardEdgeType as WhiteboardEdgeDoc } from "../../../lib/models/WhiteboardEdges";
import { MAX_LABEL_LENGTH } from "../../../lib/whiteboard/limits";
import { STROKE_COLOURS } from "./colours";
import EditableText from "./EditableText";
import floatingEdgeParams from "./floatingEdge";
import NodeContributors from "./NodeContributors";
import useDetail, { useZoom } from "./useDetail";
import useHoverIntent from "./useHoverIntent";
import { useWhiteboard } from "./WhiteboardContext";

export type WhiteboardEdgeType = Edge<{ doc: WhiteboardEdgeDoc }, "whiteboard">;

const LabelBox = styled.div`
  position: absolute;
  pointer-events: all;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 13px;
  max-width: 220px;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  border: 1px solid ${({ theme }) => theme.colors.border};
`;

const Attribution = styled.div`
  position: absolute;
  pointer-events: all;
`;

// A handle at each end of a selected line: drag it to move that end, or to
// attach it to (or detach it from) something.
const Grip = styled.div`
  position: absolute;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  pointer-events: all;
  cursor: grab;
  background: ${({ theme }) => theme.colors.background};
  border: 2px solid ${({ theme }) => theme.colors.primary};
`;

const WhiteboardEdge = ({
  id,
  source,
  target,
  markerEnd,
  markerStart,
  data,
  selected,
}: EdgeProps<WhiteboardEdgeType>) => {
  const theme = useTheme();
  const detail = useDetail();
  // Grips stay the same size on screen whatever the zoom.
  const gripScale = 1 / useZoom();
  const { readOnly, updateEdge, beginEndpointDrag } = useWhiteboard();
  const hover = useHoverIntent();
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const doc = data?.doc;
  const auto = !!doc?.auto;
  const label = doc?.label;

  const onLabel = useCallback(
    (text: string) => updateEdge({ _id: id, label: text || null }),
    [id, updateEdge],
  );

  if (!sourceNode || !targetNode) return null;
  const params = floatingEdgeParams(sourceNode, targetNode);
  const pathStyle = doc?.pathStyle ?? "curved";
  const [path, labelX, labelY] =
    pathStyle === "straight"
      ? getStraightPath(params)
      : pathStyle === "elbow"
        ? getSmoothStepPath({ ...params, borderRadius: 8 })
        : getBezierPath(params);

  let stroke = auto
    ? theme.colors.textSecondary
    : ((doc?.colour && STROKE_COLOURS[doc.colour]) ?? theme.colors.text);
  if (selected) stroke = theme.colors.primary;

  // Feeder arrows follow their tags and are drawn thin and quiet; only
  // hand-drawn lines take labels, grips and attribution.
  const showLabel =
    !auto && detail !== "far" && (!!label || (!!selected && !readOnly));
  const showGrips = !auto && !!selected && !readOnly;
  const showAttribution = !auto && (hover.hovered || !!selected);

  const grip = (end: "source" | "target", x: number, y: number) => (
    <Grip
      className="nodrag nopan"
      style={{
        transform: `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${gripScale})`,
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        event.preventDefault();
        beginEndpointDrag(id, end, event);
      }}
    />
  );

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        markerStart={markerStart}
        interactionWidth={16}
        onMouseEnter={hover.onMouseEnter}
        onMouseLeave={hover.onMouseLeave}
        style={{
          stroke,
          strokeWidth: auto ? 1 : 2,
          strokeDasharray: doc?.dashed ? "8 6" : undefined,
          opacity: auto && !selected ? 0.55 : 1,
        }}
      />
      {(showLabel || showGrips || showAttribution) && (
        <EdgeLabelRenderer>
          {showLabel && (
            <LabelBox
              className="nodrag nopan"
              style={{
                transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              }}
            >
              <EditableText
                value={label}
                onCommit={onLabel}
                readOnly={readOnly}
                multiline={false}
                maxLength={MAX_LABEL_LENGTH}
                placeholder="Label"
              />
            </LabelBox>
          )}
          {showAttribution && (
            <Attribution
              onMouseEnter={hover.onMouseEnter}
              onMouseLeave={hover.onMouseLeave}
              className="nodrag nopan"
              style={{
                transform: `translate(-50%, 0) translate(${labelX}px, ${labelY + 14}px)`,
              }}
            >
              <NodeContributors contributors={doc?.contributors} />
            </Attribution>
          )}
          {showGrips && grip("source", params.sourceX, params.sourceY)}
          {showGrips && grip("target", params.targetX, params.targetY)}
        </EdgeLabelRenderer>
      )}
    </>
  );
};

export default React.memo(WhiteboardEdge);
