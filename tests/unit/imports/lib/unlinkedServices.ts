import { assert } from "chai";
import unlinkedServices from "../../../../imports/lib/unlinkedServices";

const bothOn = { google: true, discord: true };

describe("unlinkedServices", function () {
  it("lists both services for a user who has linked neither", function () {
    assert.deepEqual(unlinkedServices({}, bothOn), ["google", "discord"]);
  });

  it("lists nothing for a user who has linked both", function () {
    assert.deepEqual(
      unlinkedServices(
        {
          googleAccount: "hunter@example.com",
          discordAccount: { id: "1", username: "hunter" },
        },
        bothOn,
      ),
      [],
    );
  });

  it("only counts the services the server has turned on", function () {
    assert.deepEqual(unlinkedServices({}, { google: true, discord: false }), [
      "google",
    ]);
    assert.deepEqual(
      unlinkedServices({ googleAccount: "hunter@example.com" }, bothOn),
      ["discord"],
    );
    assert.deepEqual(
      unlinkedServices({}, { google: false, discord: false }),
      [],
    );
  });

  it("lists nothing without a user", function () {
    assert.deepEqual(unlinkedServices(null, bothOn), []);
    assert.deepEqual(unlinkedServices(undefined, bothOn), []);
  });
});
