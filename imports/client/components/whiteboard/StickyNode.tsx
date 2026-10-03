import type { Node, NodeProps } from "@xyflow/react";
import React from "react";
import styled from "styled-components";
import type { WhiteboardNodeType } from "../../../lib/models/WhiteboardNodes";
import { FILL_COLORS } from "./colors";
import NodeChrome from "./NodeChrome";
import NodeContributors from "./NodeContributors";
import NoteText from "./NoteText";

type StickyNodeType = Node<{ doc: WhiteboardNodeType }, "sticky">;

const Paper = styled.div<{ $fill: string; $dark: boolean; $selected: boolean }>`
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 10px 12px 6px;
  background: ${({ $fill }) => $fill};
  color: ${({ $dark }) => ($dark ? "#f8f9fa" : "#212529")};
  border-radius: 2px;
  font-size: 15px;
  line-height: 1.35;
  box-shadow: ${({ $selected, theme }) =>
    $selected
      ? `0 0 0 2px ${theme.colors.primary}`
      : "0 2px 6px rgb(0 0 0 / 20%)"};
`;

const Body = styled.div`
  flex: 1 1 auto;
  min-height: 0;
`;

// Overlaid in the corner rather than taking a row, so the larger avatars at
// mid zoom don't squeeze the note's text.
const Attribution = styled.div`
  position: absolute;
  right: 4px;
  bottom: 4px;
`;

const StickyNode = ({ id, data, selected }: NodeProps<StickyNodeType>) => {
  const { doc } = data;
  const color = doc.colour ?? "yellow";

  return (
    <Paper
      $fill={FILL_COLORS[color]}
      $dark={color === "black"}
      $selected={selected}
    >
      <NodeChrome
        id={id}
        kind="sticky"
        selected={selected}
        color={color}
        palette={FILL_COLORS}
      />
      <Body>
        <NoteText id={id} text={doc.text} />
      </Body>
      <Attribution>
        <NodeContributors contributors={doc.contributors} />
      </Attribution>
    </Paper>
  );
};

export default React.memo(StickyNode);
