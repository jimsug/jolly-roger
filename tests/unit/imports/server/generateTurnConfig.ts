import crypto from "node:crypto";
import { assert } from "chai";
import { generateTurnConfig } from "../../../../imports/server/mediasoup";

describe("generateTurnConfig", function () {
  it("is unset without a server or any credentials", function () {
    assert.isUndefined(generateTurnConfig({}));
    assert.isUndefined(generateTurnConfig({ TURN_SECRET: "sekrit" }));
    assert.isUndefined(
      generateTurnConfig({ TURN_SERVER: " , ", TURN_SECRET: "sekrit" }),
    );
    assert.isUndefined(generateTurnConfig({ TURN_SERVER: "turn:a" }));
    // A username without a credential doesn't count as static credentials
    assert.isUndefined(
      generateTurnConfig({ TURN_SERVER: "turn:a", TURN_USERNAME: "user" }),
    );
  });

  it("derives time-limited credentials from the shared secret", function () {
    const now = Math.floor(Date.now() / 1000);
    const config = generateTurnConfig({
      TURN_SERVER: "turn:turn.example.com:443",
      TURN_SECRET: "sekrit",
    });
    assert.isDefined(config);
    assert.equal(config.urls, "turn:turn.example.com:443");

    const [validUntil, nonce] = config.username.split(":");
    const threeDays = 3 * 24 * 60 * 60;
    assert.approximately(Number(validUntil), now + threeDays, 5);
    assert.isNotEmpty(nonce);
    assert.equal(
      config.credential,
      crypto
        .createHmac("sha1", "sekrit")
        .update(config.username)
        .digest("base64"),
    );
  });

  it("uses static credentials when both are set", function () {
    const env = {
      TURN_SERVER: "turn:turn.example.com:443",
      TURN_USERNAME: "user",
      TURN_CREDENTIAL: "password",
    };
    assert.deepEqual(generateTurnConfig(env), {
      urls: "turn:turn.example.com:443",
      username: "user",
      credential: "password",
    });
    // and in preference to a shared secret
    assert.deepEqual(
      generateTurnConfig({ ...env, TURN_SECRET: "sekrit" }),
      generateTurnConfig(env),
    );
  });

  it("splits a comma-separated server list", function () {
    const servers =
      "turn:turn.example.com:80, turn:turn.example.com:443?transport=tcp,";
    assert.deepEqual(
      generateTurnConfig({
        TURN_SERVER: servers,
        TURN_USERNAME: "user",
        TURN_CREDENTIAL: "password",
      })?.urls,
      ["turn:turn.example.com:80", "turn:turn.example.com:443?transport=tcp"],
    );
    assert.deepEqual(
      generateTurnConfig({ TURN_SERVER: servers, TURN_SECRET: "sekrit" })?.urls,
      ["turn:turn.example.com:80", "turn:turn.example.com:443?transport=tcp"],
    );
    // A single server stays a plain string
    assert.equal(
      generateTurnConfig({
        TURN_SERVER: " turn:turn.example.com:443 ,",
        TURN_SECRET: "sekrit",
      })?.urls,
      "turn:turn.example.com:443",
    );
  });
});
