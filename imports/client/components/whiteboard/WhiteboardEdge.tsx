import type { EdgeProps } from "@xyflow/react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  useInternalNode,
  useStore,
} from "@xyflow/react";
import React, { useCallback, useContext } from "react";
import { useTranslation } from "react-i18next";
import styled, { useTheme } from "styled-components";
import {
  feederArrowEmphasis,
  feederArrowLook,
} from "../../../lib/whiteboard/feederFocus";
import { MAX_LABEL_LENGTH } from "../../../lib/whiteboard/limits";
import useHoverIntent from "../../hooks/useHoverIntent";
import useWhiteboardDetail from "../../hooks/useWhiteboardDetail";
import type { WhiteboardFlowEdge } from "../../hooks/useWhiteboardSync";
import colors from "./colors";
import EditableText from "./EditableText";
import FeederFocusContext from "./FeederFocusContext";
import floatingEdgeParams from "./floatingEdgeParams";
import NodeContributors from "./NodeContributors";
import RemoteEditingContext from "./RemoteEditingContext";
import { RemoteTag } from "./RemoteSelectionLayer";
import { useWhiteboard } from "./WhiteboardContext";

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

const TakenTag = styled.div`
  position: absolute;
  left: 0;
  top: 0;
  transform-origin: 0 0;
  pointer-events: none;
`;

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

// A handle at one end of a selected line: drag it to move that end, or to
// attach it to (or detach it from) something.
const EdgeGrip = ({
  edgeId,
  end,
  x,
  y,
  scale,
}: {
  edgeId: string;
  end: "source" | "target";
  x: number;
  y: number;
  scale: number;
}) => {
  const { beginEndpointDrag } = useWhiteboard();
  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      event.stopPropagation();
      event.preventDefault();
      beginEndpointDrag(edgeId, end, event);
    },
    [beginEndpointDrag, edgeId, end],
  );
  return (
    <Grip
      className="nodrag nopan"
      style={{
        transform: `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${scale})`,
      }}
      onPointerDown={onPointerDown}
    />
  );
};

const WhiteboardEdge = ({
  id,
  source,
  target,
  markerEnd,
  markerStart,
  data,
  selected,
}: EdgeProps<WhiteboardFlowEdge>) => {
  const theme = useTheme();
  const { t } = useTranslation();
  const detail = useWhiteboardDetail();
  const { readOnly, readOnlyForLayout, updateEdge } = useWhiteboard();
  const hover = useHoverIntent();
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const doc = data?.doc;
  const auto = !!doc?.auto;
  const label = doc?.label;
  const feederFocus = useContext(FeederFocusContext);
  const emphasis = auto
    ? feederArrowEmphasis({ source, target }, feederFocus)
    : undefined;
  // A line drawn to a collapsed frame in place of something inside it has
  // no grips, so its real end can't be dragged off by mistake.
  const showGrips = !auto && !!selected && !readOnly && !data?.folded;
  // Someone else typing in the label, who's named centred above it.
  const takenBy = useContext(RemoteEditingContext).get(id);
  const showTaken = !auto && !!takenBy && detail !== "far";
  // Grips and that name stay the same size on screen whatever the zoom. Only
  // a line showing them follows the zoom, so zooming doesn't redraw every
  // line.
  const gripScale =
    1 / useStore((s) => (showGrips || showTaken ? s.transform[2] : 1));

  const onLabel = useCallback(
    (text: string, onSaved: (refused: boolean) => void) =>
      updateEdge({ _id: id, label: text || null }, (error) => onSaved(!!error)),
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
    : ((doc?.color && colors.stroke[doc.color]) ?? theme.colors.text);
  if (selected) stroke = theme.colors.primary;

  // Feeder arrows follow their tags and are drawn thin and quiet; only
  // hand-drawn lines take labels, grips and attribution.
  const showLabel =
    !auto && detail !== "far" && (!!label || (!!selected && !readOnly));
  const showAttribution = !auto && (hover.hovered || !!selected);
  // A hovered or selected meta brings out its feeders' arrows, and a feeder
  // its metas', fading the rest.
  const look = auto
    ? feederArrowLook(emphasis, !!selected)
    : { strokeWidth: 2, opacity: 1 };

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        markerStart={markerStart}
        interactionWidth={16}
        className={emphasis && `jr-feeder-${emphasis}`}
        onMouseEnter={hover.onMouseEnter}
        onMouseLeave={hover.onMouseLeave}
        style={{
          stroke,
          strokeWidth: look.strokeWidth,
          strokeDasharray: doc?.dashed ? "8 6" : undefined,
          opacity: look.opacity,
        }}
      />
      {(showLabel || showGrips || showAttribution || showTaken) && (
        <EdgeLabelRenderer>
          {showTaken && (
            <TakenTag
              style={{
                transform: `translate(${labelX}px, ${labelY - 12}px) scale(${gripScale})`,
              }}
            >
              <RemoteTag
                centred
                people={[
                  { user: takenBy.user, name: takenBy.name, editing: true },
                ]}
              />
            </TakenTag>
          )}
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
                saveOnReadOnly={readOnlyForLayout}
                multiline={false}
                maxLength={MAX_LABEL_LENGTH}
                placeholder={t("whiteboard.line.labelPlaceholder", "Label")}
                lineId={id}
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
          {showGrips && (
            <EdgeGrip
              edgeId={id}
              end="source"
              x={params.sourceX}
              y={params.sourceY}
              scale={gripScale}
            />
          )}
          {showGrips && (
            <EdgeGrip
              edgeId={id}
              end="target"
              x={params.targetX}
              y={params.targetY}
              scale={gripScale}
            />
          )}
        </EdgeLabelRenderer>
      )}
    </>
  );
};

export default React.memo(WhiteboardEdge);
