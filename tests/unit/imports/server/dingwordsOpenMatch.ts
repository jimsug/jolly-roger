import { Accounts } from "meteor/accounts-base";
import { DDP } from "meteor/ddp";
import { assert } from "chai";
import MeteorUsers from "../../../../imports/lib/models/MeteorUsers";
import updateProfile from "../../../../imports/methods/updateProfile";
import resetDatabase from "../../../lib/resetDatabase";

describe("updateProfile dingwordsOpenMatch", function () {
  this.timeout(30000);

  let userId: string;
  const asUser = <T>(fn: () => Promise<T>) =>
    DDP._CurrentMethodInvocation.withValue({ userId }, fn);

  this.beforeAll(async function () {
    await resetDatabase("updateProfile dingwordsOpenMatch");
    userId = await Accounts.createUserAsync({
      email: "dinger@example.com",
      password: "password",
    });
  });

  it("saves the mode for the logged-in user", async function () {
    await asUser(() =>
      updateProfile.callPromise({
        displayName: "Dinger",
        dingwords: ["logic"],
        dingwordsOpenMatch: true,
      }),
    );
    assert.isTrue((await MeteorUsers.findOneAsync(userId))?.dingwordsOpenMatch);

    await asUser(() =>
      updateProfile.callPromise({
        displayName: "Dinger",
        dingwords: ["logic"],
        dingwordsOpenMatch: false,
      }),
    );
    assert.isFalse(
      (await MeteorUsers.findOneAsync(userId))?.dingwordsOpenMatch,
    );

    // Leaving it out leaves it alone
    await asUser(() =>
      updateProfile.callPromise({ displayName: "Dinger", dingwords: [] }),
    );
    assert.isFalse(
      (await MeteorUsers.findOneAsync(userId))?.dingwordsOpenMatch,
    );
  });

  it("isn't accepted on the enrollment path", async function () {
    const enrolleeId = await Accounts.createUserAsync({
      email: "enrollee@example.com",
      password: "password",
    });
    await MeteorUsers.updateAsync(enrolleeId, {
      $set: {
        "services.password.enroll": {
          token: "enroll-token",
          email: "enrollee@example.com",
          when: new Date(),
          reason: "enroll",
        },
      },
    });

    await assert.isRejected(
      updateProfile.callPromise({
        displayName: "Enrollee",
        dingwords: [],
        enrollmentToken: "enroll-token",
        dingwordsOpenMatch: true,
      }),
      /enrolling/,
    );
    assert.isUndefined(
      (await MeteorUsers.findOneAsync(enrolleeId))?.dingwordsOpenMatch,
    );
  });
});
