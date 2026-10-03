import React, { useCallback } from "react";
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

const ColorSwatch = ({
  color,
  name,
  fill,
  active,
  onChange,
}: {
  color: WhiteboardColor;
  name: string;
  fill: string | undefined;
  active: boolean;
  onChange: (color: WhiteboardColor) => void;
}) => {
  const onClick = useCallback(() => onChange(color), [onChange, color]);
  return (
    <Swatch
      type="button"
      title={name}
      aria-label={name}
      aria-pressed={active}
      $color={fill}
      $active={active}
      onClick={onClick}
    />
  );
};

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
    yellow: t("whiteboard.color.yellow", "Yellow"),
    orange: t("whiteboard.color.orange", "Orange"),
    red: t("whiteboard.color.red", "Red"),
    pink: t("whiteboard.color.pink", "Pink"),
    purple: t("whiteboard.color.purple", "Purple"),
    blue: t("whiteboard.color.blue", "Blue"),
    green: t("whiteboard.color.green", "Green"),
    gray: t("whiteboard.color.gray", "Grey"),
    black: t("whiteboard.color.black", "Black"),
  };
  return (
    <Swatches className="nodrag">
      {WhiteboardColors.map((color) => (
        <ColorSwatch
          key={color}
          color={color}
          name={names[color]}
          fill={palette[color] ?? fallback}
          active={color === value}
          onChange={onChange}
        />
      ))}
    </Swatches>
  );
};

export default React.memo(ColorPicker);
