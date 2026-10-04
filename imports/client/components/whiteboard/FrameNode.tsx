import { useTracker } from "meteor/react-meteor-data";
import { faCheck } from "@fortawesome/free-solid-svg-icons/faCheck";
import { faStar } from "@fortawesome/free-solid-svg-icons/faStar";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { Node, NodeProps } from "@xyflow/react";
import React, { useCallback, useContext } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import Tags from "../../../lib/models/Tags";
import type { WhiteboardNodeType } from "../../../lib/models/WhiteboardNodes";
import { frameLabel } from "../../../lib/whiteboard/layout";
import { MAX_LABEL_LENGTH } from "../../../lib/whiteboard/limits";
import useWhiteboardDetail from "../../hooks/useWhiteboardDetail";
import colors from "./colors";
import EditableText from "./EditableText";
import NodeChrome from "./NodeChrome";
import NodeContributors from "./NodeContributors";
import RoundStateContext from "./RoundStateContext";
import { useWhiteboard } from "./WhiteboardContext";

type FrameNodeType = Node<{ doc: WhiteboardNodeType }, "frame">;

// A finished round's fill drops from 40% to 20%, so it recedes.
const FrameBox = styled.div<{
  $fill: string | undefined;
  $selected: boolean;
  $finished: boolean;
}>`
  width: 100%;
  height: 100%;
  border-radius: 10px;
  border: 1px solid
    ${({ theme, $selected }) =>
      $selected ? theme.colors.primary : theme.colors.border};
  background: ${({ $fill, $finished }) => {
    if ($fill) return `${$fill}${$finished ? "33" : "66"}`;
    return $finished ? "rgb(128 128 128 / 4%)" : "rgb(128 128 128 / 7%)";
  }};
`;

const Header = styled.div<{ $finished: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  height: 48px;
  padding: 0 16px;
  font-size: 18px;
  font-weight: 600;
  color: ${({ theme, $finished }) =>
    $finished ? theme.colors.textSecondary : theme.colors.text};
  overflow: hidden;
  white-space: nowrap;
`;

const FinishedTick = styled(FontAwesomeIcon)`
  flex: 0 0 auto;
  color: ${({ theme }) => theme.colors.whiteboardFinishedTick};
`;

// The status gives way before the round's name does in a narrow frame.
const Progress = styled.span`
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 14px;
  font-weight: normal;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

// The card meta badge's colours, as this round's meta is next.
const ReadyToMeta = styled.span`
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 0 8px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: bold;
  background: ${({ theme }) => theme.colors.metaBadgeBackground};
  color: ${({ theme }) => theme.colors.metaBadgeText};
`;

const Label = styled.div`
  flex: 1 1 auto;
  min-width: 4em;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const FrameNode = ({ id, data, selected }: NodeProps<FrameNodeType>) => {
  const { readOnly, updateNodes, editOnAppear, clearEditOnAppear } =
    useWhiteboard();
  const detail = useWhiteboardDetail();
  const { t } = useTranslation();
  const { doc } = data;

  const tagName = useTracker(
    () => (doc.tag ? Tags.findOne(doc.tag)?.name : undefined),
    [doc.tag],
  );
  const label = frameLabel(doc, tagName);
  const round = useContext(RoundStateContext).get(id);
  const finished = !!round?.finished;
  const cardCount = round ? round.cards.solved + round.cards.unsolved : 0;
  // A finished round says so in place of its count, since its unsolved
  // count covers nested frames and the count doesn't.
  let roundStatus: React.ReactNode = null;
  if (round?.finished) {
    roundStatus = (
      <Progress>
        {round.allCards.unsolved > 0
          ? t(
              "whiteboard.frame.finishedUnsolved",
              "Finished, {{count}} unsolved",
              {
                count: round.allCards.unsolved,
              },
            )
          : t("whiteboard.frame.finished", "Finished")}
      </Progress>
    );
  } else if (round?.readyToMeta) {
    roundStatus = (
      <ReadyToMeta>
        <FontAwesomeIcon icon={faStar} />{" "}
        {t("whiteboard.frame.readyToMeta", "Ready to meta")}
      </ReadyToMeta>
    );
  }

  const onLabel = useCallback(
    (text: string) => updateNodes([{ _id: id, label: text || null }]),
    [id, updateNodes],
  );
  const fill = doc.color ? colors.fill[doc.color] : undefined;
  // Seeded frames take their name from the tag, so only hand-made frames
  // have an editable label.
  const editable = doc.frameKind === "user" && !readOnly;

  return (
    <FrameBox $fill={fill} $selected={selected} $finished={finished}>
      <NodeChrome
        id={id}
        kind="frame"
        selected={selected}
        color={doc.color}
        palette={colors.fill}
      />
      {detail === "far" ? null : (
        <Header $finished={finished}>
          {finished && <FinishedTick icon={faCheck} />}
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
          {round && !finished && cardCount > 0 && (
            <Progress>
              {t("whiteboard.frame.solved", "{{solved}}/{{total}} solved", {
                solved: round.cards.solved,
                total: cardCount,
              })}
            </Progress>
          )}
          {roundStatus}
          <NodeContributors contributors={doc.contributors} />
        </Header>
      )}
    </FrameBox>
  );
};

export default React.memo(FrameNode);
