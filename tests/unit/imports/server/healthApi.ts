import { Meteor } from "meteor/meteor";
import { MongoInternals } from "meteor/mongo";
import { assert } from "chai";
import sinon from "sinon";

const getHealth = () => fetch(Meteor.absoluteUrl("api/health"));

describe("health API", function () {
  it("reports success without an API key while the database answers", async function () {
    const response = await getHealth();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "success" });
  });

  it("reports an error when the database doesn't answer", async function () {
    const { db } = MongoInternals.defaultRemoteCollectionDriver().mongo;
    const command = sinon.stub(db, "command").rejects(new Error("no answer"));
    try {
      const response = await getHealth();
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { status: "error" });
      assert.isTrue(command.calledWith({ ping: 1 }));
    } finally {
      command.restore();
    }
  });
});
