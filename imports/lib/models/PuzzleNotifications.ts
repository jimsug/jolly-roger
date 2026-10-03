import { z } from "zod";
import { foreignKey, nonEmptyString } from "../typedModel/customTypes";
import type { ModelType } from "../typedModel/Model";
import SoftDeletedModel from "../typedModel/SoftDeletedModel";
import withCommon from "../typedModel/withCommon";

// A notification about a puzzle (rather than a chat message), such as a tag
// being added that matches one of the user's dingwords.
const PuzzleNotification = withCommon(
  z.object({
    // The user this notification is for.
    user: foreignKey,
    // The hunt in which the puzzle resides.
    hunt: foreignKey,
    // The puzzle that generated this notification.
    puzzle: foreignKey,
    // The notification text, rendered as the toast body.
    content: nonEmptyString,
    // Ephemeral notifications dismiss themselves after a few seconds.
    ephemeral: z.boolean().optional(),
    // Bootstrap background variant for the toast (e.g. "secondary").
    background: nonEmptyString,
  }),
);

const PuzzleNotifications = new SoftDeletedModel(
  "jr_puzzlenotifications",
  PuzzleNotification,
);
PuzzleNotifications.addIndex({ deleted: 1, user: 1 });
PuzzleNotifications.addIndex({ hunt: 1 });
export type PuzzleNotificationType = ModelType<typeof PuzzleNotifications>;

export default PuzzleNotifications;
