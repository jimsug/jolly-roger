import { check, Match } from "meteor/check";
import { Meteor } from "meteor/meteor";
import Logger from "../Logger";
import MeteorUsers from "../lib/models/MeteorUsers";
import UserStatuses, { PRESENCE_STATUSES } from "../lib/models/UserStatuses";
import { registerPeriodicCleanupHook } from "./garbage-collection";
import serverId from "./serverId";

// Presence rows carry the id of the server whose connection wrote them, so a
// dead server's rows can be swept like its subscribers. Rows written by the
// activity hooks have no server and expire through the TTL index instead.
registerPeriodicCleanupHook(async (deadServer) => {
  await UserStatuses.removeAsync({ server: deadServer });
});

// The newest subscription for a connection and hunt owns that connection's
// status row. HuntApp re-subscribes on every visibility change, and the new
// subscription starts before the old one stops, so without this the old
// subscription's stop handler would flip the freshly written status back to
// offline.
const rowOwners = new Map<string, object>();

// Side-effect publication: records the subscriber as present in the hunt for
// as long as the subscription lasts, and offline when it stops. The stop is
// the only path that notices a closed tab or a dropped connection; the
// setUserStatus method covers visibility changes and leaving the hunt page.
Meteor.publish("userStatus.inc", async function (hunt, status) {
  check(hunt, String);
  check(status, Match.OneOf(...PRESENCE_STATUSES));

  if (!this.userId) {
    return [];
  }
  const userId = this.userId;

  const user = await MeteorUsers.findOneAsync(userId);
  if (!user?.hunts?.includes(hunt)) {
    throw new Meteor.Error(403, "Not a member of this hunt");
  }

  const selector = {
    server: serverId,
    connection: this.connection.id,
    user: userId,
    type: "status",
    hunt,
  };
  const ownerKey = `${this.connection.id}:${hunt}`;
  const owner = {};
  rowOwners.set(ownerKey, owner);

  // Earlier offline rows for this user (other tabs, other servers) are
  // superseded now that they're back
  await UserStatuses.removeAsync({
    user: userId,
    type: "status",
    hunt,
    status: "offline",
  });
  await UserStatuses.upsertAsync(selector, { $set: { status } });

  this.onStop(() => {
    if (rowOwners.get(ownerKey) !== owner) {
      return;
    }
    rowOwners.delete(ownerKey);
    UserStatuses.updateAsync(selector, { $set: { status: "offline" } }).catch(
      (error) => {
        Logger.error("Failed to mark user offline", {
          error,
          user: userId,
          hunt,
        });
      },
    );
  });

  return [];
});
