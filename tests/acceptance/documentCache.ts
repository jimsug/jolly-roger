import { promisify } from "node:util";
import { Accounts } from "meteor/accounts-base";
import { check } from "meteor/check";
import { Meteor } from "meteor/meteor";
import { Random } from "meteor/random";
import { assert } from "chai";
import purgeHuntDocumentCacheJob from "../../imports/lib/jobs/purgeHuntDocumentCache";
import Hunts from "../../imports/lib/models/Hunts";
import Jobs from "../../imports/lib/models/Jobs";
import MeteorUsers from "../../imports/lib/models/MeteorUsers";
import provisionFirstUser from "../../imports/methods/provisionFirstUser";
import purgeHuntDocumentCache from "../../imports/methods/purgeHuntDocumentCache";
import TypedMethod from "../../imports/methods/TypedMethod";
import resetDatabase from "../lib/resetDatabase";
import { USER_EMAIL, USER_PASSWORD } from "./lib";

// Test-only helper methods
const createUser = new TypedMethod<{ email: string; password: string }, string>(
  "test.methods.documentCache.createUser",
);
const createHunt = new TypedMethod<
  { name: string; memberIds: string[] },
  string
>("test.methods.documentCache.createHunt");
const queuedPurges = new TypedMethod<{ huntId: string }, number>(
  "test.methods.documentCache.queuedPurges",
);

if (Meteor.isServer) {
  const defineMethod: typeof import("../../imports/server/methods/defineMethod").default =
    require("../../imports/server/methods/defineMethod").default;

  defineMethod(createUser, {
    validate(arg: unknown) {
      check(arg, { email: String, password: String });
      return arg;
    },

    run({ email, password }) {
      if (!Meteor.isAppTest) {
        throw new Meteor.Error(500, "This code must not run in production");
      }

      return Accounts.createUserAsync({ email, password });
    },
  });

  defineMethod(createHunt, {
    validate(arg: unknown) {
      check(arg, { name: String, memberIds: [String] });
      return arg;
    },

    async run({ name, memberIds }) {
      if (!Meteor.isAppTest) {
        throw new Meteor.Error(500, "This code must not run in production");
      }

      const huntId = await Hunts.insertAsync({ name, hasGuessQueue: true });
      await MeteorUsers.updateAsync(
        { _id: { $in: memberIds } },
        { $addToSet: { hunts: huntId } },
        { multi: true },
      );
      return huntId;
    },
  });

  defineMethod(queuedPurges, {
    validate(arg: unknown) {
      check(arg, { huntId: String });
      return arg;
    },

    run({ huntId }) {
      if (!Meteor.isAppTest) {
        throw new Meteor.Error(500, "This code must not run in production");
      }

      return Jobs.find({
        type: purgeHuntDocumentCacheJob.name,
        "args.huntId": huntId,
      }).countAsync();
    },
  });
}

if (Meteor.isClient) {
  const login = (email: string, password: string) =>
    promisify(Meteor.loginWithPassword)(email, password);

  const loginAsAdmin = async () => {
    await provisionFirstUser.callPromise({
      email: USER_EMAIL,
      password: USER_PASSWORD,
    });
    await login(USER_EMAIL, USER_PASSWORD);
  };

  describe("purgeHuntDocumentCache", function () {
    it("refuses hunt members who aren't admins", async function () {
      await resetDatabase("purgeHuntDocumentCache member");
      await loginAsAdmin();
      const memberId = await createUser.callPromise({
        email: "member@example.com",
        password: "password",
      });
      const huntId = await createHunt.callPromise({
        name: "Cached hunt",
        memberIds: [memberId],
      });
      await promisify(Meteor.logout)();
      await login("member@example.com", "password");

      await assert.isRejected(
        purgeHuntDocumentCache.callPromise({ huntId }),
        /Must be admin/,
      );
      assert.equal(await queuedPurges.callPromise({ huntId }), 0);
    });

    it("refuses an unknown hunt", async function () {
      await resetDatabase("purgeHuntDocumentCache unknown hunt");
      await loginAsAdmin();

      await assert.isRejected(
        purgeHuntDocumentCache.callPromise({ huntId: Random.id() }),
        /Unknown hunt id/,
      );
    });
  });
}
