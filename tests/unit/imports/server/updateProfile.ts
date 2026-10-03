import { Accounts } from "meteor/accounts-base";
import { assert } from "chai";
import MeteorUsers from "../../../../imports/lib/models/MeteorUsers";
import updateProfile from "../../../../imports/methods/updateProfile";
import asUser from "../../../lib/asUser";
import resetDatabase from "../../../lib/resetDatabase";

describe("updateProfile isOffsite", function () {
  this.timeout(30000);

  let userId: string;

  this.beforeAll(async function () {
    await resetDatabase("updateProfile isOffsite");
    userId = await Accounts.createUserAsync({
      email: "remote@example.com",
      password: "password",
    });
  });

  it("saves the flag for the logged-in user", async function () {
    await asUser(userId, () =>
      updateProfile.callPromise({
        displayName: "Remote",
        dingwords: [],
        isOffsite: true,
      }),
    );
    assert.isTrue((await MeteorUsers.findOneAsync(userId))?.isOffsite);

    await asUser(userId, () =>
      updateProfile.callPromise({
        displayName: "Remote",
        dingwords: [],
        isOffsite: false,
      }),
    );
    assert.isFalse((await MeteorUsers.findOneAsync(userId))?.isOffsite);

    // Leaving it out leaves it alone
    await asUser(userId, () =>
      updateProfile.callPromise({ displayName: "Remote", dingwords: [] }),
    );
    assert.isFalse((await MeteorUsers.findOneAsync(userId))?.isOffsite);
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
        isOffsite: true,
      }),
      /enrolling/,
    );
    await updateProfile.callPromise({
      displayName: "Enrollee",
      dingwords: [],
      enrollmentToken: "enroll-token",
    });
    const enrollee = await MeteorUsers.findOneAsync(enrolleeId);
    assert.equal(enrollee?.displayName, "Enrollee");
    assert.isUndefined(enrollee?.isOffsite);
  });
});
