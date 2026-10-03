import type { Meteor } from "meteor/meteor";
import { useSubscribe, useTracker } from "meteor/react-meteor-data";
import MeteorUsers from "../../lib/models/MeteorUsers";

// The hunt's members an @-mention can complete to. Their hunt profiles are
// subscribed too, so the autocomplete can match on more than the display name.
export default function useMentionableUsers(huntId: string): Meteor.User[] {
  const profilesLoading = useSubscribe("huntProfiles", huntId)();
  return useTracker(
    () =>
      profilesLoading
        ? []
        : MeteorUsers.find({
            hunts: huntId,
            displayName: { $ne: undefined }, // no point completing a user with an unset displayName
          }).fetch(),
    [huntId, profilesLoading],
  );
}
