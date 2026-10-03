import { Meteor } from "meteor/meteor";
import { useSubscribe, useTracker } from "meteor/react-meteor-data";
import { useMemo } from "react";
import { useParams } from "react-router";
import Hunts from "../../lib/models/Hunts";
import InvitationCodes from "../../lib/models/InvitationCodes";
import MeteorUsers from "../../lib/models/MeteorUsers";
import Puzzles from "../../lib/models/Puzzles";
import UserStatuses from "../../lib/models/UserStatuses";
import {
  listAllRolesForHunt,
  userMayAddUsersToHunt,
  userMayMakeOperatorForHunt,
  userMayUpdateHuntInvitationCode,
  userMayUseDiscordBotAPIs,
} from "../../lib/permission_stubs";
import invitationCodesForHunt from "../../lib/publications/invitationCodesForHunt";
import puzzlesForHunt from "../../lib/publications/puzzlesForHunt";
import statusesForHuntUsers from "../../lib/publications/statusesForHuntUsers";
import sortUsersByDisplayName from "../../lib/sortUsersByDisplayName";
import userStatusesToLastSeen from "../../lib/userStatusesToLastSeen";
import useNow from "../hooks/useNow";
import useTypedSubscribe from "../hooks/useTypedSubscribe";
import ProfileList from "./ProfileList";

const HuntProfileListPage = () => {
  const huntId = useParams<"huntId">().huntId!;

  const profilesLoading = useSubscribe("huntProfiles", huntId);
  const userRolesLoading = useSubscribe("huntRoles", huntId);
  const invitationCodesLoading = useTypedSubscribe(invitationCodesForHunt, {
    huntId,
  });
  const statusesLoading = useTypedSubscribe(statusesForHuntUsers, { huntId });
  // Puzzle titles for the "last active on" buttons
  const puzzlesLoading = useTypedSubscribe(puzzlesForHunt, { huntId });
  const loading =
    profilesLoading() ||
    userRolesLoading() ||
    invitationCodesLoading() ||
    statusesLoading() ||
    puzzlesLoading();

  const userStatuses = useTracker(
    () =>
      loading
        ? {}
        : userStatusesToLastSeen(UserStatuses.find({ hunt: huntId }).fetch()),
    [huntId, loading],
  );
  const puzzleTitles = useTracker(() => {
    const titles = new Map<string, string>();
    Puzzles.find({ hunt: huntId }, { projection: { title: 1 } }).forEach(
      (puzzle) => {
        titles.set(puzzle._id, puzzle.title);
      },
    );
    return titles;
  }, [huntId]);
  // One clock for every badge, so the list re-renders once a minute rather
  // than one badge at a time
  const now = useNow(60 * 1000);
  const presence = useMemo(
    () => ({ userStatuses, puzzleTitles, now }),
    [userStatuses, puzzleTitles, now],
  );

  const users = useTracker(
    () =>
      loading
        ? []
        : sortUsersByDisplayName(
            MeteorUsers.find({
              hunts: huntId,
              displayName: { $ne: undefined },
            }).fetch(),
          ),
    [huntId, loading],
  );

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
      presence={presence}
    />
  );
};

export default HuntProfileListPage;
