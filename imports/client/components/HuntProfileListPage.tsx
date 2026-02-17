import { Meteor } from "meteor/meteor";
import { useSubscribe, useTracker } from "meteor/react-meteor-data";
import { useParams } from "react-router-dom";
import Hunts from "../../lib/models/Hunts";
import InvitationCodes from "../../lib/models/InvitationCodes";
import MeteorUsers from "../../lib/models/MeteorUsers";
import UserStatuses, {
  type UserStatusType as UserStatusDocument,
} from "../../lib/models/UserStatuses";
import {
  listAllRolesForHunt,
  userMayAddUsersToHunt,
  userMayMakeOperatorForHunt,
  userMayUpdateHuntInvitationCode,
  userMayUseDiscordBotAPIs,
} from "../../lib/permission_stubs";
import invitationCodesForHunt from "../../lib/publications/invitationCodesForHunt";
import statusesForHuntUsers from "../../lib/publications/statusesForHuntUsers";
import useTypedSubscribe from "../hooks/useTypedSubscribe";
import ProfileList, { type UserStatusSummary } from "./ProfileList";

export const userStatusesToLastSeen = (
  statuses: UserStatusDocument[],
): Record<string, UserStatusSummary> => {
  return statuses.reduce<Record<string, UserStatusSummary>>((acc, uStatus) => {
    const user = uStatus.user;
    if (!acc[user]) {
      acc[user] = {
        status: {
          status: "offline",
          at: null,
        },
        puzzleStatus: {
          source: null,
          at: null,
          puzzle: null,
        },
      };
    }

    if (
      uStatus.type === "puzzleStatus" &&
      acc[user].puzzleStatus.at &&
      uStatus.updatedAt > acc[user].puzzleStatus.at
    ) {
      // do puzzle status things, we should have only one here
      acc[user].puzzleStatus.at = uStatus.updatedAt;
      acc[user].puzzleStatus.source = uStatus.type;
      acc[user].puzzleStatus.puzzle = uStatus.puzzle ?? null;
    } else if (uStatus.type === "puzzleStatus" && !acc[user].puzzleStatus.at) {
      acc[user].puzzleStatus.at = uStatus.updatedAt;
      acc[user].puzzleStatus.source = uStatus.type;
      acc[user].puzzleStatus.puzzle = uStatus.puzzle ?? null;
    } else if (uStatus.type === "status") {
      if (
        acc[user].status.status === "offline" ||
        uStatus.status === "online"
      ) {
        // upgrade the status if we've seen it
        acc[user].status.status = uStatus.status as "offline" | "online";
      }
      if (acc[user].status.status === uStatus.status) {
        // get the most recent timestamp for our status
        acc[user].status.at =
          acc[user].status.at && uStatus.updatedAt > acc[user].status.at
            ? uStatus.updatedAt
            : acc[user].status.at || uStatus.updatedAt;
      }
    }

    return acc;
  }, {});
};

const HuntProfileListPage = () => {
  const huntId = useParams<"huntId">().huntId!;

  const statusesLoading = useTypedSubscribe(statusesForHuntUsers, { huntId });
  const profilesLoading = useSubscribe("huntProfiles", huntId);
  const userRolesLoading = useSubscribe("huntRoles", huntId);
  const invitationCodesLoading = useTypedSubscribe(invitationCodesForHunt, {
    huntId,
  });
  const loading =
    profilesLoading() ||
    userRolesLoading() ||
    invitationCodesLoading() ||
    statusesLoading();

  const userStatuses = useTracker(
    () =>
      loading
        ? undefined
        : userStatusesToLastSeen(UserStatuses.find({ hunt: huntId }).fetch()),
    [huntId, loading],
  );

  const users = useTracker(() => {
    if (loading) return [];

    const fetchedUsers = MeteorUsers.find({
      hunts: huntId,
      displayName: { $ne: undefined },
    }).fetch();

    // Sort the resulting array case-insensitively
    return fetchedUsers.sort((a, b) => {
      return (a.displayName || "").localeCompare(
        b.displayName || "",
        undefined,
        {
          sensitivity: "base", // Ignores case and accents (a = A = á)
        },
      );
    });
  }, [huntId, loading]);

  const hunt = useTracker(() => Hunts.findOne(huntId), [huntId]);
  const {
    canInvite,
    canSyncDiscord,
    canMakeOperator,
    canUpdateHuntInvitationCode,
  } = useTracker(() => {
    return {
      canInvite: userMayAddUsersToHunt(Meteor.user(), hunt),
      canSyncDiscord: userMayUseDiscordBotAPIs(Meteor.user()),
      canMakeOperator: userMayMakeOperatorForHunt(Meteor.user(), hunt),
      canUpdateHuntInvitationCode: userMayUpdateHuntInvitationCode(
        Meteor.user(),
        hunt,
      ),
    };
  }, [hunt]);
  const roles = useTracker(
    () =>
      loading || !canMakeOperator
        ? {}
        : Object.fromEntries(
            MeteorUsers.find({ hunts: huntId }).map((u) => [
              u._id,
              listAllRolesForHunt(u, hunt),
            ]),
          ),
    [huntId, hunt, loading, canMakeOperator],
  );
  const invitationCode = useTracker(
    () => InvitationCodes.findOne({ hunt: huntId })?.code,
    [huntId],
  );

  if (loading) {
    return <div>loading...</div>;
  }

  return (
    <ProfileList
      users={users}
      roles={roles}
      hunt={hunt}
      canInvite={canInvite}
      canSyncDiscord={canSyncDiscord}
      canMakeOperator={canMakeOperator}
      canUpdateHuntInvitationCode={canUpdateHuntInvitationCode}
      invitationCode={invitationCode}
      userStatuses={userStatuses}
    />
  );
};

export default HuntProfileListPage;
