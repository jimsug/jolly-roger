import { assert } from "chai";
import MeteorUsers from "../../../../imports/lib/models/MeteorUsers";
import { addGoogleAccountIdIndex } from "../../../../imports/server/migrations/57-google-account-id-index";
import resetDatabase from "../../../lib/resetDatabase";

const INDEX_NAME = "googleAccountId_1";

async function hasIndex() {
  const indexes = await MeteorUsers.rawCollection().indexes();
  return indexes.some((index) => index.name === INDEX_NAME);
}

describe("addGoogleAccountIdIndex migration", function () {
  it("adds a single-field googleAccountId index to users", async function () {
    await resetDatabase("addGoogleAccountIdIndex");

    // resetDatabase runs every migration, so start without the index
    if (await hasIndex()) {
      await MeteorUsers.rawCollection().dropIndex(INDEX_NAME);
    }
    assert.isFalse(await hasIndex());

    await addGoogleAccountIdIndex();
    assert.isTrue(await hasIndex());

    // Running it again is harmless
    await addGoogleAccountIdIndex();
    assert.isTrue(await hasIndex());
  });
});
