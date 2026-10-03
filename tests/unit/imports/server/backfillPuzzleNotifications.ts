import { Random } from "meteor/random";
import { assert } from "chai";
import PuzzleNotifications from "../../../../imports/lib/models/PuzzleNotifications";
import { backfillPuzzleNotifications } from "../../../../imports/server/migrations/55-backfill-puzzle-notifications";
import resetDatabase from "../../../lib/resetDatabase";

// Inserts a notification shaped like one the fork wrote before `background`
// existed. Document validation is bypassed because that is the point.
async function insertLegacyNotification(extra: Record<string, unknown> = {}) {
  const _id = Random.id();
  await PuzzleNotifications.collection.rawCollection().insertOne(
    {
      _id,
      user: Random.id(),
      hunt: Random.id(),
      puzzle: Random.id(),
      content: "Legacy notification",
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

describe("backfillPuzzleNotifications migration", function () {
  it("makes notifications from before background existed writable again", async function () {
    await resetDatabase("backfillPuzzleNotifications legacy");
    const dingId = await insertLegacyNotification({
      className: "text-bg-white",
    });
    const ephemeralId = await insertLegacyNotification({ ephemeral: true });

    // Without the backfill, the schema validator rejects any update
    await assert.isRejected(
      PuzzleNotifications.destroyAsync(dingId),
      /Document failed validation/,
    );

    await backfillPuzzleNotifications();

    const ding = await PuzzleNotifications.findOneAsync(dingId);
    assert.equal(ding?.background, "secondary");
    assert.notProperty(ding ?? {}, "className");
    const ephemeral = await PuzzleNotifications.findOneAsync(ephemeralId);
    assert.equal(ephemeral?.background, "info");

    await PuzzleNotifications.destroyAsync(dingId);
    assert.isUndefined(await PuzzleNotifications.findOneAsync(dingId));
  });

  it("keeps backgrounds that are already set and fixes deleted rows too", async function () {
    await resetDatabase("backfillPuzzleNotifications deleted");
    const keptId = await insertLegacyNotification({
      background: "warning",
      className: "text-bg-white",
    });
    const deletedId = await insertLegacyNotification({ deleted: true });

    await backfillPuzzleNotifications();

    const kept = await PuzzleNotifications.findOneAsync(keptId);
    assert.equal(kept?.background, "warning");
    assert.notProperty(kept ?? {}, "className");

    const deleted = await PuzzleNotifications.findOneDeletedAsync(deletedId);
    assert.equal(deleted?.background, "secondary");
    await PuzzleNotifications.undestroyAsync(deletedId);
    assert.isDefined(await PuzzleNotifications.findOneAsync(deletedId));
  });
});
