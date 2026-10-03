import { Random } from "meteor/random";
import { assert } from "chai";
import Hunts from "../../../../imports/lib/models/Hunts";
import { backfillHuntAdminFields } from "../../../../imports/server/migrations/54-backfill-hunt-admin-fields";
import resetDatabase from "../../../lib/resetDatabase";

// Inserts a hunt shaped like one written before the hunt-admin fields
// existed: none of the new required fields, plus a field the schema has since
// dropped. Document validation is bypassed because that is the point.
async function insertLegacyHunt(extra: Record<string, unknown> = {}) {
  const _id = Random.id();
  await Hunts.collection.rawCollection().insertOne(
    {
      _id,
      name: "Legacy hunt",
      mailingLists: [],
      openSignups: false,
      hasGuessQueue: true,
      allowPuzzleEmbed: true,
      deleted: false,
      createdAt: new Date(),
      createdBy: Random.id(),
      updatedAt: new Date(),
      ...extra,
    } as any,
    { bypassDocumentValidation: true },
  );
  return _id;
}

describe("backfillHuntAdminFields migration", function () {
  it("makes hunts from before the fields existed writable again", async function () {
    await resetDatabase("backfillHuntAdminFields legacy");
    const huntId = await insertLegacyHunt();

    // Without the backfill, the schema validator rejects any update
    await assert.isRejected(
      Hunts.destroyAsync(huntId),
      /Document failed validation/,
    );

    await backfillHuntAdminFields();

    const hunt = await Hunts.findOneAsync(huntId);
    assert.deepEqual(hunt?.defaultRoles, []);
    assert.isFalse(hunt?.isArchived);
    assert.isFalse(hunt?.customLinkEmbed);
    assert.isFalse(hunt?.allowUnlockablePuzzles);
    assert.notProperty(hunt ?? {}, "allowPuzzleEmbed");

    await Hunts.destroyAsync(huntId);
    assert.isUndefined(await Hunts.findOneAsync(huntId));
  });

  it("keeps values that are already set and fixes deleted hunts too", async function () {
    await resetDatabase("backfillHuntAdminFields deleted");
    const huntId = await insertLegacyHunt({
      isArchived: true,
      deleted: true,
      originalHuntUrlRegex: "^https://example.com/",
    });

    await backfillHuntAdminFields();

    const hunt = await Hunts.findOneDeletedAsync(huntId);
    assert.isTrue(hunt?.isArchived);
    assert.deepEqual(hunt?.defaultRoles, []);
    assert.notProperty(hunt ?? {}, "allowPuzzleEmbed");
    assert.notProperty(hunt ?? {}, "originalHuntUrlRegex");

    await Hunts.undestroyAsync(huntId);
    assert.isDefined(await Hunts.findOneAsync(huntId));
  });
});
