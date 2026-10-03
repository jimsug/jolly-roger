import { promisify } from "node:util";
import { Accounts } from "meteor/accounts-base";
import { check } from "meteor/check";
import { Meteor } from "meteor/meteor";
import { assert } from "chai";
import type { EditableHuntType } from "../../imports/lib/models/Hunts";
import MeteorUsers from "../../imports/lib/models/MeteorUsers";
import Tags from "../../imports/lib/models/Tags";
import { pendingEnrollment } from "../../imports/lib/models/User";
import invitedUsers from "../../imports/lib/publications/invitedUsers";
import puzzlesForPuzzleList from "../../imports/lib/publications/puzzlesForPuzzleList";
import addHuntUser from "../../imports/methods/addHuntUser";
import createHunt from "../../imports/methods/createHunt";
import provisionFirstUser from "../../imports/methods/provisionFirstUser";
import TypedMethod from "../../imports/methods/TypedMethod";
import resetDatabase from "../lib/resetDatabase";
import { USER_EMAIL, USER_PASSWORD } from "./lib";

// Test-only helper to create a (non-admin) user without going through the
// invitation flow.
const createUser = new TypedMethod<
  { email: string; password: string; displayName: string },
  string
>("test.methods.hunts.createUser");

if (Meteor.isServer) {
  const defineMethod: typeof import("../../imports/server/methods/defineMethod").default =
    require("../../imports/server/methods/defineMethod").default;

  defineMethod(createUser, {
    validate(arg: unknown) {
      check(arg, { email: String, password: String, displayName: String });
      return arg;
    },

    async run({ email, password, displayName }) {
      if (!Meteor.isAppTest) {
        throw new Meteor.Error(500, "This code must not run in production");
      }

      const userId = await Accounts.createUserAsync({ email, password });
      await MeteorUsers.updateAsync(userId, { $set: { displayName } });
      return userId;
    },
  });
}

if (Meteor.isClient) {
  const typedSubscribe = require("../../imports/client/typedSubscribe")
    .default as typeof import("../../imports/client/typedSubscribe").default;

  const huntFields: EditableHuntType = {
    name: "Test Hunt",
    mailingLists: [],
    openSignups: false,
    hasGuessQueue: true,
    defaultRoles: [],
    allowUnlockablePuzzles: false,
    isArchived: false,
    customLinkEmbed: false,
  };

  const loginAsFirstUser = async () => {
    await provisionFirstUser.callPromise({
      email: USER_EMAIL,
      password: USER_PASSWORD,
    });
    await promisify(Meteor.loginWithPassword)(USER_EMAIL, USER_PASSWORD);
  };

  describe("hunt administration", function () {
    describe("createHunt", function () {
      it("creates the requested initial tags", async function () {
        await resetDatabase("hunt administration createHunt initial tags");
        await loginAsFirstUser();

        const huntId = await createHunt.callPromise({
          ...huntFields,
          initialTags: " is:meta, group:events ,, is:meta",
        });
        // Join the hunt so we can see its tags
        await addHuntUser.callPromise({ huntId, email: USER_EMAIL });

        const sub = await typedSubscribe.async(puzzlesForPuzzleList, {
          huntId,
        });
        const tagNames = await Tags.find({ hunt: huntId }).mapAsync(
          (tag) => tag.name,
        );
        assert.sameMembers(
          tagNames,
          ["is:meta", "group:events", "meta-for:events"],
          "Should create exactly the requested tags (plus the meta-for: twin of a group: tag)",
        );
        sub.stop();
      });

      it("creates the default tags when none are specified", async function () {
        await resetDatabase("hunt administration createHunt default tags");
        await loginAsFirstUser();

        const huntId = await createHunt.callPromise(huntFields);
        await addHuntUser.callPromise({ huntId, email: USER_EMAIL });

        const sub = await typedSubscribe.async(puzzlesForPuzzleList, {
          huntId,
        });
        const tagNames = await Tags.find({ hunt: huntId }).mapAsync(
          (tag) => tag.name,
        );
        assert.includeMembers(tagNames, ["is:meta", "priority:high"]);
        sub.stop();
      });

      it("creates no tags when the field is blank", async function () {
        await resetDatabase("hunt administration createHunt no tags");
        await loginAsFirstUser();

        const huntId = await createHunt.callPromise({
          ...huntFields,
          initialTags: "",
        });
        await addHuntUser.callPromise({ huntId, email: USER_EMAIL });

        const sub = await typedSubscribe.async(puzzlesForPuzzleList, {
          huntId,
        });
        assert.equal(await Tags.find({ hunt: huntId }).countAsync(), 0);
        sub.stop();
      });
    });

    describe("invitedUsers publication", function () {
      it("shows pending invitations to admins without the token", async function () {
        await resetDatabase("hunt administration invitedUsers admin");
        await loginAsFirstUser();

        const huntId = await createHunt.callPromise(huntFields);
        await addHuntUser.callPromise({ huntId, email: "invitee@example.com" });

        const sub = await typedSubscribe.async(invitedUsers);
        const invitees = await MeteorUsers.find({
          "services.password.enroll": { $exists: true },
        }).fetchAsync();
        assert.lengthOf(invitees, 1);
        const invitee = invitees[0]!;
        const enrollment = pendingEnrollment(invitee);
        assert.equal(enrollment?.email, "invitee@example.com");
        assert.instanceOf(enrollment?.when, Date);
        assert.notProperty(
          enrollment ?? {},
          "token",
          "The enrollment token must never be published",
        );
        assert.sameMembers(invitee.hunts ?? [], [huntId]);
        sub.stop();
      });

      it("publishes nothing to non-admins", async function () {
        await resetDatabase("hunt administration invitedUsers non-admin");
        await loginAsFirstUser();

        const huntId = await createHunt.callPromise(huntFields);
        await addHuntUser.callPromise({ huntId, email: "invitee@example.com" });

        await createUser.callPromise({
          email: "hunter@example.com",
          password: "password",
          displayName: "Hunter",
        });
        await promisify(Meteor.logout)();
        await promisify(Meteor.loginWithPassword)(
          "hunter@example.com",
          "password",
        );

        const sub = await typedSubscribe.async(invitedUsers);
        assert.equal(
          await MeteorUsers.find({
            "services.password.enroll": { $exists: true },
          }).countAsync(),
          0,
        );
        sub.stop();
      });
    });
  });
}
