import { Meteor } from "meteor/meteor";
import { useTracker } from "meteor/react-meteor-data";
import Alert from "react-bootstrap/Alert";
import { useTranslation } from "react-i18next";
import isAdmin from "../../lib/isAdmin";
import Hunts from "../../lib/models/Hunts";
import MeteorUsers from "../../lib/models/MeteorUsers";
import huntsAll from "../../lib/publications/huntsAll";
import invitedUsers from "../../lib/publications/invitedUsers";
import { useBreadcrumb } from "../hooks/breadcrumb";
import useTypedSubscribe from "../hooks/useTypedSubscribe";
import InvitedUserList from "./InvitedUserList";

const InvitedUserListPage = () => {
  const { t } = useTranslation();

  useBreadcrumb({
    title: t("invitedUsers.breadcrumbTitle", "Pending invitations"),
    path: "/users/invited",
  });

  const canView = useTracker(() => isAdmin(Meteor.user()), []);

  const invitedLoading = useTypedSubscribe(canView ? invitedUsers : undefined);
  const huntsLoading = useTypedSubscribe(canView ? huntsAll : undefined);
  const loading = invitedLoading() || huntsLoading();

  const users = useTracker(() => {
    return loading
      ? []
      : MeteorUsers.find(
          { "services.password.enroll": { $exists: true } },
          { sort: { "services.password.enroll.when": 1 } },
        ).fetch();
  }, [loading]);

  const huntNames = useTracker(() => {
    return Object.fromEntries(
      Hunts.find().map((hunt) => [hunt._id, hunt.name]),
    );
  }, []);

  if (!canView) {
    return (
      <Alert variant="danger">
        {t(
          "invitedUsers.notAuthorized",
          "Only admins can see pending invitations.",
        )}
      </Alert>
    );
  }

  if (loading) {
    return <div>{t("common.loading", "Loading")}...</div>;
  }

  return (
    <div>
      <h1>{t("invitedUsers.title", "Pending invitations")}</h1>
      {users.length === 0 ? (
        <Alert variant="info">
          {t(
            "invitedUsers.empty",
            "Nobody is waiting on an invitation. Invite someone from a hunt's Hunters page.",
          )}
        </Alert>
      ) : (
        <InvitedUserList users={users} huntNames={huntNames} />
      )}
    </div>
  );
};

export default InvitedUserListPage;
