import { Meteor } from "meteor/meteor";
import { useTracker } from "meteor/react-meteor-data";
import { Navigate } from "react-router";

// /profile is a stable link to the current user's own profile page
const ProfileRedirector = () => {
  const userId = useTracker(() => Meteor.userId(), []);
  return <Navigate to={userId ? `/users/${userId}` : "/login"} replace />;
};

export default ProfileRedirector;
