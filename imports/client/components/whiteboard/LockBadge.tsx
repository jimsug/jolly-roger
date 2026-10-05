import { useTracker } from "meteor/react-meteor-data";
import { faLock } from "@fortawesome/free-solid-svg-icons/faLock";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import React from "react";
import { useTranslation } from "react-i18next";
import styled, { css } from "styled-components";
import MeteorUsers from "../../../lib/models/MeteorUsers";

// In line in a frame's header, or as a small round badge for a corner,
// where the caller places it.
const Badge = styled.span<{ $corner: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  color: ${({ theme }) => theme.colors.textSecondary};
  ${({ $corner, theme }) =>
    $corner &&
    css`
      width: 22px;
      height: 22px;
      border-radius: 50%;
      border: 1px solid ${theme.colors.border};
      background: ${theme.colors.background};
      font-size: 11px;
    `}
`;

// Who locked a node, by name where the client knows them.
function useLockTitle(lockedBy: string | undefined) {
  const { t } = useTranslation();
  const name = useTracker(
    () => (lockedBy ? MeteorUsers.findOne(lockedBy)?.displayName : undefined),
    [lockedBy],
  );
  return name
    ? t("whiteboard.lock.lockedBy", "Locked by {{name}}", {
        name,
        // React escapes attributes, so i18next's escaping would only show
        // entities. Goes once both i18n inits stop escaping.
        interpolation: { escapeValue: false },
      })
    : t("whiteboard.lock.locked", "Locked");
}

// A padlock on a locked node, titled with who locked it.
const LockBadge = ({
  lockedBy,
  corner = true,
  className,
}: {
  lockedBy: string | undefined;
  corner?: boolean;
  className?: string;
}) => {
  const title = useLockTitle(lockedBy);
  return (
    <Badge
      className={`jr-lock-badge${className ? ` ${className}` : ""}`}
      $corner={corner}
      title={title}
    >
      <FontAwesomeIcon icon={faLock} />
      <span className="visually-hidden">{title}</span>
    </Badge>
  );
};

const MemoLockBadge = React.memo(LockBadge);

// On the top-right corner of a card, note, text box, image, shape or ink
// stroke, sitting over its edge so it can't be taken for a locked puzzle's
// padlock inside a card.
export const CornerLockBadge = styled(MemoLockBadge)`
  position: absolute;
  top: -10px;
  right: -10px;
  z-index: 1;
`;

export default MemoLockBadge;
