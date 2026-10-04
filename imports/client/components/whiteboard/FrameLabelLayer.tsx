import { useTracker } from "meteor/react-meteor-data";
import { faCheck } from "@fortawesome/free-solid-svg-icons/faCheck";
import { faLock } from "@fortawesome/free-solid-svg-icons/faLock";
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
import CollapseContext from "./CollapseContext";
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

const LockIcon = styled(FontAwesomeIcon)`
  font-size: 0.6em;
  vertical-align: 0.15em;
  color: ${({ theme }) => theme.colors.textSecondary};
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
  const { summaries } = useContext(CollapseContext);

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
        const above = parents.has(frame.id);
        const round = rounds.get(frame.id);
        const summary = frame.data.collapsed
          ? summaries.get(frame.id)
          : undefined;
        let fontSize: number;
        let bandHeight: number;
        let text: React.ReactNode;
        if (summary) {
          // A collapsed frame is only a header high, so its label goes by
          // its width, and carries its count at any depth.
          fontSize = Math.min(28 / zoom, width / 6);
          bandHeight = fontSize * 1.6;
          const total = summary.solved + summary.unsolved;
          text =
            total > 0
              ? t(
                  "whiteboard.frame.collapsedLabel",
                  "{{label}} ({{solved}}/{{total}})",
                  {
                    label,
                    solved: summary.solved,
                    total,
                    // React escapes text, so i18next's escaping would only
                    // show entities. Goes once both i18n inits stop escaping.
                    interpolation: { escapeValue: false },
                  },
                )
              : label;
        } else {
          fontSize = Math.min(28 / zoom, height / 4);
          bandHeight = above ? fontSize * 1.6 : Math.min(height, 160 / zoom);
          const cardCount = round
            ? round.cards.solved + round.cards.unsolved
            : 0;
          const count =
            round && cardCount > 0
              ? t("whiteboard.frame.solvedShort", "{{solved}}/{{total}}", {
                  solved: round.cards.solved,
                  total: cardCount,
                })
              : undefined;
          text = (
            <>
              {label}
              {count && <Count> {count}</Count>}
            </>
          );
        }
        const top = above && !summary ? y - bandHeight : y;
        return (
          <Label
            key={frame.id}
            style={{
              transform: `translate(${x}px, ${top}px)`,
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
              {text}
              {doc.locked && (
                <>
                  {" "}
                  <LockIcon className="jr-frame-lock" icon={faLock} />
                  <span className="visually-hidden">
                    {t("whiteboard.lock.locked", "Locked")}
                  </span>
                </>
              )}
            </Pill>
          </Label>
        );
      })}
    </ViewportPortal>
  );
};

export default React.memo(FrameLabelLayer);
