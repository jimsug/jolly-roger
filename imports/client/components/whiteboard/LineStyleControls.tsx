import React from "react";
import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import { useTheme } from "styled-components";
import type {
  WhiteboardArrowHead,
  WhiteboardPathStyle,
} from "../../../lib/models/WhiteboardEdges";
import {
  WhiteboardArrowHeads,
  WhiteboardPathStyles,
} from "../../../lib/models/WhiteboardEdges";
import type { WhiteboardColour } from "../../../lib/models/WhiteboardNodes";
import ColourPicker from "./ColourPicker";
import { STROKE_COLOURS } from "./colours";
import { ArrowHeadIcon, DashedIcon, PathStyleIcon } from "./LineStyleIcon";

export interface LineStyle {
  pathStyle: WhiteboardPathStyle;
  arrowHead: WhiteboardArrowHead;
  colour: WhiteboardColour;
  dashed: boolean;
}

export const DEFAULT_LINE_STYLE: LineStyle = {
  pathStyle: "curved",
  arrowHead: "end",
  colour: "black",
  dashed: false,
};

const PATH_TITLES: Record<WhiteboardPathStyle, string> = {
  curved: "Curved",
  straight: "Straight",
  elbow: "Elbow",
};
const ARROW_TITLES: Record<WhiteboardArrowHead, string> = {
  none: "No arrowheads",
  end: "Arrowhead at the end",
  both: "Arrowheads at both ends",
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
  return (
    <>
      <ButtonGroup size="sm" aria-label="Line path">
        {WhiteboardPathStyles.map((kind) => (
          <Button
            key={kind}
            variant={value.pathStyle === kind ? "primary" : "outline-secondary"}
            title={PATH_TITLES[kind]}
            aria-label={PATH_TITLES[kind]}
            onClick={() => onChange({ pathStyle: kind })}
          >
            <PathStyleIcon kind={kind} />
          </Button>
        ))}
      </ButtonGroup>
      <ButtonGroup size="sm" aria-label="Arrowheads">
        {WhiteboardArrowHeads.map((kind) => (
          <Button
            key={kind}
            variant={value.arrowHead === kind ? "primary" : "outline-secondary"}
            title={ARROW_TITLES[kind]}
            aria-label={ARROW_TITLES[kind]}
            onClick={() => onChange({ arrowHead: kind })}
          >
            <ArrowHeadIcon kind={kind} />
          </Button>
        ))}
      </ButtonGroup>
      <Button
        size="sm"
        variant={value.dashed ? "primary" : "outline-secondary"}
        title="Dashed"
        aria-label="Dashed"
        onClick={() => onChange({ dashed: !value.dashed })}
      >
        <DashedIcon />
      </Button>
      <ColourPicker
        value={value.colour}
        palette={STROKE_COLOURS}
        onChange={(colour) => onChange({ colour })}
        fallback={theme.colors.text}
      />
    </>
  );
};

export default React.memo(LineStyleControls);
