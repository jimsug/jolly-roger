import { Accounts } from "meteor/accounts-base";
import { Google } from "meteor/google-oauth";
import type { Meteor } from "meteor/meteor";
import { assert } from "chai";
import sinon from "sinon";
import InvitationCodes from "../../../../imports/lib/models/InvitationCodes";
import MeteorUsers from "../../../../imports/lib/models/MeteorUsers";
import accountForGoogleInvitation from "../../../../imports/server/accountForGoogleInvitation";
import asUser from "../../../lib/asUser";
import createTestHunt from "../../../lib/createTestHunt";
import resetDatabase from "../../../lib/resetDatabase";

// accounts-base's runner for registered login handlers, which isn't in
// Meteor's types
type AccountsWithHandlers = typeof Accounts & {
  _runLoginHandlers: (
    invocation: object,
    options: object,
  ) => Promise<{ userId?: string; error?: Meteor.Error }>;
};

// What accountForGoogleInvitation gets for a Google account
const google = (email: string, id: string, verifiedByGoogle = true) => ({
  email,
  verifiedByGoogle,
  id,
  name: "Googler",
  picture: "https://example.com/picture.png",
});

// The serviceData google-oauth hands the login handler
const serviceData = (email: string, id: string, verified: boolean) => ({
  email,
  verified_email: verified,
  id,
  name: "Googler",
  picture: "https://example.com/picture.png",
});

// The record Accounts.sendEnrollmentEmail leaves on an account an operator
// has invited by email
const enrollmentPending = (userId: string, email: string) =>
  MeteorUsers.updateAsync(userId, {
    $set: {
      "services.password.enroll": {
        token: "token",
        email,
        when: new Date(),
        reason: "enroll",
      },
    },
  });

describe("Google sign-in from a hunt invitation", function () {
  this.timeout(30000);

  beforeEach(async function () {
    await resetDatabase("Google sign-in from a hunt invitation");
  });

  afterEach(function () {
    sinon.restore();
  });

  it("takes over the placeholder an email invite created", async function () {
    const placeholderId = await Accounts.createUserAsync({
      email: "invited@example.com",
    });
    await enrollmentPending(placeholderId, "invited@example.com");

    const userId = await accountForGoogleInvitation(
      google("invited@example.com", "google-1"),
    );

    assert.equal(userId, placeholderId);
    const user = await MeteorUsers.findOneAsync(userId);
    assert.equal(user?.googleAccountId, "google-1");
    assert.equal(user?.googleAccount, "invited@example.com");
    assert.equal(user?.displayName, "Googler");
    assert.equal(await MeteorUsers.find().countAsync(), 1);
  });

  it("links an account where the address is verified, keeping its name", async function () {
    const ownerId = await Accounts.createUserAsync({
      email: "Owner@example.com",
      password: "password",
    });
    await MeteorUsers.updateAsync(ownerId, {
      $set: { "emails.0.verified": true, displayName: "Owner" },
    });

    const userId = await accountForGoogleInvitation(
      google("owner@example.com", "google-2"),
    );

    assert.equal(userId, ownerId);
    const user = await MeteorUsers.findOneAsync(userId);
    assert.equal(user?.googleAccountId, "google-2");
    assert.equal(user?.displayName, "Owner");
    assert.equal(await MeteorUsers.find().countAsync(), 1);
  });

  it("leaves an account that only has the address unverified alone", async function () {
    const squatterId = await Accounts.createUserAsync({
      email: "victim@example.com",
      password: "password",
    });

    const userId = await accountForGoogleInvitation(
      google("victim@example.com", "google-3"),
    );

    assert.notEqual(userId, squatterId);
    const squatter = await MeteorUsers.findOneAsync(squatterId);
    assert.notProperty(squatter ?? {}, "googleAccountId");
    assert.deepEqual(squatter?.emails, [
      { address: "victim@example.com", verified: false },
    ]);
    const user = await MeteorUsers.findOneAsync(userId);
    assert.equal(user?.googleAccountId, "google-3");
    assert.equal(user?.googleAccount, "victim@example.com");
    assert.equal(user?.displayName, "Googler");
    assert.notProperty(user ?? {}, "emails");
  });

  it("leaves alone an account its owner emptied of login methods", async function () {
    // A Google-only hunter adds someone else's address, then unlinks Google
    const squatterId = await MeteorUsers.insertAsync({
      createdAt: new Date(),
      emails: [
        { address: "squatter@example.com", verified: true },
        { address: "victim@example.com", verified: false },
      ],
      googleAccount: "squatter@example.com",
      googleAccountId: "google-squatter",
      lastLogin: new Date(),
    });
    await MeteorUsers.updateAsync(squatterId, {
      $unset: { googleAccount: 1, googleAccountId: 1 },
    });

    const userId = await accountForGoogleInvitation(
      google("victim@example.com", "google-6"),
    );

    assert.notEqual(userId, squatterId);
    const squatter = await MeteorUsers.findOneAsync(squatterId);
    assert.notProperty(squatter ?? {}, "googleAccountId");
    const user = await MeteorUsers.findOneAsync(userId);
    assert.equal(user?.googleAccountId, "google-6");
    assert.notProperty(user ?? {}, "emails");
  });

  it("links nothing when Google hasn't verified the address", async function () {
    const ownerId = await Accounts.createUserAsync({
      email: "owner@example.com",
      password: "password",
    });
    await MeteorUsers.updateAsync(ownerId, {
      $set: { "emails.0.verified": true },
    });
    const placeholderId = await Accounts.createUserAsync({
      email: "invited@example.com",
    });
    await enrollmentPending(placeholderId, "invited@example.com");

    const ownerAttempt = await accountForGoogleInvitation(
      google("owner@example.com", "google-7", false),
    );
    const placeholderAttempt = await accountForGoogleInvitation(
      google("invited@example.com", "google-8", false),
    );

    assert.notInclude([ownerId, placeholderId], ownerAttempt);
    assert.notInclude([ownerId, placeholderId], placeholderAttempt);
    assert.notProperty(
      (await MeteorUsers.findOneAsync(ownerId)) ?? {},
      "googleAccountId",
    );
    assert.notProperty(
      (await MeteorUsers.findOneAsync(placeholderId)) ?? {},
      "googleAccountId",
    );
    assert.notProperty(
      (await MeteorUsers.findOneAsync(ownerAttempt)) ?? {},
      "emails",
    );
  });

  it("refuses rather than replace a Google account already linked", async function () {
    const ownerId = await Accounts.createUserAsync({
      email: "owner@example.com",
      password: "password",
    });
    await MeteorUsers.updateAsync(ownerId, {
      $set: {
        "emails.0.verified": true,
        googleAccount: "owner.personal@example.com",
        googleAccountId: "google-personal",
      },
    });

    let error: unknown;
    try {
      await accountForGoogleInvitation(
        google("owner@example.com", "google-work"),
      );
    } catch (e) {
      error = e;
    }

    assert.equal((error as Meteor.Error | undefined)?.error, 403);
    const owner = await MeteorUsers.findOneAsync(ownerId);
    assert.equal(owner?.googleAccountId, "google-personal");
    assert.equal(owner?.googleAccount, "owner.personal@example.com");
    assert.equal(await MeteorUsers.find().countAsync(), 1);
  });

  it("creates an account for someone new", async function () {
    const userId = await accountForGoogleInvitation(
      google("new@example.com", "google-4"),
    );

    const user = await MeteorUsers.findOneAsync(userId);
    assert.deepEqual(user?.emails, [
      { address: "new@example.com", verified: false },
    ]);
    assert.equal(user?.googleAccountId, "google-4");
    assert.equal(user?.displayName, "Googler");
  });

  describe("through the invitation login handler", function () {
    let placeholderId: string;

    beforeEach(async function () {
      const operatorId = await Accounts.createUserAsync({
        email: "operator@example.com",
        password: "password",
      });
      const huntId = await createTestHunt(operatorId);
      await asUser(operatorId, () =>
        InvitationCodes.insertAsync({ hunt: huntId, code: "invite" }),
      );
      placeholderId = await Accounts.createUserAsync({
        email: "invited@example.com",
      });
      await enrollmentPending(placeholderId, "invited@example.com");
    });

    const signIn = (verified: boolean) => {
      sinon.stub(Google, "retrieveCredential").resolves({
        serviceData: serviceData("invited@example.com", "google-5", verified),
      });
      return (Accounts as AccountsWithHandlers)._runLoginHandlers(
        {},
        {
          isJrLogin: true,
          googleCredentials: { key: "key", secret: "secret" },
          allowAutoProvision: { huntInvitationCode: "invite" },
        },
      );
    };

    it("logs in to the placeholder", async function () {
      const result = await signIn(true);

      assert.isUndefined(result.error);
      assert.equal(result.userId, placeholderId);
      assert.equal(
        (await MeteorUsers.findOneAsync(placeholderId))?.googleAccountId,
        "google-5",
      );
    });

    it("leaves the placeholder alone when Google hasn't verified the address", async function () {
      const result = await signIn(false);

      assert.isUndefined(result.error);
      assert.notEqual(result.userId, placeholderId);
      assert.notProperty(
        (await MeteorUsers.findOneAsync(placeholderId)) ?? {},
        "googleAccountId",
      );
    });
  });
});
