import React from "react";
import styled from "styled-components";
import type { WhiteboardColour } from "../../../lib/models/WhiteboardNodes";
import { WhiteboardColours } from "../../../lib/models/WhiteboardNodes";

const Swatches = styled.div`
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: 6px;
  background: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.border};
  box-shadow: 0 2px 6px rgb(0 0 0 / 15%);
`;

const Swatch = styled.button<{ $colour: string; $active: boolean }>`
  width: 18px;
  height: 18px;
  border-radius: 50%;
  padding: 0;
  background: ${({ $colour }) => $colour};
  border: 2px solid
    ${({ $active, theme }) => ($active ? theme.colors.primary : "transparent")};
  outline: 1px solid rgb(0 0 0 / 15%);
`;

const ColourPicker = ({
  value,
  palette,
  onChange,
  fallback,
}: {
  value: WhiteboardColour | undefined;
  palette: Record<WhiteboardColour, string | undefined>;
  onChange: (colour: WhiteboardColour) => void;
  fallback: string;
}) => (
  <Swatches className="nodrag">
    {WhiteboardColours.map((colour) => (
      <Swatch
        key={colour}
        type="button"
        title={colour}
        aria-label={colour}
        $colour={palette[colour] ?? fallback}
        $active={colour === value}
        onClick={() => onChange(colour)}
      />
    ))}
  </Swatches>
);

export default React.memo(ColourPicker);
