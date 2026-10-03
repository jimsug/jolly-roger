import { useTracker } from "meteor/react-meteor-data";
import { faCheck } from "@fortawesome/free-solid-svg-icons/faCheck";
import { faPlus } from "@fortawesome/free-solid-svg-icons/faPlus";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useStore, ViewportPortal } from "@xyflow/react";
import type { TFunction } from "i18next";
import React, { useCallback } from "react";
import { useTranslation } from "react-i18next";
import styled, { css, keyframes } from "styled-components";
import type { ChatMessageCommentAnchorType } from "../../../lib/models/ChatMessages";
import type { DiscordAccountType } from "../../../lib/models/DiscordAccount";
import MeteorUsers from "../../../lib/models/MeteorUsers";
import { commentPosition } from "../../../lib/whiteboard/comments";
import type { Point, Rect } from "../../../lib/whiteboard/layout";
import { useWhiteboardZoom } from "../../hooks/useWhiteboardDetail";
import Avatar from "../Avatar";

export interface CommentPin {
  id: string;
  anchor: ChatMessageCommentAnchorType;
  author?: string;
  replies: number;
  unread: boolean;
  resolved: boolean;
  draft?: boolean;
}

const PIN_SIZE = 28;

// Spreads out from the pin in the colour set on it as --pin-pulse, fading as
// it goes.
const pulse = keyframes`
  0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--pin-pulse) 70%, transparent); }
  70% { box-shadow: 0 0 0 18px color-mix(in srgb, var(--pin-pulse) 0%, transparent); }
  100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--pin-pulse) 0%, transparent); }
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
  ${({ $pulse, theme }) =>
    $pulse &&
    css`
      --pin-pulse: ${theme.colors.primary};

      animation: ${pulse} 0.7s ease-out 3;
    `}
`;

const ReplyCount = styled.span<{ $unread: boolean }>`
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
  color: ${({ theme }) => theme.colors.chatBadgeText};
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
  color: ${({ theme }) => theme.colors.chatBadgeText};
  background: ${({ theme }) => theme.colors.resolvedCommentMarkBackground};
`;

// A pin's tooltip and accessible name, worded whole for each state so a
// translation can put the parts in its own order.
function pinLabel(t: TFunction, pin: CommentPin, name: string): string {
  if (pin.draft) return t("whiteboard.comments.new", "New comment");
  const values = {
    name,
    replies: t("whiteboard.comments.replies", "{{count}} replies", {
      count: pin.replies,
    }),
    // React escapes attributes, so i18next's escaping would only show
    // entities. Goes once both i18n inits stop escaping.
    interpolation: { escapeValue: false },
  };
  if (pin.replies > 0) {
    if (pin.resolved && pin.unread) {
      return t(
        "whiteboard.comments.pinLabel.repliesResolvedUnread",
        "Comment from {{name}}, {{replies}} (resolved), unread",
        values,
      );
    }
    if (pin.resolved) {
      return t(
        "whiteboard.comments.pinLabel.repliesResolved",
        "Comment from {{name}}, {{replies}} (resolved)",
        values,
      );
    }
    if (pin.unread) {
      return t(
        "whiteboard.comments.pinLabel.repliesUnread",
        "Comment from {{name}}, {{replies}}, unread",
        values,
      );
    }
    return t(
      "whiteboard.comments.pinLabel.replies",
      "Comment from {{name}}, {{replies}}",
      values,
    );
  }
  if (pin.resolved && pin.unread) {
    return t(
      "whiteboard.comments.pinLabel.resolvedUnread",
      "Comment from {{name}} (resolved), unread",
      values,
    );
  }
  if (pin.resolved) {
    return t(
      "whiteboard.comments.pinLabel.resolved",
      "Comment from {{name}} (resolved)",
      values,
    );
  }
  if (pin.unread) {
    return t(
      "whiteboard.comments.pinLabel.unread",
      "Comment from {{name}}, unread",
      values,
    );
  }
  return t(
    "whiteboard.comments.pinLabel.plain",
    "Comment from {{name}}",
    values,
  );
}

const CommentPinButton = ({
  pin,
  at,
  zoom,
  open,
  pulsing,
  author,
  onOpen,
}: {
  pin: CommentPin;
  at: Point;
  zoom: number;
  open: boolean;
  pulsing: boolean;
  author:
    | { displayName?: string; discordAccount?: DiscordAccountType }
    | undefined;
  onOpen: (id: string) => void;
}) => {
  const { t } = useTranslation();
  const onClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      onOpen(pin.id);
    },
    [onOpen, pin.id],
  );
  const label = pinLabel(
    t,
    pin,
    author?.displayName ?? t("whiteboard.comments.unknownAuthor", "Someone"),
  );
  return (
    <Pin
      type="button"
      className="nodrag nopan jr-comment-pin"
      title={label}
      aria-label={label}
      $open={open}
      $unread={pin.unread}
      $resolved={pin.resolved}
      $pulse={pulsing}
      $draft={!!pin.draft}
      style={{
        transform: `translate(${at.x}px, ${at.y}px) scale(${1 / zoom}) translate(0, -100%)`,
      }}
      onClick={onClick}
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
        <ReplyCount $unread={pin.unread}>{pin.replies}</ReplyCount>
      )}
      {pin.resolved && (
        <ResolvedMark>
          <FontAwesomeIcon icon={faCheck} />
        </ResolvedMark>
      )}
    </Pin>
  );
};

const sameBoxes = (a: (Rect | undefined)[], b: (Rect | undefined)[]) =>
  a.length === b.length &&
  a.every((box, i) => {
    const other = b[i];
    return box && other
      ? box.x === other.x &&
          box.y === other.y &&
          box.width === other.width &&
          box.height === other.height
      : box === other;
  });

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
  const zoom = useWhiteboardZoom();
  const anchored = [
    ...new Set(pins.map((p) => p.anchor.node).filter((n): n is string => !!n)),
  ];
  // Where each node with a pin on it is, compared by value so the layer only
  // re-renders when one of them moves.
  const anchorBoxes = useStore(
    (s) =>
      anchored.map((id): Rect | undefined => {
        const n = s.nodeLookup.get(id);
        if (!n || n.hidden) return undefined;
        return {
          ...n.internals.positionAbsolute,
          width: n.measured.width ?? n.width ?? 0,
          height: n.measured.height ?? n.height ?? 0,
        };
      }),
    sameBoxes,
  );
  const boxes = new Map(anchored.map((id, i) => [id, anchorBoxes[i]]));
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
        return (
          <CommentPinButton
            key={pin.id}
            pin={pin}
            at={at}
            zoom={zoom}
            open={pin.id === openId}
            pulsing={pin.id === pulseId}
            author={pin.author ? authors.get(pin.author) : undefined}
            onOpen={onOpen}
          />
        );
      })}
    </ViewportPortal>
  );
};

export default React.memo(CommentLayer);
