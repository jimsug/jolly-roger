import { useSubscribe, useTracker } from "meteor/react-meteor-data";
import Badge from "react-bootstrap/Badge";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import MeteorUsers from "../../lib/models/MeteorUsers";
import sortUsersByDisplayName from "../../lib/sortUsersByDisplayName";
import usePendingInvitees from "../hooks/usePendingInvitees";
import ProfileList from "./ProfileList";

const AllProfileListPage = () => {
  const { t } = useTranslation();
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
  const {
    canView: canSeeInvited,
    loading: invitedLoading,
    invitees,
  } = usePendingInvitees();

  if (loading) {
    return <div>loading...</div>;
  }

  const title = (
    <>
      {t("hunterList.title", "List of hunters")}
      {canSeeInvited && !invitedLoading && (
        <>
          {" "}
          <Badge as={Link} to="/users/invited" bg="info">
            {t("hunterList.invitedBadge", "Invited")}{" "}
            <Badge bg="secondary">{invitees.length}</Badge>
          </Badge>
        </>
      )}
    </>
  );
  return <ProfileList users={users} title={title} />;
};

export default AllProfileListPage;
