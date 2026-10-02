import { useTracker } from "meteor/react-meteor-data";
import { faCheck } from "@fortawesome/free-solid-svg-icons/faCheck";
import { faPlus } from "@fortawesome/free-solid-svg-icons/faPlus";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useStore, ViewportPortal } from "@xyflow/react";
import React from "react";
import styled, { css, keyframes } from "styled-components";
import MeteorUsers from "../../../lib/models/MeteorUsers";
import type { CommentAnchor } from "../../../lib/whiteboard/comments";
import { commentPosition } from "../../../lib/whiteboard/comments";
import Avatar from "../Avatar";
import { useZoom } from "./useDetail";

export interface CommentPin {
  id: string;
  anchor: CommentAnchor;
  author?: string;
  replies: number;
  unread: boolean;
  resolved: boolean;
  draft?: boolean;
}

const PIN_SIZE = 28;

const pulse = keyframes`
  0% { box-shadow: 0 0 0 0 rgb(13 110 253 / 70%); }
  70% { box-shadow: 0 0 0 18px rgb(13 110 253 / 0%); }
  100% { box-shadow: 0 0 0 0 rgb(13 110 253 / 0%); }
`;

const Pin = styled.button<{
  $open: boolean;
  $unread: boolean;
  $resolved: boolean;
  $pulse: boolean;
  $draft: boolean;
}>`
  position: absolute;
  left: 0;
  top: 0;
  transform-origin: 0 0;
  z-index: 1003;
  pointer-events: all;
  display: flex;
  align-items: center;
  justify-content: center;
  width: ${PIN_SIZE + 6}px;
  height: ${PIN_SIZE + 6}px;
  padding: 2px;
  border-radius: 50% 50% 50% 0;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.background};
  border: 2px
    ${({ $draft }) => ($draft ? "dashed" : "solid")}
    ${({ $open, $unread, theme }) =>
      $open || $unread ? theme.colors.primary : theme.colors.border};
  box-shadow: 0 1px 4px rgb(0 0 0 / 25%);
  opacity: ${({ $resolved, $open }) => ($resolved && !$open ? 0.6 : 1)};
  ${({ $pulse }) =>
    $pulse &&
    css`
      animation: ${pulse} 0.7s ease-out 3;
    `}
`;

const Badge = styled.span<{ $unread: boolean }>`
  position: absolute;
  right: -6px;
  top: -6px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  font-size: 10px;
  line-height: 16px;
  text-align: center;
  color: #fff;
  background: ${({ $unread, theme }) =>
    $unread ? theme.colors.primary : theme.colors.secondary};
`;

const ResolvedMark = styled.span`
  position: absolute;
  left: -4px;
  bottom: -4px;
  width: 14px;
  height: 14px;
  border-radius: 7px;
  font-size: 8px;
  line-height: 14px;
  text-align: center;
  color: #fff;
  background: ${({ theme }) => theme.colors.success};
`;

// The pins for comments on the board, drawn at a constant size whatever the
// zoom. A pin's point (bottom-left corner) sits on the spot it was left at,
// and follows the thing it's on as that moves.
const CommentLayer = ({
  pins,
  openId,
  pulseId,
  onOpen,
}: {
  pins: CommentPin[];
  openId?: string;
  pulseId?: string;
  onOpen: (id: string) => void;
}) => {
  const zoom = useZoom();
  const anchored = [
    ...new Set(pins.map((p) => p.anchor.node).filter((n): n is string => !!n)),
  ];
  const boxesKey = useStore((s) =>
    JSON.stringify(
      anchored.map((id) => {
        const n = s.nodeLookup.get(id);
        if (!n || n.hidden) return null;
        return [
          n.internals.positionAbsolute.x,
          n.internals.positionAbsolute.y,
          n.measured.width ?? n.width ?? 0,
          n.measured.height ?? n.height ?? 0,
        ];
      }),
    ),
  );
  const boxes = new Map(
    (JSON.parse(boxesKey) as ([number, number, number, number] | null)[]).map(
      (b, i) => [
        anchored[i]!,
        b ? { x: b[0], y: b[1], width: b[2], height: b[3] } : undefined,
      ],
    ),
  );
  const authors = useTracker(
    () =>
      new Map(
        MeteorUsers.find(
          {
            _id: {
              $in: pins.map((p) => p.author).filter((a): a is string => !!a),
            },
          },
          { projection: { displayName: 1, discordAccount: 1 } },
        ).map((u) => [u._id, u]),
      ),
    [pins],
  );

  return (
    <ViewportPortal>
      {pins.map((pin) => {
        const at = commentPosition(
          pin.anchor,
          pin.anchor.node ? boxes.get(pin.anchor.node) : undefined,
        );
        if (!at) return null;
        const author = pin.author ? authors.get(pin.author) : undefined;
        const name = author?.displayName ?? "Someone";
        const label = pin.draft
          ? "New comment"
          : `Comment from ${name}${
              pin.replies > 0
                ? `, ${pin.replies} ${pin.replies === 1 ? "reply" : "replies"}`
                : ""
            }${pin.resolved ? " (resolved)" : ""}${pin.unread ? ", unread" : ""}`;
        return (
          <Pin
            key={pin.id}
            type="button"
            className="nodrag nopan jr-comment-pin"
            data-comment={pin.id}
            title={label}
            aria-label={label}
            $open={pin.id === openId}
            $unread={pin.unread}
            $resolved={pin.resolved}
            $pulse={pin.id === pulseId}
            $draft={!!pin.draft}
            style={{
              transform: `translate(${at.x}px, ${at.y}px) scale(${1 / zoom}) translate(0, -100%)`,
            }}
            onClick={(event) => {
              event.stopPropagation();
              onOpen(pin.id);
            }}
          >
            {pin.draft ? (
              <FontAwesomeIcon icon={faPlus} />
            ) : (
              <Avatar
                size={PIN_SIZE - 4}
                _id={pin.author}
                displayName={author?.displayName}
                discordAccount={author?.discordAccount}
                rounded
              />
            )}
            {pin.replies > 0 && (
              <Badge $unread={pin.unread}>{pin.replies}</Badge>
            )}
            {pin.resolved && (
              <ResolvedMark>
                <FontAwesomeIcon icon={faCheck} />
              </ResolvedMark>
            )}
          </Pin>
        );
      })}
    </ViewportPortal>
  );
};

export default React.memo(CommentLayer);
