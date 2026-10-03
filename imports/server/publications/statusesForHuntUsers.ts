import { check } from "meteor/check";
import MeteorUsers from "../../lib/models/MeteorUsers";
import UserStatuses, {
  USER_STATUS_RETENTION_MS,
} from "../../lib/models/UserStatuses";
import statusesForHuntUsers from "../../lib/publications/statusesForHuntUsers";
import definePublication from "./definePublication";

definePublication(statusesForHuntUsers, {
  validate(arg) {
    check(arg, { huntId: String });
    return arg;
  },

  async run({ huntId }) {
    if (!this.userId) {
      return [];
    }

    const user = await MeteorUsers.findOneAsync(this.userId);
    if (!user?.hunts?.includes(huntId)) {
      return [];
    }

    // Fixed at subscription time, like the activity publications; the TTL
    // index drops anything older before long anyway
    const cutoff = new Date(Date.now() - USER_STATUS_RETENTION_MS);
    return UserStatuses.find(
      { hunt: huntId, updatedAt: { $gt: cutoff } },
      { projection: { server: 0, connection: 0 } },
    );
  },
});
