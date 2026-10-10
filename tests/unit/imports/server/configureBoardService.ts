import { Accounts } from "meteor/accounts-base";
import { Meteor } from "meteor/meteor";
import { assert } from "chai";
import { GLOBAL_SCOPE } from "../../../../imports/lib/isAdmin";
import type { EditableHuntType } from "../../../../imports/lib/models/Hunts";
import Hunts from "../../../../imports/lib/models/Hunts";
import MeteorUsers from "../../../../imports/lib/models/MeteorUsers";
import Settings from "../../../../imports/lib/models/Settings";
import settingsAll from "../../../../imports/lib/publications/settingsAll";
import settingsByName from "../../../../imports/lib/publications/settingsByName";
import configureBoardService from "../../../../imports/methods/configureBoardService";
import configureClearBoardService from "../../../../imports/methods/configureClearBoardService";
import createHunt from "../../../../imports/methods/createHunt";
import rotateBoardServiceCredentials from "../../../../imports/methods/rotateBoardServiceCredentials";
import { SERVICE_ACCOUNT_DISPLAY_NAME } from "../../../../imports/server/boardServiceAccount";
import asUser from "../../../lib/asUser";
import createTestHunt from "../../../lib/createTestHunt";
import resetDatabase from "../../../lib/resetDatabase";
import StubSubscription, {
  publishHandler,
} from "../../../lib/StubSubscription";

// Whether the password logs the account in, as the service's login would
const passwordWorks = async (userId: string, password: string) => {
  const user = (await MeteorUsers.findOneAsync(userId))!;
  const { error } = await (
    Accounts as unknown as {
      _checkPasswordAsync: (
        u: Meteor.User,
        p: string,
      ) => Promise<{ userId: string; error?: Error }>;
    }
  )._checkPasswordAsync(user, password);
  return error === undefined;
};

describe("configureBoardService", function () {
  this.timeout(30000);

  let adminId: string;
  let memberId: string;
  let huntId: string;

  before(async function () {
    await resetDatabase("configureBoardService");
    adminId = await Accounts.createUserAsync({
      email: "admin@example.com",
      password: "password",
    });
    await MeteorUsers.updateAsync(adminId, {
      $set: { roles: { [GLOBAL_SCOPE]: ["admin"] } },
    });
    memberId = await Accounts.createUserAsync({
      email: "member@example.com",
      password: "password",
    });
    await MeteorUsers.updateAsync(memberId, {
      $set: { displayName: "Member" },
    });
    huntId = await createTestHunt(adminId);
    await MeteorUsers.updateAsync(
      { _id: { $in: [adminId, memberId] } },
      { $set: { hunts: [huntId] } },
      { multi: true },
    );
  });

  beforeEach(async function () {
    await Settings.removeAsync({ name: "board.service" });
    await MeteorUsers.removeAsync({ serviceAccount: true });
    await Hunts.removeAsync({ _id: { $ne: huntId } });
  });

  const configure = (
    userId: string,
    args: Parameters<typeof configureBoardService.callPromise>[0],
  ) => asUser(userId, () => configureBoardService.callPromise(args));
  const rotate = (userId: string) =>
    asUser(userId, () => rotateBoardServiceCredentials.callPromise());

  const stored = async () =>
    (await Settings.findOneAsync({ name: "board.service" }))?.value;
  const serviceAccount = () =>
    MeteorUsers.findOneAsync({ serviceAccount: true });

  it("is for admins only", async function () {
    await assert.isRejected(
      configure(memberId, {
        url: "https://board.example.com",
        secret: "s".repeat(32),
      }),
      Meteor.Error,
    );
    assert.isUndefined(await stored());
    assert.isUndefined(await serviceAccount());
  });

  it("makes the service's account the first time, an ordinary user with no roles, and hands its login back once", async function () {
    const credentials = await configure(adminId, {
      url: "https://board.example.com",
      secret: "s".repeat(32),
    });
    assert.isDefined(credentials);
    assert.match(
      credentials.email,
      /^board-service\+[a-z0-9]{8}@[^@]+\.[a-z]+$/,
    );
    assert.lengthOf(credentials.password, 32);

    const account = (await serviceAccount())!;
    assert.equal((await stored())?.serviceUserId, account._id);
    assert.deepEqual(
      account.emails?.map((e) => e.address),
      [credentials.email],
    );
    assert.isTrue(account.serviceAccount);
    assert.equal(account.displayName, SERVICE_ACCOUNT_DISPLAY_NAME);
    assert.isUndefined(account.roles);
    assert.isTrue(await passwordWorks(account._id, credentials.password));
    assert.isFalse(await passwordWorks(account._id, "not the password"));
    // The service's account is a user like any other: only the hash is kept
    assert.notInclude(JSON.stringify(account), credentials.password);
  });

  it("stores the service, trimming the URL, and keeps the secret and the account when it's saved again", async function () {
    const first = await configure(adminId, {
      url: " https://board.example.com/ ",
      secret: "s".repeat(32),
    });
    const serviceUserId = (await stored())!.serviceUserId;
    assert.deepEqual(await stored(), {
      url: "https://board.example.com",
      secret: "s".repeat(32),
      serviceUserId,
    });

    const again = await configure(adminId, {
      url: "https://boards.example.com",
    });
    assert.isUndefined(again);
    assert.deepEqual(await stored(), {
      url: "https://boards.example.com",
      secret: "s".repeat(32),
      serviceUserId,
    });
    assert.equal(
      await MeteorUsers.find({ serviceAccount: true }).countAsync(),
      1,
    );
    assert.isTrue(await passwordWorks(serviceUserId, first!.password));
  });

  it("makes the account again if it's gone", async function () {
    await configure(adminId, {
      url: "https://board.example.com",
      secret: "s".repeat(32),
    });
    const lost = (await stored())!.serviceUserId;
    await MeteorUsers.removeAsync(lost);
    const credentials = await configure(adminId, {
      url: "https://board.example.com",
    });
    assert.isDefined(credentials);
    const replacement = (await stored())!.serviceUserId;
    assert.notEqual(replacement, lost);
    assert.isTrue(await passwordWorks(replacement, credentials.password));
  });

  it("needs a secret the first time and an http(s) URL, and makes no account until it has them", async function () {
    await assert.isRejected(
      configure(adminId, { url: "https://board.example.com" }),
      /secret/,
    );
    await assert.isRejected(
      configure(adminId, {
        url: "ftp://board.example.com",
        secret: "s".repeat(32),
      }),
      /URL/,
    );
    assert.isUndefined(await stored());
    assert.isUndefined(await serviceAccount());
  });

  it("rotates the password for admins, keeping the address and dropping the old password and its sessions", async function () {
    const made = (await configure(adminId, {
      url: "https://board.example.com",
      secret: "s".repeat(32),
    }))!;
    const serviceUserId = (await stored())!.serviceUserId;
    await MeteorUsers.updateAsync(serviceUserId, {
      $set: { "services.resume.loginTokens": [{ hashedToken: "x" }] },
    });

    await assert.isRejected(rotate(memberId), Meteor.Error);
    assert.isTrue(await passwordWorks(serviceUserId, made.password));

    const rotated = await rotate(adminId);
    assert.equal(rotated.email, made.email);
    assert.lengthOf(rotated.password, 32);
    assert.notEqual(rotated.password, made.password);
    assert.isTrue(await passwordWorks(serviceUserId, rotated.password));
    assert.isFalse(await passwordWorks(serviceUserId, made.password));
    const account = (await MeteorUsers.findOneAsync(serviceUserId))!;
    assert.isUndefined(
      (account.services as { resume?: { loginTokens?: unknown[] } }).resume
        ?.loginTokens,
    );
    assert.equal((await stored())?.serviceUserId, serviceUserId);
  });

  it("has nothing to rotate until the service is set up", async function () {
    await assert.isRejected(rotate(adminId), /set up/);
  });

  it("keeps the secret off the settings publications", async function () {
    await configure(adminId, {
      url: "https://board.example.com",
      secret: "s".repeat(32),
    });
    const serviceUserId = (await stored())!.serviceUserId;
    for (const [name, args] of [
      [settingsAll.name, undefined],
      [settingsByName.name, { name: "board.service" }],
    ] as const) {
      const sub = new StubSubscription(adminId);
      const cursor = await publishHandler(name).call(sub, args);
      const docs = await cursor.fetchAsync();
      const setting = docs.find(
        (doc: { name: string }) => doc.name === "board.service",
      );
      assert.isDefined(setting, name);
      assert.equal(setting.value.url, "https://board.example.com");
      assert.equal(setting.value.serviceUserId, serviceUserId);
      assert.notProperty(setting.value, "secret", name);
    }
  });

  it("keeps the account off the profile lists of its hunts", async function () {
    await configure(adminId, {
      url: "https://board.example.com",
      secret: "s".repeat(32),
    });
    for (const [name, args] of [
      ["huntProfiles", huntId],
      ["allProfiles", undefined],
    ] as const) {
      const sub = new StubSubscription(memberId);
      await publishHandler(name).call(sub, args);
      const published = sub.published("users");
      assert.sameMembers([...published.keys()], [adminId, memberId], name);
      await sub.stopAsync();
    }
  });

  describe("membership", function () {
    const huntFields: EditableHuntType = {
      name: "Another hunt",
      mailingLists: [],
      openSignups: false,
      hasGuessQueue: true,
      defaultRoles: [],
      allowUnlockablePuzzles: false,
      isArchived: false,
      customLinkEmbed: false,
    };
    const serviceHunts = async () =>
      (await serviceAccount())?.hunts?.toSorted() ?? [];

    it("puts the account in every hunt that isn't deleted when the setting is saved, and again on each save and rotation", async function () {
      const second = await createTestHunt(adminId, { name: "Second" });
      const gone = await createTestHunt(adminId, { name: "Gone" });
      await Hunts.removeAsync(gone);
      await configure(adminId, {
        url: "https://board.example.com",
        secret: "s".repeat(32),
      });
      assert.deepEqual(await serviceHunts(), [huntId, second].toSorted());
      const account = (await serviceAccount())!;
      assert.isUndefined(account.roles);

      // A hunt made by hand, as a migration or a fixture would, is caught
      // up by the next save or rotation
      const third = await createTestHunt(adminId, { name: "Third" });
      await configure(adminId, { url: "https://board.example.com" });
      assert.deepEqual(
        await serviceHunts(),
        [huntId, second, third].toSorted(),
      );
      const fourth = await createTestHunt(adminId, { name: "Fourth" });
      await rotate(adminId);
      assert.deepEqual(
        await serviceHunts(),
        [huntId, second, third, fourth].toSorted(),
      );
    });

    it("puts the account in a hunt as it's created, once there is a service", async function () {
      const before = await asUser(adminId, () =>
        createHunt.callPromise({ ...huntFields, initialTags: [] }),
      );
      await configure(adminId, {
        url: "https://board.example.com",
        secret: "s".repeat(32),
      });
      const after = await asUser(adminId, () =>
        createHunt.callPromise({ ...huntFields, initialTags: [] }),
      );
      assert.deepEqual(
        await serviceHunts(),
        [huntId, before, after].toSorted(),
      );
      // Membership without the trimmings of an invitation: no role
      assert.isUndefined((await serviceAccount())!.roles);
    });
  });

  it("can be cleared by an admin, and only an admin", async function () {
    await configure(adminId, {
      url: "https://board.example.com",
      secret: "s".repeat(32),
    });
    await assert.isRejected(
      asUser(memberId, () => configureClearBoardService.callPromise()),
      Meteor.Error,
    );
    assert.isDefined(await stored());
    await asUser(adminId, () => configureClearBoardService.callPromise());
    assert.isUndefined(await stored());
  });
});
