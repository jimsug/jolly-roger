import React, { useCallback } from "react";
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
import type { LineStyle } from "../../../lib/whiteboard/lineStyle";
import ColorPicker from "./ColorPicker";
import colors from "./colors";
import LineStyleIcon from "./LineStyleIcon";

export const DEFAULT_LINE_STYLE: LineStyle = {
  pathStyle: "curved",
  arrowHead: "end",
  color: "black",
  dashed: false,
};

// One choice among the styles, which sets that style when pressed.
const StyleButton = ({
  patch,
  active,
  title,
  onChange,
  children,
}: {
  patch: Partial<LineStyle>;
  active: boolean;
  title: string;
  onChange: (patch: Partial<LineStyle>) => void;
  children: React.ReactNode;
}) => {
  const onClick = useCallback(() => onChange(patch), [onChange, patch]);
  return (
    <Button
      variant={active ? "primary" : "outline-secondary"}
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </Button>
  );
};

const PATH_PATCHES: Record<WhiteboardPathStyle, Partial<LineStyle>> = {
  curved: { pathStyle: "curved" },
  straight: { pathStyle: "straight" },
  elbow: { pathStyle: "elbow" },
};
const ARROW_PATCHES: Record<WhiteboardArrowHead, Partial<LineStyle>> = {
  none: { arrowHead: "none" },
  end: { arrowHead: "end" },
  both: { arrowHead: "both" },
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
  const toggleDashed = useCallback(
    () => onChange({ dashed: !value.dashed }),
    [onChange, value.dashed],
  );
  const onColor = useCallback(
    (color: WhiteboardColor) => onChange({ color }),
    [onChange],
  );
  return (
    <>
      <ButtonGroup
        size="sm"
        aria-label={t("whiteboard.lineStyle.path", "Line path")}
      >
        {WhiteboardPathStyles.map((kind) => (
          <StyleButton
            key={kind}
            patch={PATH_PATCHES[kind]}
            active={value.pathStyle === kind}
            title={pathTitles[kind]}
            onChange={onChange}
          >
            <LineStyleIcon kind={kind} />
          </StyleButton>
        ))}
      </ButtonGroup>
      <ButtonGroup
        size="sm"
        aria-label={t("whiteboard.lineStyle.arrowheads", "Arrowheads")}
      >
        {WhiteboardArrowHeads.map((kind) => (
          <StyleButton
            key={kind}
            patch={ARROW_PATCHES[kind]}
            active={value.arrowHead === kind}
            title={arrowTitles[kind]}
            onChange={onChange}
          >
            <LineStyleIcon kind={kind} />
          </StyleButton>
        ))}
      </ButtonGroup>
      <Button
        size="sm"
        variant={value.dashed ? "primary" : "outline-secondary"}
        title={dashed}
        aria-label={dashed}
        aria-pressed={value.dashed}
        onClick={toggleDashed}
      >
        <LineStyleIcon kind="dashed" />
      </Button>
      <ColorPicker
        value={value.color}
        palette={colors.stroke}
        onChange={onColor}
        fallback={theme.colors.text}
      />
    </>
  );
};

export default React.memo(LineStyleControls);
