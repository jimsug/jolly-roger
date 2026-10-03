import { promisify } from "node:util";
import { Meteor } from "meteor/meteor";
import { waitFor } from "@testing-library/react";
import { assert } from "chai";
import FixtureHunt from "../../imports/FixtureHunt";
import UserStatuses from "../../imports/lib/models/UserStatuses";
import userStatusesForHunt from "../../imports/lib/publications/userStatusesForHunt";
import userStatusForHuntApp from "../../imports/lib/publications/userStatusForHuntApp";
import createFixtureHunt from "../../imports/methods/createFixtureHunt";
import provisionFirstUser from "../../imports/methods/provisionFirstUser";
import resetDatabase from "../lib/resetDatabase";
import { USER_EMAIL, USER_PASSWORD } from "./lib";

if (Meteor.isClient) {
  const typedSubscribe = require("../../imports/client/typedSubscribe")
    .default as typeof import("../../imports/client/typedSubscribe").default;

  describe("presence", function () {
    const huntId = FixtureHunt._id;
    const subs: Meteor.SubscriptionHandle[] = [];

    afterEach(function () {
      subs.splice(0).forEach((sub) => {
        sub.stop();
      });
    });

    // The status the hunter list sees for the logged-in user, as it reaches
    // the client
    const ownStatusIs = (status: string) =>
      waitFor(async () => {
        const row = await UserStatuses.findOneAsync({
          user: Meteor.userId()!,
          type: "status",
        });
        assert.equal(row?.status, status);
      });

    it("records a member's status until the subscription stops", async function () {
      this.timeout(10000);
      await resetDatabase("presence");
      await provisionFirstUser.callPromise({
        email: USER_EMAIL,
        password: USER_PASSWORD,
      });
      await promisify(Meteor.loginWithPassword)(USER_EMAIL, USER_PASSWORD);
      await createFixtureHunt.callPromise();

      subs.push(await typedSubscribe.async(userStatusesForHunt, { huntId }));

      const online = await typedSubscribe.async(userStatusForHuntApp, {
        hunt: huntId,
        status: "online",
      });
      subs.push(online);
      await ownStatusIs("online");

      // Hiding the tab: HuntApp's new subscription starts before the old one
      // stops
      const away = await typedSubscribe.async(userStatusForHuntApp, {
        hunt: huntId,
        status: "away",
      });
      subs.push(away);
      online.stop();
      await ownStatusIs("away");

      away.stop();
      await ownStatusIs("offline");
    });
  });
}
