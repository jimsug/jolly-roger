import { Accounts } from "meteor/accounts-base";
import { assert } from "chai";
import { GLOBAL_SCOPE } from "../../../../imports/lib/isAdmin";
import APIKeys from "../../../../imports/lib/models/APIKeys";
import MeteorUsers from "../../../../imports/lib/models/MeteorUsers";
import createAPIKey from "../../../../imports/methods/createAPIKey";
import destroyAPIKey from "../../../../imports/methods/destroyAPIKey";
import asUser from "../../../lib/asUser";
import resetDatabase from "../../../lib/resetDatabase";

describe("destroyAPIKey", function () {
  this.timeout(30000);

  let adminId: string;
  let ownerId: string;
  let otherId: string;

  beforeEach(async function () {
    await resetDatabase("destroyAPIKey");
    adminId = await Accounts.createUserAsync({
      email: "admin@example.com",
      password: "password",
    });
    await MeteorUsers.updateAsync(adminId, {
      $set: { roles: { [GLOBAL_SCOPE]: ["admin"] } },
    });
    ownerId = await Accounts.createUserAsync({
      email: "owner@example.com",
      password: "password",
    });
    otherId = await Accounts.createUserAsync({
      email: "other@example.com",
      password: "password",
    });
  });

  const ownersKey = async () => {
    await asUser(ownerId, () => createAPIKey.callPromise({}));
    const apiKey = await APIKeys.findOneAsync({ user: ownerId });
    assert.isDefined(apiKey);
    return apiKey._id;
  };

  it("lets a user destroy their own key", async function () {
    const apiKeyId = await ownersKey();
    await asUser(ownerId, () => destroyAPIKey.callPromise({ apiKeyId }));
    assert.isUndefined(await APIKeys.findOneAsync(apiKeyId));
  });

  it("lets an admin destroy another user's key", async function () {
    const apiKeyId = await ownersKey();
    await asUser(adminId, () =>
      destroyAPIKey.callPromise({ apiKeyId, forUser: ownerId }),
    );
    assert.isUndefined(await APIKeys.findOneAsync(apiKeyId));
  });

  it("refuses anyone else naming another user", async function () {
    const apiKeyId = await ownersKey();
    await assert.isRejected(
      asUser(otherId, () =>
        destroyAPIKey.callPromise({ apiKeyId, forUser: ownerId }),
      ),
      /Only server admins/,
    );
    await assert.isRejected(
      asUser(otherId, () => destroyAPIKey.callPromise({ apiKeyId })),
      /No API key/,
    );
    assert.isDefined(await APIKeys.findOneAsync(apiKeyId));
  });
});
