import { useTracker } from "meteor/react-meteor-data";
import type { Node, NodeProps } from "@xyflow/react";
import { NodeResizer, NodeToolbar, Position } from "@xyflow/react";
import React, { useCallback } from "react";
import styled from "styled-components";
import Tags from "../../../lib/models/Tags";
import type {
  WhiteboardColour,
  WhiteboardNodeType,
} from "../../../lib/models/WhiteboardNodes";
import {
  CARD_HEIGHT,
  frameLabelForTag,
  UNGROUPED_LABEL,
} from "../../../lib/whiteboard/layout";
import { MAX_LABEL_LENGTH } from "../../../lib/whiteboard/limits";
import ColourPicker from "./ColourPicker";
import { FILL_COLOURS } from "./colours";
import EditableText from "./EditableText";
import NodeContributors from "./NodeContributors";
import NodeHandles from "./NodeHandles";
import useDetail from "./useDetail";
import { useWhiteboard } from "./WhiteboardContext";

export type FrameNodeType = Node<{ doc: WhiteboardNodeType }, "frame">;

const FrameBox = styled.div<{ $fill: string | undefined; $selected: boolean }>`
  width: 100%;
  height: 100%;
  border-radius: 10px;
  border: 1px solid
    ${({ theme, $selected }) =>
      $selected ? theme.colors.primary : theme.colors.border};
  background: ${({ $fill }) =>
    $fill ? `${$fill}66` : "rgb(128 128 128 / 7%)"};
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  height: 48px;
  padding: 0 16px;
  font-size: 18px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
  overflow: hidden;
  white-space: nowrap;
`;

const Label = styled.div`
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const FrameNode = ({ id, data, selected }: NodeProps<FrameNodeType>) => {
  const {
    readOnly,
    updateNodes,
    persistResize,
    editOnAppear,
    clearEditOnAppear,
  } = useWhiteboard();
  const detail = useDetail();
  const { doc } = data;

  const tagName = useTracker(
    () => (doc.tag ? Tags.findOne(doc.tag)?.name : undefined),
    [doc.tag],
  );
  const label = tagName
    ? frameLabelForTag({ name: tagName })
    : (doc.label ??
      (doc.frameKind === "ungrouped" ? UNGROUPED_LABEL : undefined));

  const onLabel = useCallback(
    (text: string) => updateNodes([{ _id: id, label: text || null }]),
    [id, updateNodes],
  );
  const onColour = useCallback(
    (colour: WhiteboardColour) => updateNodes([{ _id: id, colour }]),
    [id, updateNodes],
  );
  const onResizeEnd = useCallback(() => persistResize(id), [id, persistResize]);

  const fill = doc.colour ? FILL_COLOURS[doc.colour] : undefined;
  // Seeded frames take their name from the tag, so only hand-made frames
  // have an editable label.
  const editable = doc.frameKind === "user" && !readOnly;

  return (
    <FrameBox $fill={fill} $selected={!!selected}>
      {!readOnly && (
        <NodeResizer
          isVisible={!!selected}
          minWidth={CARD_HEIGHT}
          minHeight={CARD_HEIGHT}
          onResizeEnd={onResizeEnd}
        />
      )}
      {!readOnly && (
        <NodeToolbar position={Position.Top}>
          <ColourPicker
            value={doc.colour}
            palette={FILL_COLOURS}
            onChange={onColour}
            fallback="transparent"
          />
        </NodeToolbar>
      )}
      <NodeHandles />
      {detail === "far" ? null : (
        <Header>
          <Label>
            {editable ? (
              <EditableText
                value={doc.label}
                onCommit={onLabel}
                readOnly={readOnly}
                multiline={false}
                maxLength={MAX_LABEL_LENGTH}
                placeholder="Frame"
                startEditing={editOnAppear === id}
                onStartedEditing={clearEditOnAppear}
              />
            ) : (
              label
            )}
          </Label>
          <NodeContributors contributors={doc.contributors} />
        </Header>
      )}
    </FrameBox>
  );
};

export default React.memo(FrameNode);
