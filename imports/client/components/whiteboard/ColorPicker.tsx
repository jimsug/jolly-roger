import React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import type { WhiteboardColor } from "../../../lib/models/WhiteboardNodes";
import { WhiteboardColors } from "../../../lib/models/WhiteboardNodes";

const Swatches = styled.div`
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: 6px;
  background: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.border};
  box-shadow: 0 2px 6px rgb(0 0 0 / 15%);
`;

const Swatch = styled.button<{ $color: string | undefined; $active: boolean }>`
  width: 18px;
  height: 18px;
  border-radius: 50%;
  padding: 0;
  background: ${({ $color }) => $color};
  border: 2px solid
    ${({ $active, theme }) => ($active ? theme.colors.primary : "transparent")};
  outline: 1px solid rgb(0 0 0 / 15%);
`;

const ColorPicker = ({
  value,
  palette,
  onChange,
  fallback,
}: {
  value: WhiteboardColor | undefined;
  palette: Record<WhiteboardColor, string | undefined>;
  onChange: (color: WhiteboardColor) => void;
  // For a palette with gaps
  fallback?: string;
}) => {
  const { t } = useTranslation();
  const names: Record<WhiteboardColor, string> = {
    yellow: t("whiteboard.color.yellow", "yellow"),
    orange: t("whiteboard.color.orange", "orange"),
    red: t("whiteboard.color.red", "red"),
    pink: t("whiteboard.color.pink", "pink"),
    purple: t("whiteboard.color.purple", "purple"),
    blue: t("whiteboard.color.blue", "blue"),
    green: t("whiteboard.color.green", "green"),
    grey: t("whiteboard.color.grey", "grey"),
    black: t("whiteboard.color.black", "black"),
  };
  return (
    <Swatches className="nodrag">
      {WhiteboardColors.map((color) => (
        <Swatch
          key={color}
          type="button"
          title={names[color]}
          aria-label={names[color]}
          $color={palette[color] ?? fallback}
          $active={color === value}
          onClick={() => onChange(color)}
        />
      ))}
    </Swatches>
  );
};

export default React.memo(ColorPicker);
