import { Panel } from "@xyflow/react";
import { useCallback } from "react";
import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import { useTranslation } from "react-i18next";
import type {
  AlignMode,
  DistributeAxis,
} from "../../../lib/whiteboard/arrange";
import ArrangeIcon from "./ArrangeIcon";
import { NO_ESCAPE, ToolBox } from "./canvasChrome";

// Lines up or spaces out the selection one way.
const ArrangeButton = <Kind extends AlignMode | DistributeAxis>({
  kind,
  title,
  label,
  disabled,
  onArrange,
}: {
  kind: Kind;
  title: string;
  label: string;
  disabled?: boolean;
  onArrange: (kind: Kind) => void;
}) => {
  const onClick = useCallback(() => onArrange(kind), [onArrange, kind]);
  return (
    <Button
      variant="outline-secondary"
      title={title}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <ArrangeIcon kind={kind} />
    </Button>
  );
};

// The Align and Distribute buttons, shown over the board while two or more
// things are selected. Distributing needs three.
const ArrangeToolbar = ({
  selectedUnitCount,
  onArrange,
}: {
  selectedUnitCount: number;
  onArrange: (kind: AlignMode | DistributeAxis) => void;
}) => {
  const { t } = useTranslation();
  const alignModes = [
    ["left", t("whiteboard.arrange.left", "Align left edges")],
    ["center", t("whiteboard.arrange.center", "Align centres horizontally")],
    ["right", t("whiteboard.arrange.right", "Align right edges")],
    ["top", t("whiteboard.arrange.top", "Align top edges")],
    ["middle", t("whiteboard.arrange.middle", "Align centres vertically")],
    ["bottom", t("whiteboard.arrange.bottom", "Align bottom edges")],
  ] as const;
  const distributeAxes = [
    [
      "horizontal",
      t("whiteboard.arrange.horizontal", "Space evenly left to right"),
    ],
    [
      "vertical",
      t("whiteboard.arrange.vertical", "Space evenly top to bottom"),
    ],
  ] as const;
  return (
    <Panel position="top-center">
      <ToolBox>
        <ButtonGroup
          size="sm"
          aria-label={t("whiteboard.arrange.align", "Align")}
        >
          {alignModes.map(([mode, title]) => (
            <ArrangeButton
              key={mode}
              kind={mode}
              title={title}
              label={title}
              onArrange={onArrange}
            />
          ))}
        </ButtonGroup>
        <ButtonGroup
          size="sm"
          aria-label={t("whiteboard.arrange.distribute", "Distribute")}
        >
          {distributeAxes.map(([axis, title]) => (
            <ArrangeButton
              key={axis}
              kind={axis}
              title={
                selectedUnitCount < 3
                  ? t(
                      "whiteboard.arrange.needThree",
                      "{{action}} (select three or more)",
                      { action: title, ...NO_ESCAPE },
                    )
                  : title
              }
              label={title}
              disabled={selectedUnitCount < 3}
              onArrange={onArrange}
            />
          ))}
        </ButtonGroup>
      </ToolBox>
    </Panel>
  );
};

export default ArrangeToolbar;
