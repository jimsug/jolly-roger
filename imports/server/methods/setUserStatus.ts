import { check, Match } from "meteor/check";
import UserStatuses from "../../lib/models/UserStatuses";
import setUserStatus from "../../methods/setUserStatus";
import { serverId } from "../garbage-collection";
import defineMethod from "./defineMethod";

defineMethod(setUserStatus, {
  validate(arg) {
    check(arg, {
      hunt: String,
      type: String,
      status: String,
      puzzle: Match.Optional(String),
    });

    return {
      ...arg,
      puzzle: arg.puzzle ?? undefined,
    };
  },

  async run({ hunt, type, status, puzzle }) {
    check(this.userId, String);

    const user = this.userId;

    const query: Record<string, string | undefined> = {
      hunt,
      user,
      type,
      server: serverId,
      connection: this.connection?.id,
    };

    if (puzzle) {
      query.puzzle = puzzle;
    }

    await UserStatuses.upsertAsync(query, {
      $set: {
        status: status,
      },
    });
  },
});
