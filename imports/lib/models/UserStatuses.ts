import { z } from "zod";
import { foreignKey, nonEmptyString } from "../typedModel/customTypes";
import type { ModelType } from "../typedModel/Model";
import Model from "../typedModel/Model";
import { Id } from "../typedModel/regexes";
import withTimestamps from "../typedModel/withTimestamps";

// Hunt-level presence. "status" rows (online/away/offline) are kept per
// connection by the subscription HuntApp holds open
// (UserStatuses.publications.forHuntApp), their only writer; "puzzleStatus"
// rows (chat/document/call) record the puzzle a user last interacted with, one
// per user per hunt, written by the activity hooks through recordPuzzleStatus.
export const PRESENCE_STATUSES = ["online", "away", "offline"] as const;
export type PresenceStatus = (typeof PRESENCE_STATUSES)[number];

export const PUZZLE_STATUSES = ["document", "chat", "call"] as const;
export type PuzzleStatusSource = (typeof PUZZLE_STATUSES)[number];

// Rows are only read for a week (userStatusesForHunt) and a TTL index drops
// them after that, which is the only cleanup the activity-written rows get.
export const USER_STATUS_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export const UserStatus = withTimestamps(
  z.object({
    // Only set on rows owned by a server connection, so the dead-server
    // cleanup can find them
    server: foreignKey.optional(),
    // The connection ID is not technically a foreign key because it doesn't refer
    // to another database record
    connection: z.string().regex(Id).optional(),
    user: foreignKey,
    // Plain strings rather than enums so rows written before the values were
    // pinned down keep validating; the publication checks presence values on
    // the way in, and recordPuzzleStatus only takes puzzle ones.
    type: nonEmptyString,
    status: nonEmptyString,
    hunt: foreignKey,
    puzzle: foreignKey.optional(),
  }),
);

const UserStatuses = new Model("jr_userstatuses", UserStatus);
UserStatuses.addIndex({ server: 1 });
UserStatuses.addIndex({ hunt: 1, updatedAt: 1 });
UserStatuses.addIndex({ hunt: 1, user: 1, type: 1 });
UserStatuses.addIndex(
  { updatedAt: 1 },
  { expireAfterSeconds: USER_STATUS_RETENTION_MS / 1000 },
);
export type UserStatusType = ModelType<typeof UserStatuses>;

export default UserStatuses;
