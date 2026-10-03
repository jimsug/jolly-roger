import PuzzleNotifications from "../../lib/models/PuzzleNotifications";
import Migrations from "./Migrations";

// Puzzle notifications written by the Palindrome fork before January 2026
// lack `background`, which the schema now requires, and may carry `className`,
// which it no longer declares. Any update to such a row (the account-merge
// job rewrites createdBy, for one) would fail validation. Ephemeral rows were
// the fork's "new puzzle" toasts, which it later gave an "info" background;
// everything else is a tag ding, which uses "secondary". Same pattern as
// migration 54: one pipeline update that leaves each row valid, validation
// bypassed, raw collection so soft-deleted rows are fixed too.
export async function backfillPuzzleNotifications() {
  await PuzzleNotifications.collection.rawCollection().updateMany(
    {
      $or: [
        { background: { $exists: false } },
        { className: { $exists: true } },
      ],
    },
    [
      {
        $set: {
          background: {
            $ifNull: [
              "$background",
              { $cond: [{ $eq: ["$ephemeral", true] }, "info", "secondary"] },
            ],
          },
        },
      },
      { $unset: "className" },
    ],
    { bypassDocumentValidation: true },
  );
}

Migrations.add({
  version: 55,
  name: "Backfill puzzle notification backgrounds and drop className",
  up: backfillPuzzleNotifications,
});
