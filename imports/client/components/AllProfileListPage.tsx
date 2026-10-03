import { Meteor } from "meteor/meteor";
import { useSubscribe, useTracker } from "meteor/react-meteor-data";
import isAdmin from "../../lib/isAdmin";
import MeteorUsers from "../../lib/models/MeteorUsers";
import invitedUsers from "../../lib/publications/invitedUsers";
import sortUsersByDisplayName from "../../lib/sortUsersByDisplayName";
import useTypedSubscribe from "../hooks/useTypedSubscribe";
import ProfileList from "./ProfileList";

const AllProfileListPage = () => {
  const profilesLoading = useSubscribe("allProfiles");
  const loading = profilesLoading();

  const users = useTracker(() => {
    return loading
      ? []
      : sortUsersByDisplayName(
          MeteorUsers.find({ displayName: { $ne: undefined } }).fetch(),
        );
  }, [loading]);

  // Only admins can see pending invitations, so only they get the count.
  const canSeeInvited = useTracker(() => isAdmin(Meteor.user()), []);
  const invitedLoading = useTypedSubscribe(
    canSeeInvited ? invitedUsers : undefined,
  );
  const invitedReady = canSeeInvited && !invitedLoading();
  const invitedCount = useTracker(() => {
    if (!invitedReady) {
      return undefined;
    }
    return MeteorUsers.find({
      "services.password.enroll": { $exists: true },
    }).count();
  }, [invitedReady]);

  if (loading) {
    return <div>loading...</div>;
  }
  return <ProfileList users={users} invitedCount={invitedCount} />;
};

export default AllProfileListPage;
