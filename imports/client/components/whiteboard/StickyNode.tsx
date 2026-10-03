import type { Node, NodeProps } from "@xyflow/react";
import { NodeResizer, NodeToolbar, Position } from "@xyflow/react";
import React, { useCallback } from "react";
import styled from "styled-components";
import type {
  WhiteboardColour,
  WhiteboardNodeType,
} from "../../../lib/models/WhiteboardNodes";
import { MAX_TEXT_LENGTH } from "../../../lib/whiteboard/limits";
import ColourPicker from "./ColourPicker";
import { FILL_COLOURS } from "./colours";
import EditableText from "./EditableText";
import NodeContributors from "./NodeContributors";
import NodeHandles from "./NodeHandles";
import useDetail from "./useDetail";
import { useWhiteboard } from "./WhiteboardContext";

export type StickyNodeType = Node<{ doc: WhiteboardNodeType }, "sticky">;

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
  const {
    readOnly,
    updateNodes,
    persistResize,
    editOnAppear,
    clearEditOnAppear,
  } = useWhiteboard();
  const detail = useDetail();
  const { doc } = data;
  const colour = doc.colour ?? "yellow";

  const onText = useCallback(
    (text: string) => updateNodes([{ _id: id, text: text || null }]),
    [id, updateNodes],
  );
  const onColour = useCallback(
    (next: WhiteboardColour) => updateNodes([{ _id: id, colour: next }]),
    [id, updateNodes],
  );
  const onResizeEnd = useCallback(() => persistResize(id), [id, persistResize]);

  return (
    <Paper
      $fill={FILL_COLOURS[colour]}
      $dark={colour === "black"}
      $selected={!!selected}
    >
      {!readOnly && (
        <NodeResizer
          isVisible={!!selected}
          minWidth={80}
          minHeight={60}
          onResizeEnd={onResizeEnd}
        />
      )}
      {!readOnly && (
        <NodeToolbar position={Position.Top}>
          <ColourPicker
            value={colour}
            palette={FILL_COLOURS}
            onChange={onColour}
            fallback="transparent"
          />
        </NodeToolbar>
      )}
      <NodeHandles />
      <Body>
        <EditableText
          value={doc.text}
          onCommit={onText}
          readOnly={readOnly}
          multiline
          markdown
          maxLength={MAX_TEXT_LENGTH}
          placeholder="Double-click to write"
          startEditing={editOnAppear === id}
          onStartedEditing={clearEditOnAppear}
        />
      </Body>
      {detail !== "far" && (
        <Attribution>
          <NodeContributors contributors={doc.contributors} />
        </Attribution>
      )}
    </Paper>
  );
};

export default React.memo(StickyNode);
