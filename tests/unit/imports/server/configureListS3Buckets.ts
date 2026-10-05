import { Accounts } from "meteor/accounts-base";
import { S3Client } from "@aws-sdk/client-s3";
import { assert } from "chai";
import sinon from "sinon";
import { GLOBAL_SCOPE } from "../../../../imports/lib/isAdmin";
import MeteorUsers from "../../../../imports/lib/models/MeteorUsers";
import configureListS3Buckets from "../../../../imports/methods/configureListS3Buckets";
import asUser from "../../../lib/asUser";
import resetDatabase from "../../../lib/resetDatabase";

describe("configureListS3Buckets", function () {
  this.timeout(30000);

  let adminId: string;

  before(async function () {
    await resetDatabase("configureListS3Buckets");
    adminId = await Accounts.createUserAsync({
      email: "admin@example.com",
      password: "password",
    });
    await MeteorUsers.updateAsync(adminId, {
      $set: { roles: { [GLOBAL_SCOPE]: ["admin"] } },
    });
  });

  afterEach(function () {
    sinon.restore();
  });

  it("leaves out buckets without a name", async function () {
    sinon
      .stub(S3Client.prototype, "send")
      .resolves({ Buckets: [{ Name: "first" }, {}, { Name: "second" }] });
    const buckets = await asUser(adminId, () =>
      configureListS3Buckets.callPromise(),
    );
    assert.deepEqual(buckets, ["first", "second"]);
  });
});
