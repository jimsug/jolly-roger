import React, { useId, useMemo } from "react";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Tooltip from "react-bootstrap/Tooltip";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import type { WhiteboardContributorType } from "../../../lib/models/WhiteboardNodes";
import relativeTimeFormat from "../../../lib/relativeTimeFormat";
import contributorsByRecency from "../../../lib/whiteboard/contributors";
import useAvatarUsers from "../../hooks/useAvatarUsers";
import useWhiteboardDetail from "../../hooks/useWhiteboardDetail";
import Avatar from "../Avatar";
import AvatarStack from "../AvatarStack";

const ContributorList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  text-align: left;
`;

const ContributorRow = styled.li`
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
`;

const When = styled.span`
  opacity: 0.75;
`;

const StackWrapper = styled.div`
  display: inline-flex;
  cursor: default;
`;

// On-board size of the avatars at each detail level. Drawn larger when zoomed
// out so they stay a readable size on screen; hidden when zoomed right out.
const SIZES = { full: 18, mid: 36, far: 0 };

// Who made and edited a node, newest first. Hovering lists everyone with when
// they last touched it.
const NodeContributors = ({
  contributors,
}: {
  contributors: WhiteboardContributorType[] | undefined;
}) => {
  const id = useId();
  const { t } = useTranslation();
  const size = SIZES[useWhiteboardDetail()];
  const ordered = useMemo(
    () => contributorsByRecency(contributors),
    [contributors],
  );
  const ids = useMemo(() => ordered.map((c) => c.user), [ordered]);
  const users = useAvatarUsers(ids);

  if (ordered.length === 0 || size === 0) return null;

  const creatorEntry = contributors?.[0];
  const tooltip = (
    <Tooltip id={id}>
      <ContributorList>
        {ordered.map((entry, i) => {
          // useAvatarUsers gives one user per id, in order.
          const user = users[i];
          if (!user) return null;
          const when = relativeTimeFormat(entry.at, t);
          return (
            <ContributorRow key={entry.user}>
              <Avatar
                size={16}
                _id={user._id}
                displayName={user.displayName}
                discordAccount={user.discordAccount}
                rounded
              />
              <span>{user.displayName}</span>
              <When>
                {entry === creatorEntry
                  ? t("whiteboard.contributors.created", "created {{when}}", {
                      when,
                    })
                  : t("whiteboard.contributors.edited", "edited {{when}}", {
                      when,
                    })}
              </When>
            </ContributorRow>
          );
        })}
      </ContributorList>
    </Tooltip>
  );

  return (
    <OverlayTrigger placement="left" overlay={tooltip}>
      <StackWrapper className="nodrag">
        <AvatarStack
          users={users}
          size={size}
          max={3}
          withTooltip={false}
          plain
        />
      </StackWrapper>
    </OverlayTrigger>
  );
};

export default React.memo(NodeContributors);
