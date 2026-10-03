import type { PresenceStatus } from "../models/UserStatuses";
import TypedPublication from "./TypedPublication";

// Publishes nothing. While it's subscribed, the subscriber's connection counts
// as present in the hunt with the status given (online or away); when it
// stops, the connection is marked offline. HuntApp holds it open for members,
// re-subscribing with the new status as the tab is shown or hidden.
export default new TypedPublication<{ hunt: string; status: PresenceStatus }>(
  "UserStatuses.publications.forHuntApp",
);
