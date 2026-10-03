import UserStatuses from "../lib/models/UserStatuses";
import { registerPeriodicCleanupHook } from "./garbage-collection";

// Presence rows carry the id of the server whose connection wrote them
// (through UserStatuses.publications.forHuntApp, their only writer), so a dead
// server's rows can be swept like its subscribers. Rows written by the
// activity hooks have no server and expire through the TTL index instead.
registerPeriodicCleanupHook(async (deadServer) => {
  await UserStatuses.removeAsync({ server: deadServer });
});
