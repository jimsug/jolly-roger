import { Meteor } from "meteor/meteor";
import { useTracker } from "meteor/react-meteor-data";
import isAdmin from "../../lib/isAdmin";
import MeteorUsers from "../../lib/models/MeteorUsers";
import invitedUsersAll from "../../lib/publications/invitedUsersAll";
import invitedUsersForHunt from "../../lib/publications/invitedUsersForHunt";
import useTypedSubscribe from "./useTypedSubscribe";

// Users who have been sent an enrolment email but haven't finished signing
// up, oldest invitation first; with a huntId, only that hunt's. Only admins
// can see them, so for anyone else canView is false and nothing is
// subscribed.
export default function usePendingInvitees({
  huntId,
}: {
  huntId?: string;
} = {}) {
  const canView = useTracker(() => isAdmin(Meteor.user()), []);
  const allLoading = useTypedSubscribe(
    canView && huntId === undefined ? invitedUsersAll : undefined,
  );
  const forHuntLoading = useTypedSubscribe(
    canView && huntId !== undefined ? invitedUsersForHunt : undefined,
    { huntId: huntId ?? "" },
  );
  const loading = allLoading() || forHuntLoading();

  const invitees = useTracker(() => {
    if (!canView || loading) {
      return [];
    }
    return MeteorUsers.find(
      {
        "services.password.enroll": { $exists: true },
        ...(huntId !== undefined ? { hunts: huntId } : {}),
      },
      { sort: { "services.password.enroll.when": 1 } },
    ).fetch();
  }, [canView, loading, huntId]);

  return { canView, loading, invitees };
}
