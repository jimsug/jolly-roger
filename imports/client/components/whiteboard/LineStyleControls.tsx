import React from "react";
import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import { useTranslation } from "react-i18next";
import { useTheme } from "styled-components";
import type {
  WhiteboardArrowHead,
  WhiteboardPathStyle,
} from "../../../lib/models/WhiteboardEdges";
import {
  WhiteboardArrowHeads,
  WhiteboardPathStyles,
} from "../../../lib/models/WhiteboardEdges";
import type { WhiteboardColor } from "../../../lib/models/WhiteboardNodes";
import ColorPicker from "./ColorPicker";
import { STROKE_COLORS } from "./colors";
import { ArrowHeadIcon, DashedIcon, PathStyleIcon } from "./LineStyleIcon";

export interface LineStyle {
  pathStyle: WhiteboardPathStyle;
  arrowHead: WhiteboardArrowHead;
  colour: WhiteboardColor;
  dashed: boolean;
}

export const DEFAULT_LINE_STYLE: LineStyle = {
  pathStyle: "curved",
  arrowHead: "end",
  colour: "black",
  dashed: false,
};

// Path, arrowheads, dashes and colour, for the line tool and for restyling
// selected lines.
const LineStyleControls = ({
  value,
  onChange,
}: {
  value: LineStyle;
  onChange: (patch: Partial<LineStyle>) => void;
}) => {
  const theme = useTheme();
  const { t } = useTranslation();
  const pathTitles: Record<WhiteboardPathStyle, string> = {
    curved: t("whiteboard.lineStyle.curved", "Curved"),
    straight: t("whiteboard.lineStyle.straight", "Straight"),
    elbow: t("whiteboard.lineStyle.elbow", "Elbow"),
  };
  const arrowTitles: Record<WhiteboardArrowHead, string> = {
    none: t("whiteboard.lineStyle.noArrowheads", "No arrowheads"),
    end: t("whiteboard.lineStyle.arrowheadAtEnd", "Arrowhead at the end"),
    both: t(
      "whiteboard.lineStyle.arrowheadsAtBothEnds",
      "Arrowheads at both ends",
    ),
  };
  const dashed = t("whiteboard.lineStyle.dashed", "Dashed");
  return (
    <>
      <ButtonGroup
        size="sm"
        aria-label={t("whiteboard.lineStyle.path", "Line path")}
      >
        {WhiteboardPathStyles.map((kind) => (
          <Button
            key={kind}
            variant={value.pathStyle === kind ? "primary" : "outline-secondary"}
            title={pathTitles[kind]}
            aria-label={pathTitles[kind]}
            onClick={() => onChange({ pathStyle: kind })}
          >
            <PathStyleIcon kind={kind} />
          </Button>
        ))}
      </ButtonGroup>
      <ButtonGroup
        size="sm"
        aria-label={t("whiteboard.lineStyle.arrowheads", "Arrowheads")}
      >
        {WhiteboardArrowHeads.map((kind) => (
          <Button
            key={kind}
            variant={value.arrowHead === kind ? "primary" : "outline-secondary"}
            title={arrowTitles[kind]}
            aria-label={arrowTitles[kind]}
            onClick={() => onChange({ arrowHead: kind })}
          >
            <ArrowHeadIcon kind={kind} />
          </Button>
        ))}
      </ButtonGroup>
      <Button
        size="sm"
        variant={value.dashed ? "primary" : "outline-secondary"}
        title={dashed}
        aria-label={dashed}
        onClick={() => onChange({ dashed: !value.dashed })}
      >
        <DashedIcon />
      </Button>
      <ColorPicker
        value={value.colour}
        palette={STROKE_COLORS}
        onChange={(colour) => onChange({ colour })}
        fallback={theme.colors.text}
      />
    </>
  );
};

export default React.memo(LineStyleControls);
