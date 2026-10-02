import { useTracker } from "meteor/react-meteor-data";
import React, { useId, useMemo } from "react";
import Tooltip from "react-bootstrap/Tooltip";
import styled from "styled-components";
import MeteorUsers from "../../../lib/models/MeteorUsers";
import relativeTimeFormat from "../../../lib/relativeTimeFormat";
import type { ContributorEntry } from "../../../lib/whiteboard/contributors";
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

// On-board size of the avatars at each detail level. Drawn larger when zoomed
// out so they stay a readable size on screen; hidden when zoomed right out.
const SIZES = { full: 18, mid: 36, far: 0 };

// Who made and edited a node, newest first. Hovering lists everyone with when
// they last touched it.
const NodeContributors = ({
  contributors,
}: {
  contributors: ContributorEntry[] | undefined;
}) => {
  const id = useId();
  const size = SIZES[useDetail()];
  const ordered = useMemo(
    () => contributorsByRecency(contributors),
    [contributors],
  );
  const users = useTracker(
    () =>
      ordered.map((c) => {
        const user = MeteorUsers.findOne(c.user);
        return {
          _id: c.user,
          displayName: user?.displayName ?? "Unknown",
          discordAccount: user?.discordAccount,
        };
      }),
    [ordered],
  );

  if (ordered.length === 0 || size === 0) return null;

  const creatorEntry = contributors?.[0];
  const tooltip = (
    <Tooltip id={id}>
      <ContributorList>
        {ordered.map((entry, i) => {
          const user = users[i]!;
          const verb = entry === creatorEntry ? "created" : "edited";
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
                {verb} {relativeTimeFormat(entry.at)}
              </When>
            </ContributorRow>
          );
        })}
      </ContributorList>
    </Tooltip>
  );

  return (
    <StackWrapper className="nodrag">
      <AvatarStack users={users} size={size} max={3} tooltip={tooltip} plain />
    </StackWrapper>
  );
};

export default React.memo(NodeContributors);
