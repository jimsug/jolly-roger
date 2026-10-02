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
import { STROKE_COLOURS } from "./colours";
import EditableText from "./EditableText";
import NodeContributors from "./NodeContributors";
import NodeHandles from "./NodeHandles";
import useHoverIntent from "./useHoverIntent";
import { useWhiteboard } from "./WhiteboardContext";

export type TextNodeType = Node<{ doc: WhiteboardNodeType }, "text">;

const TextBox = styled.div<{ $colour: string | undefined; $selected: boolean }>`
  position: relative;
  width: 100%;
  height: 100%;
  padding: 4px 6px;
  font-size: 22px;
  line-height: 1.3;
  color: ${({ $colour, theme }) => $colour ?? theme.colors.text};
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
  const {
    readOnly,
    updateNodes,
    persistResize,
    beginInteraction,
    editOnAppear,
    clearEditOnAppear,
  } = useWhiteboard();
  const hover = useHoverIntent();
  const { doc } = data;

  const onText = useCallback(
    (text: string) => updateNodes([{ _id: id, text: text || null }]),
    [id, updateNodes],
  );
  const onColour = useCallback(
    (colour: WhiteboardColour) => updateNodes([{ _id: id, colour }]),
    [id, updateNodes],
  );
  const onResizeEnd = useCallback(() => persistResize(id), [id, persistResize]);

  return (
    <TextBox
      $colour={doc.colour ? STROKE_COLOURS[doc.colour] : undefined}
      $selected={!!selected}
      onMouseEnter={hover.onMouseEnter}
      onMouseLeave={hover.onMouseLeave}
    >
      {!readOnly && (
        <NodeResizer
          isVisible={!!selected}
          minWidth={60}
          minHeight={32}
          onResizeStart={beginInteraction}
          onResizeEnd={onResizeEnd}
        />
      )}
      {!readOnly && (
        <NodeToolbar position={Position.Top}>
          <ColourPicker
            value={doc.colour}
            palette={STROKE_COLOURS}
            onChange={onColour}
            fallback="currentColor"
          />
        </NodeToolbar>
      )}
      <NodeHandles />
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
      {(hover.hovered || selected) && (
        <Attribution>
          <NodeContributors contributors={doc.contributors} />
        </Attribution>
      )}
    </TextBox>
  );
};

export default React.memo(TextNode);
