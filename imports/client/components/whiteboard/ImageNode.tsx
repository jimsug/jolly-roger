import { faImage } from "@fortawesome/free-solid-svg-icons/faImage";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { Node, NodeProps } from "@xyflow/react";
import React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import type { WhiteboardNodeType } from "../../../lib/models/WhiteboardNodes";
import useHoverIntent from "../../hooks/useHoverIntent";
import useWhiteboardDetail from "../../hooks/useWhiteboardDetail";
import colors from "./colors";
import { CornerLockBadge } from "./LockBadge";
import NodeChrome from "./NodeChrome";
import NodeContributors from "./NodeContributors";

type ImageNodeType = Node<{ doc: WhiteboardNodeType }, "image">;

const Box = styled.div<{ $selected: boolean }>`
  position: relative;
  width: 100%;
  height: 100%;
  outline: ${({ $selected, theme }) =>
    $selected ? `2px solid ${theme.colors.primary}` : "none"};
  outline-offset: 2px;
`;

const Picture = styled.img`
  display: block;
  width: 100%;
  height: 100%;
  object-fit: fill;
  user-select: none;
`;

// Zoomed right out, an image is a grey box, so a board full of them doesn't
// have to draw every one.
const FarBox = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: ${colors.fill.gray};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 48px;
`;

const Attribution = styled.div`
  position: absolute;
  right: 0;
  bottom: 100%;
`;

// An uploaded image, at the node's size. Resizing keeps its shape. It takes
// lines, comments and locks like a note, but has no colour to pick.
const ImageNode = ({
  id,
  data,
  selected,
  width,
  height,
}: NodeProps<ImageNodeType>) => {
  const { t } = useTranslation();
  const hover = useHoverIntent();
  const detail = useWhiteboardDetail();
  const { doc } = data;
  const shownWidth = width ?? doc.width;
  const shownHeight = height ?? doc.height;
  const label = t("whiteboard.image.label", "Image");

  return (
    <Box
      $selected={selected}
      onMouseEnter={hover.onMouseEnter}
      onMouseLeave={hover.onMouseLeave}
    >
      <NodeChrome
        id={id}
        kind="image"
        selected={selected}
        locked={!!doc.locked}
        keepAspectRatio
      />
      {detail === "far" || !doc.image ? (
        <FarBox className="jr-image-far" title={label}>
          <FontAwesomeIcon icon={faImage} />
          <span className="visually-hidden">{label}</span>
        </FarBox>
      ) : (
        <Picture
          src={doc.image.url}
          alt={label}
          draggable={false}
          width={shownWidth}
          height={shownHeight}
          loading="lazy"
        />
      )}
      {(hover.hovered || selected) && (
        <Attribution>
          <NodeContributors contributors={doc.contributors} />
        </Attribution>
      )}
      {doc.locked && <CornerLockBadge lockedBy={doc.lockedBy} />}
    </Box>
  );
};

export default React.memo(ImageNode);
