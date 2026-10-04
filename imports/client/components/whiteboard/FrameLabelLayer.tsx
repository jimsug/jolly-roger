import { useTracker } from "meteor/react-meteor-data";
import { faCheck } from "@fortawesome/free-solid-svg-icons/faCheck";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { InternalNode } from "@xyflow/react";
import { useStore, ViewportPortal } from "@xyflow/react";
import React, { useContext } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import Tags from "../../../lib/models/Tags";
import { frameLabel } from "../../../lib/whiteboard/layout";
import useWhiteboardDetail, {
  useWhiteboardZoom,
} from "../../hooks/useWhiteboardDetail";
import type { WhiteboardFlowNode } from "../../hooks/useWhiteboardSync";
import RoundStateContext from "./RoundStateContext";

const Label = styled.div`
  position: absolute;
  left: 0;
  top: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 900;
`;

const Pill = styled.span<{ $finished: boolean }>`
  max-width: 100%;
  padding: 0.1em 0.4em;
  border-radius: 0.3em;
  font-weight: 700;
  line-height: 1.1;
  text-align: center;
  overflow-wrap: anywhere;
  color: ${({ theme, $finished }) =>
    $finished ? theme.colors.textSecondary : theme.colors.text};

  /* The theme's background is a CSS variable, so it can't take an alpha
     suffix. */
  background: color-mix(
    in srgb,
    ${({ theme }) => theme.colors.background} 80%,
    transparent
  );
`;

const Count = styled.span`
  font-weight: normal;
`;

const FinishedTick = styled(FontAwesomeIcon)`
  color: ${({ theme }) => theme.colors.whiteboardFinishedTick};
`;

// A frame, with the document every node on the board carries (see
// useWhiteboardSync).
const isFrame = (
  node: InternalNode,
): node is InternalNode<WhiteboardFlowNode> =>
  node.type === "frame" && "doc" in node.data;

// Kept the same between renders, so a store change while the board isn't
// zoomed right out doesn't re-render the layer.
const NO_FRAMES: InternalNode<WhiteboardFlowNode>[] = [];

// Zoomed right out, cards are too small to read, so each round's name is
// drawn large over its frame instead.
const FrameLabelLayer = () => {
  const detail = useWhiteboardDetail();
  const zoom = useWhiteboardZoom();
  const frames = useStore((s) =>
    detail === "far" ? [...s.nodeLookup.values()].filter(isFrame) : NO_FRAMES,
  );
  const tagNames = useTracker(
    () => new Map(Tags.find().map((tag) => [tag._id, tag.name])),
    [],
  );
  const { t } = useTranslation();
  const rounds = useContext(RoundStateContext);

  if (detail !== "far") return null;

  // A frame with frames inside it gets its label just above its top edge, so
  // it doesn't collide with its first sub-round's label.
  const parents = new Set(frames.map((f) => f.parentId).filter(Boolean));

  return (
    <ViewportPortal>
      {frames.map((frame) => {
        const { doc } = frame.data;
        const label = frameLabel(
          doc,
          doc.tag ? tagNames.get(doc.tag) : undefined,
        );
        if (!label) return null;
        const width = frame.measured.width ?? frame.width ?? 0;
        const height = frame.measured.height ?? frame.height ?? 0;
        const { x, y } = frame.internals.positionAbsolute;
        const fontSize = Math.min(28 / zoom, height / 4);
        const above = parents.has(frame.id);
        const round = rounds.get(frame.id);
        const cardCount = round ? round.cards.solved + round.cards.unsolved : 0;
        const count =
          round && cardCount > 0
            ? t("whiteboard.frame.solvedShort", "{{solved}}/{{total}}", {
                solved: round.cards.solved,
                total: cardCount,
              })
            : undefined;
        const bandHeight = above
          ? fontSize * 1.6
          : Math.min(height, 160 / zoom);
        return (
          <Label
            key={frame.id}
            style={{
              transform: `translate(${x}px, ${above ? y - bandHeight : y}px)`,
              width,
              height: bandHeight,
              fontSize,
            }}
          >
            <Pill $finished={!!round?.finished}>
              {round?.finished && (
                <>
                  <FinishedTick icon={faCheck} />
                  <span className="visually-hidden">
                    {t("whiteboard.frame.finished", "Finished")}
                  </span>{" "}
                </>
              )}
              {label}
              {count && <Count> {count}</Count>}
            </Pill>
          </Label>
        );
      })}
    </ViewportPortal>
  );
};

export default React.memo(FrameLabelLayer);
