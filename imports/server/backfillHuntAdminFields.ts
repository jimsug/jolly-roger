import Hunts from "../lib/models/Hunts";

// Hunts from before the hunt-admin fields existed lack the four new required
// fields, and hunts written by the Palindrome fork may still carry two fields
// the schema no longer declares. The schema validator is already attached by
// the time migrations run, so each document is fixed in a single update that
// leaves it valid (an unset-then-set pair would be rejected midway).
// Validation is bypassed so a hunt that is invalid for some unrelated reason
// doesn't abort the migration; it is no worse off afterwards. The raw
// collection is used so soft-deleted hunts are fixed too.
export default async function backfillHuntAdminFields() {
  await Hunts.collection.rawCollection().updateMany(
    {
      $or: [
        { defaultRoles: { $exists: false } },
        { isArchived: { $exists: false } },
        { customLinkEmbed: { $exists: false } },
        { allowUnlockablePuzzles: { $exists: false } },
        { allowPuzzleEmbed: { $exists: true } },
        { originalHuntUrlRegex: { $exists: true } },
      ],
    },
    [
      {
        $set: {
          defaultRoles: { $ifNull: ["$defaultRoles", []] },
          isArchived: { $ifNull: ["$isArchived", false] },
          customLinkEmbed: { $ifNull: ["$customLinkEmbed", false] },
          allowUnlockablePuzzles: {
            $ifNull: ["$allowUnlockablePuzzles", false],
          },
        },
      },
      { $unset: ["allowPuzzleEmbed", "originalHuntUrlRegex"] },
    ],
    { bypassDocumentValidation: true },
  );
}
