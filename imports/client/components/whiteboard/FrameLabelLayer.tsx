import { useTracker } from "meteor/react-meteor-data";
import { useStore, ViewportPortal } from "@xyflow/react";
import React from "react";
import styled from "styled-components";
import Tags from "../../../lib/models/Tags";
import {
  frameLabelForTag,
  UNGROUPED_LABEL,
} from "../../../lib/whiteboard/layout";
import useDetail, { useZoom } from "./useDetail";
import type { WhiteboardFlowNode } from "./useWhiteboardSync";

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

const Pill = styled.span`
  max-width: 100%;
  padding: 0.1em 0.4em;
  border-radius: 0.3em;
  font-weight: 700;
  line-height: 1.1;
  text-align: center;
  overflow-wrap: anywhere;
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.background}cc;
`;

// Zoomed right out, cards are too small to read, so each round's name is
// drawn large over its frame instead.
const FrameLabelLayer = () => {
  const detail = useDetail();
  const zoom = useZoom();
  const frames = useStore((s) =>
    detail === "far"
      ? [...s.nodeLookup.values()].filter((n) => n.type === "frame")
      : [],
  );
  const tagNames = useTracker(
    () => new Map(Tags.find().map((t) => [t._id, t.name])),
    [],
  );

  if (detail !== "far") return null;

  // A frame with frames inside it gets its label just above its top edge, so
  // it doesn't collide with its first sub-round's label.
  const parents = new Set(frames.map((f) => f.parentId).filter(Boolean));

  return (
    <ViewportPortal>
      {frames.map((frame) => {
        const { doc } = (frame as unknown as WhiteboardFlowNode).data;
        const tagName = doc.tag ? tagNames.get(doc.tag) : undefined;
        const label = tagName
          ? frameLabelForTag({ name: tagName })
          : (doc.label ??
            (doc.frameKind === "ungrouped" ? UNGROUPED_LABEL : undefined));
        if (!label) return null;
        const width = frame.measured.width ?? frame.width ?? 0;
        const height = frame.measured.height ?? frame.height ?? 0;
        const { x, y } = frame.internals.positionAbsolute;
        const fontSize = Math.min(28 / zoom, height / 4);
        const above = parents.has(frame.id);
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
            <Pill>{label}</Pill>
          </Label>
        );
      })}
    </ViewportPortal>
  );
};

export default React.memo(FrameLabelLayer);
