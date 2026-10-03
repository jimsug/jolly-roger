import { useTracker } from "meteor/react-meteor-data";
import type { Node, NodeProps } from "@xyflow/react";
import React, { useCallback } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import Tags from "../../../lib/models/Tags";
import type { WhiteboardNodeType } from "../../../lib/models/WhiteboardNodes";
import { frameLabel } from "../../../lib/whiteboard/layout";
import { MAX_LABEL_LENGTH } from "../../../lib/whiteboard/limits";
import { FILL_COLORS } from "./colors";
import EditableText from "./EditableText";
import NodeChrome from "./NodeChrome";
import NodeContributors from "./NodeContributors";
import useDetail from "./useDetail";
import { useWhiteboard } from "./WhiteboardContext";

type FrameNodeType = Node<{ doc: WhiteboardNodeType }, "frame">;

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
  const { readOnly, updateNodes, editOnAppear, clearEditOnAppear } =
    useWhiteboard();
  const detail = useDetail();
  const { t } = useTranslation();
  const { doc } = data;

  const tagName = useTracker(
    () => (doc.tag ? Tags.findOne(doc.tag)?.name : undefined),
    [doc.tag],
  );
  const label = frameLabel(doc, tagName);

  const onLabel = useCallback(
    (text: string) => updateNodes([{ _id: id, label: text || null }]),
    [id, updateNodes],
  );
  const fill = doc.colour ? FILL_COLORS[doc.colour] : undefined;
  // Seeded frames take their name from the tag, so only hand-made frames
  // have an editable label.
  const editable = doc.frameKind === "user" && !readOnly;

  return (
    <FrameBox $fill={fill} $selected={selected}>
      <NodeChrome
        id={id}
        kind="frame"
        selected={selected}
        color={doc.colour}
        palette={FILL_COLORS}
      />
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
                placeholder={t("whiteboard.frame.placeholder", "Frame")}
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
