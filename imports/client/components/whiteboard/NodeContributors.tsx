import { useTracker } from "meteor/react-meteor-data";
import React, { useId, useMemo } from "react";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Tooltip from "react-bootstrap/Tooltip";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import MeteorUsers from "../../../lib/models/MeteorUsers";
import type { WhiteboardContributorType } from "../../../lib/models/WhiteboardNodes";
import relativeTimeFormat from "../../../lib/relativeTimeFormat";
import contributorsByRecency from "../../../lib/whiteboard/contributors";
import Avatar from "../Avatar";
import AvatarStack from "../AvatarStack";
import useDetail from "./useDetail";

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

// Who each user is, for an AvatarStack. Anyone passive is drawn faded.
export const useAvatarUsers = (ids: string[], passive?: Set<string>) => {
  const { t } = useTranslation();
  return useTracker(
    () =>
      ids.map((id) => {
        const user = MeteorUsers.findOne(id);
        return {
          _id: id,
          displayName:
            user?.displayName ??
            t("whiteboard.contributors.unknown", "Unknown"),
          discordAccount: user?.discordAccount,
          isPassive: passive?.has(id),
        };
      }),
    [ids, passive, t],
  );
};

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
  const size = SIZES[useDetail()];
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
          const user = users[i]!;
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
