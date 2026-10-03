import MeteorUsers from "../lib/models/MeteorUsers";

// Users who have been sent an enrolment email but haven't completed signup
// yet, optionally only those invited to one hunt. Meteor clears
// services.password.enroll once the account is set up.
export default function findPendingInvitees(huntId?: string) {
  return MeteorUsers.find(
    {
      "services.password.enroll.reason": "enroll",
      mergedInto: { $exists: false },
      ...(huntId !== undefined ? { hunts: huntId } : {}),
    },
    {
      // Never publish the enrolment token itself
      projection: {
        "services.password.enroll.email": 1,
        "services.password.enroll.when": 1,
        hunts: 1,
        displayName: 1,
      },
    },
  );
}
