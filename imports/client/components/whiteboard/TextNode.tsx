import type { Node, NodeProps } from "@xyflow/react";
import React from "react";
import styled from "styled-components";
import type { WhiteboardNodeType } from "../../../lib/models/WhiteboardNodes";
import useHoverIntent from "../../hooks/useHoverIntent";
import colors from "./colors";
import { CornerLockBadge } from "./LockBadge";
import NodeChrome from "./NodeChrome";
import NodeContributors from "./NodeContributors";
import NoteText from "./NoteText";

type TextNodeType = Node<{ doc: WhiteboardNodeType }, "text">;

const TextBox = styled.div<{ $color: string | undefined; $selected: boolean }>`
  position: relative;
  width: 100%;
  height: 100%;
  padding: 4px 6px;
  font-size: 22px;
  line-height: 1.3;
  color: ${({ $color, theme }) => $color ?? theme.colors.text};
  outline: ${({ $selected, theme }) =>
    $selected ? `2px dashed ${theme.colors.primary}` : "none"};
  border-radius: 4px;
`;

const Attribution = styled.div`
  position: absolute;
  right: 0;
  bottom: 100%;
`;

const TextNode = ({ id, data, selected }: NodeProps<TextNodeType>) => {
  const hover = useHoverIntent();
  const { doc } = data;

  return (
    <TextBox
      $color={doc.color ? colors.stroke[doc.color] : undefined}
      $selected={selected}
      onMouseEnter={hover.onMouseEnter}
      onMouseLeave={hover.onMouseLeave}
    >
      <NodeChrome
        id={id}
        kind="text"
        selected={selected}
        locked={!!doc.locked}
        color={doc.color}
        palette={colors.stroke}
        fallback="currentColor"
      />
      <NoteText id={id} text={doc.text} locked={!!doc.locked} />
      {(hover.hovered || selected) && (
        <Attribution>
          <NodeContributors contributors={doc.contributors} />
        </Attribution>
      )}
      {doc.locked && <CornerLockBadge lockedBy={doc.lockedBy} />}
    </TextBox>
  );
};

export default React.memo(TextNode);
