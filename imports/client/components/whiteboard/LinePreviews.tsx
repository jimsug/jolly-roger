import { ViewportPortal } from "@xyflow/react";
import { useTheme } from "styled-components";
import type { LineTool } from "../../hooks/useLineTool";
import { AttachOutline, LocalStroke } from "./canvasChrome";

// Drawn over the board while a line is being made: the line being drawn or
// the end being moved, a click-to-connect line waiting for its end, and the
// outline of what an end would attach to. Nothing while the board is being
// pictured.
const LinePreviews = ({
  lines,
  capturing,
}: {
  lines: LineTool;
  capturing: boolean;
}) => {
  const theme = useTheme();
  const {
    connecting,
    attachPreview,
    clickConnectStart,
    clickConnectOrigin,
    clickConnectPointer,
    lineAttached,
    lineFrom,
    lineTo,
    lineOrigin,
  } = lines;
  if (capturing) return null;
  return (
    <>
      {lineFrom && lineTo && (
        <ViewportPortal>
          <LocalStroke>
            {lineOrigin && <AttachOutline key={lineOrigin} id={lineOrigin} />}
            {lineAttached && lineAttached !== lineOrigin && (
              <AttachOutline key={lineAttached} id={lineAttached} />
            )}
            <line
              x1={lineFrom.x}
              y1={lineFrom.y}
              x2={lineTo.x}
              y2={lineTo.y}
              stroke={theme.colors.primary}
              strokeWidth={2}
              strokeDasharray="6 4"
            />
            <circle
              cx={lineTo.x}
              cy={lineTo.y}
              r={4}
              fill={theme.colors.primary}
            />
          </LocalStroke>
        </ViewportPortal>
      )}
      {clickConnectStart && clickConnectOrigin && (
        <ViewportPortal>
          <LocalStroke className="jr-click-connect">
            <AttachOutline id={clickConnectStart.nodeId} />
            {clickConnectPointer && (
              <line
                x1={clickConnectOrigin.x}
                y1={clickConnectOrigin.y}
                x2={clickConnectPointer.x}
                y2={clickConnectPointer.y}
                stroke={theme.colors.primary}
                strokeWidth={2}
                strokeDasharray="6 4"
              />
            )}
          </LocalStroke>
        </ViewportPortal>
      )}
      {!connecting && attachPreview && (
        <ViewportPortal>
          <LocalStroke>
            <AttachOutline id={attachPreview} />
          </LocalStroke>
        </ViewportPortal>
      )}
    </>
  );
};

export default LinePreviews;
