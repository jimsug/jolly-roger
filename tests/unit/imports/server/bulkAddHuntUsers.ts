import { Accounts } from "meteor/accounts-base";
import { Meteor } from "meteor/meteor";
import { assert } from "chai";
import sinon from "sinon";
import MeteorUsers from "../../../../imports/lib/models/MeteorUsers";
import bulkAddHuntUsers from "../../../../imports/methods/bulkAddHuntUsers";
import asUser from "../../../lib/asUser";
import createTestHunt from "../../../lib/createTestHunt";
import resetDatabase from "../../../lib/resetDatabase";

describe("bulkAddHuntUsers", function () {
  it("reports failures without passing on the server's own error text", async function () {
    await resetDatabase("bulkAddHuntUsers");
    const inviter = await Accounts.createUserAsync({
      email: "inviter@example.com",
      password: "password",
    });
    const huntId = await createTestHunt(inviter, { openSignups: true });
    await MeteorUsers.updateAsync(inviter, { $set: { hunts: [huntId] } });

    const send = sinon.stub(Accounts, "sendEnrollmentEmail");
    send
      .onFirstCall()
      .rejects(new Error("535 rejected login for smtp://jr:hunter2@mail"));
    send.onSecondCall().rejects(new Meteor.Error(400, "That address bounced"));
    let error: unknown;
    try {
      await asUser(inviter, () =>
        bulkAddHuntUsers.callPromise({
          huntId,
          emails: ["one@example.com", "two@example.com"],
        }),
      );
    } catch (e) {
      error = e;
    } finally {
      send.restore();
    }

    assert.instanceOf(error, Meteor.Error);
    const reason = error.reason ?? "";
    assert.include(reason, "one@example.com: couldn't send the invite");
    assert.notInclude(reason, "hunter2");
    // A Meteor.Error's reason is meant for the caller, so it still shows
    assert.match(reason, /two@example\.com: .*That address bounced/);
  });
});
