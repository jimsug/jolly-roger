import { promisify } from "node:util";
import { Meteor } from "meteor/meteor";
import { assert } from "chai";
import type { EditableHuntType } from "../../imports/lib/models/Hunts";
import MeteorUsers from "../../imports/lib/models/MeteorUsers";
import Tags from "../../imports/lib/models/Tags";
import { pendingEnrollment } from "../../imports/lib/models/User";
import invitedUsersAll from "../../imports/lib/publications/invitedUsersAll";
import invitedUsersForHunt from "../../imports/lib/publications/invitedUsersForHunt";
import puzzlesForPuzzleList from "../../imports/lib/publications/puzzlesForPuzzleList";
import addHuntUser from "../../imports/methods/addHuntUser";
import configureDefaultHuntTags from "../../imports/methods/configureDefaultHuntTags";
import createHunt from "../../imports/methods/createHunt";
import provisionFirstUser from "../../imports/methods/provisionFirstUser";
import resetDatabase from "../lib/resetDatabase";
import createUser from "./createTestUser";
import { USER_EMAIL, USER_PASSWORD } from "./lib";

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
          initialTags: ["is:meta", "group:events"],
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

      it("creates the configured default tags when none are specified", async function () {
        await resetDatabase("hunt administration createHunt configured tags");
        await loginAsFirstUser();
        await configureDefaultHuntTags.callPromise({
          defaultHuntTags: " needs:love,, is:meta ",
        });

        const huntId = await createHunt.callPromise(huntFields);
        await addHuntUser.callPromise({ huntId, email: USER_EMAIL });

        const sub = await typedSubscribe.async(puzzlesForPuzzleList, {
          huntId,
        });
        const tagNames = await Tags.find({ hunt: huntId }).mapAsync(
          (tag) => tag.name,
        );
        assert.sameMembers(tagNames, ["needs:love", "is:meta"]);
        sub.stop();

        // Clearing the setting goes back to the built-in list
        await configureDefaultHuntTags.callPromise({ defaultHuntTags: " , " });
        const secondHuntId = await createHunt.callPromise(huntFields);
        await addHuntUser.callPromise({
          huntId: secondHuntId,
          email: USER_EMAIL,
        });
        const secondSub = await typedSubscribe.async(puzzlesForPuzzleList, {
          huntId: secondHuntId,
        });
        const secondTagNames = await Tags.find({
          hunt: secondHuntId,
        }).mapAsync((tag) => tag.name);
        assert.includeMembers(secondTagNames, ["is:meta", "priority:high"]);
        assert.notInclude(secondTagNames, "needs:love");
        secondSub.stop();
      });

      it("creates no tags when given an empty list", async function () {
        await resetDatabase("hunt administration createHunt no tags");
        await loginAsFirstUser();

        const huntId = await createHunt.callPromise({
          ...huntFields,
          initialTags: [],
        });
        await addHuntUser.callPromise({ huntId, email: USER_EMAIL });

        const sub = await typedSubscribe.async(puzzlesForPuzzleList, {
          huntId,
        });
        assert.equal(await Tags.find({ hunt: huntId }).countAsync(), 0);
        sub.stop();
      });
    });

    describe("configureDefaultHuntTags", function () {
      it("rejects regular users and leaves the setting alone", async function () {
        await resetDatabase("hunt administration configureDefaultHuntTags");
        await loginAsFirstUser();
        await configureDefaultHuntTags.callPromise({
          defaultHuntTags: "needs:love",
        });

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
        await assert.isRejected(
          configureDefaultHuntTags.callPromise({ defaultHuntTags: "is:meta" }),
          /Must be admin to configure default hunt tags \[401\]/,
        );

        // New hunts still start with the admin's choice
        await promisify(Meteor.logout)();
        await promisify(Meteor.loginWithPassword)(USER_EMAIL, USER_PASSWORD);
        const huntId = await createHunt.callPromise(huntFields);
        await addHuntUser.callPromise({ huntId, email: USER_EMAIL });
        const sub = await typedSubscribe.async(puzzlesForPuzzleList, {
          huntId,
        });
        assert.sameMembers(
          await Tags.find({ hunt: huntId }).mapAsync((tag) => tag.name),
          ["needs:love"],
        );
        sub.stop();
      });
    });

    describe("invited users publications", function () {
      it("show every pending invitation to admins without the token", async function () {
        await resetDatabase("hunt administration invitedUsersAll admin");
        await loginAsFirstUser();

        const huntId = await createHunt.callPromise(huntFields);
        await addHuntUser.callPromise({ huntId, email: "invitee@example.com" });

        const sub = await typedSubscribe.async(invitedUsersAll);
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

      it("show admins one hunt's pending invitations", async function () {
        await resetDatabase("hunt administration invitedUsersForHunt admin");
        await loginAsFirstUser();

        const huntId = await createHunt.callPromise(huntFields);
        const otherHuntId = await createHunt.callPromise({
          ...huntFields,
          name: "Other Hunt",
        });
        await addHuntUser.callPromise({ huntId, email: "invitee@example.com" });
        await addHuntUser.callPromise({
          huntId: otherHuntId,
          email: "elsewhere@example.com",
        });

        const sub = await typedSubscribe.async(invitedUsersForHunt, { huntId });
        const invitees = await MeteorUsers.find({
          "services.password.enroll": { $exists: true },
        }).fetchAsync();
        assert.deepEqual(
          invitees.map((invitee) => pendingEnrollment(invitee)?.email),
          ["invitee@example.com"],
        );
        assert.notProperty(
          pendingEnrollment(invitees[0]!) ?? {},
          "token",
          "The token must never be published",
        );
        sub.stop();
      });

      it("publish nothing to non-admins", async function () {
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

        const allSub = await typedSubscribe.async(invitedUsersAll);
        const huntSub = await typedSubscribe.async(invitedUsersForHunt, {
          huntId,
        });
        assert.equal(
          await MeteorUsers.find({
            "services.password.enroll": { $exists: true },
          }).countAsync(),
          0,
        );
        allSub.stop();
        huntSub.stop();
      });
    });
  });
}
