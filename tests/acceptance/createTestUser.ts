import { Accounts } from "meteor/accounts-base";
import { check } from "meteor/check";
import { Meteor } from "meteor/meteor";
import MeteorUsers from "../../imports/lib/models/MeteorUsers";
import TypedMethod from "../../imports/methods/TypedMethod";

// Test-only helper to create a (non-admin) user without going through the
// invitation flow.
const createTestUser = new TypedMethod<
  { email: string; password: string; displayName: string },
  string
>("test.methods.createUser");

if (Meteor.isServer) {
  const defineMethod: typeof import("../../imports/server/methods/defineMethod").default =
    require("../../imports/server/methods/defineMethod").default;

  defineMethod(createTestUser, {
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

export default createTestUser;
