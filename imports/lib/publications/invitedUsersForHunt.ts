import TypedPublication from "./TypedPublication";

export default new TypedPublication<{ huntId: string }>(
  "MeteorUsers.publications.invitedForHunt",
);
