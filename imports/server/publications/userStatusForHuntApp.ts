import { check, Match } from "meteor/check";
import Logger from "../../Logger";
import MeteorUsers from "../../lib/models/MeteorUsers";
import UserStatuses, { PRESENCE_STATUSES } from "../../lib/models/UserStatuses";
import userStatusForHuntApp from "../../lib/publications/userStatusForHuntApp";
import serverId from "../serverId";
import definePublication from "./definePublication";

// The newest subscription for a connection and hunt owns that connection's
// status row. HuntApp re-subscribes on every visibility change, and the new
// subscription starts before the old one stops, so without this the old
// subscription's stop handler would flip the freshly written status back to
// offline.
const rowOwners = new Map<string, object>();

// The only writer of presence rows: subscribing records the status, and the
// stop handler marks the connection offline. The stop is what notices a
// closed tab or a dropped connection as well as leaving the hunt.
definePublication(userStatusForHuntApp, {
  validate(arg) {
    check(arg, { hunt: String, status: Match.OneOf(...PRESENCE_STATUSES) });
    return arg;
  },

  async run({ hunt, status }) {
    if (!this.userId) {
      return [];
    }
    const userId = this.userId;

    const user = await MeteorUsers.findOneAsync(userId);
    if (!user?.hunts?.includes(hunt)) {
      return [];
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

    // Meteor waits for each stop handler in turn, so the write is done by the
    // time the subscription has finished stopping
    this.onStop(async () => {
      if (rowOwners.get(ownerKey) !== owner) {
        return;
      }
      rowOwners.delete(ownerKey);
      try {
        await UserStatuses.updateAsync(selector, {
          $set: { status: "offline" },
        });
      } catch (error) {
        Logger.error("Failed to mark user offline", {
          error,
          user: userId,
          hunt,
        });
      }
    });

    return [];
  },
});
