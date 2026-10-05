import type React from "react";
import { useId } from "react";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Tooltip from "react-bootstrap/Tooltip";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import type { DiscordAccountType } from "../../lib/models/DiscordAccount";
import Avatar from "./Avatar";

export interface AvatarStackUser {
  _id: string;
  displayName: string;
  discordAccount?: DiscordAccountType | undefined;
  // Drawn faded with a warning border: probably here, but not for certain
  isPassive?: boolean;
}

const StackContainer = styled.div`
  display: inline-flex;
  flex-direction: row;
  align-items: center;

  /* Room for the hovered avatar to shift without the row jumping */
  padding-right: 4px;
`;

const AvatarItem = styled.div<{
  $overlap: number;
  $isPassive: boolean;
  $plain: boolean;
  $color: string | undefined;
}>`
  margin-right: -${({ $overlap }) => $overlap}px;
  padding: 0;
  border: 2px solid
    ${({ theme, $isPassive, $plain, $color }) =>
      $color ??
      (
        $plain
          ? theme.colors.background
          : $isPassive
            ? theme.colors.presence.idle
            : theme.colors.presence.online
      )};
  border-radius: 50%;
  transition: all 0.2s ease-in-out;
  position: relative;
  background-color: ${({ theme }) => theme.colors.background};
  overflow: hidden;
  opacity: ${({ $isPassive }) => ($isPassive ? 0.8 : 1)};

  /* Picked from, rather than only looked at */
  &:is(button) {
    display: block;
    line-height: 0;
    cursor: pointer;
  }

  &:hover {
    transform: translateY(-2px);
    z-index: 10;
    margin-right: 4px;
    box-shadow: 0 4px 8px rgb(0 0 0 / 20%);
  }

  &:last-child {
    margin-right: 0;
  }

  &:is(button):focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary};
    outline-offset: 1px;
    z-index: 10;
  }
`;

const OverflowCount = styled.div<{ $size: number }>`
  width: ${({ $size }) => $size}px;
  height: ${({ $size }) => $size}px;
  border-radius: 50%;
  background-color: ${({ theme }) => theme.colors.secondary};
  color: ${({ theme }) => theme.colors.text};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: ${({ $size }) => Math.max(10, $size * 0.4)}px;
  font-weight: bold;
  border: 2px solid ${({ theme }) => theme.colors.background};
  z-index: 0;
  margin-left: 4px;
  padding: 0;
  cursor: default;

  &:is(button) {
    cursor: pointer;
  }
`;

// A row of overlapping avatars, capped at `max` with a "+N" bubble for the
// rest. The stack's own tooltip lists everyone; turn it off when it sits
// inside something with its own. Plain drops the presence colours from the
// borders, for stacks that aren't about who's here right now, and color
// gives each person a border colour of their own instead. With onPick, each
// avatar that canPick allows is a button labelled by pickLabel, and with
// onMore the "+N" bubble is one too; each is given the button pressed.
const AvatarStack = ({
  users,
  size = 24,
  max = 3,
  withTooltip = true,
  plain = false,
  color,
  onPick,
  canPick,
  pickLabel,
  onMore,
}: {
  users: AvatarStackUser[];
  size?: number;
  max?: number;
  withTooltip?: boolean;
  plain?: boolean;
  color?: (userId: string) => string;
  onPick?: (userId: string, target: HTMLElement) => void;
  canPick?: (userId: string) => boolean;
  pickLabel?: (user: AvatarStackUser) => string;
  onMore?: (target: HTMLElement) => void;
}) => {
  const id = useId();
  const { t } = useTranslation();

  if (users.length === 0) {
    return null;
  }

  const visibleUsers = users.slice(0, max);
  const remaining = users.length - max;
  const overlap = size / 3;

  const stack = (
    <StackContainer>
      {visibleUsers.map((user, i) => (
        <AvatarItem
          key={user._id}
          $overlap={remaining > 0 || i < visibleUsers.length - 1 ? overlap : 0}
          $isPassive={user.isPassive ?? false}
          $plain={plain}
          $color={color?.(user._id)}
          {...(onPick && (canPick?.(user._id) ?? true)
            ? {
                as: "button" as const,
                type: "button",
                "aria-label": pickLabel?.(user) ?? user.displayName,
                "aria-haspopup": "dialog",
                onClick: (event: React.MouseEvent<HTMLElement>) =>
                  onPick(user._id, event.currentTarget),
              }
            : {})}
        >
          <Avatar
            size={size}
            _id={user._id}
            displayName={user.displayName}
            discordAccount={user.discordAccount}
            rounded
          />
        </AvatarItem>
      ))}
      {remaining > 0 && (
        <OverflowCount
          $size={size}
          title={t("puzzleList.moreUsers", "{{count}} more users", {
            count: remaining,
          })}
          {...(onMore
            ? {
                as: "button" as const,
                type: "button",
                "aria-label": t(
                  "puzzleList.moreUsers",
                  "{{count}} more users",
                  {
                    count: remaining,
                  },
                ),
                "aria-haspopup": "dialog",
                onClick: (event: React.MouseEvent<HTMLElement>) =>
                  onMore(event.currentTarget),
              }
            : {})}
        >
          +{remaining}
        </OverflowCount>
      )}
    </StackContainer>
  );

  if (!withTooltip) {
    return stack;
  }

  return (
    <OverlayTrigger
      placement="left"
      overlay={
        <Tooltip id={id}>{users.map((u) => u.displayName).join(", ")}</Tooltip>
      }
    >
      {stack}
    </OverlayTrigger>
  );
};

export default AvatarStack;
