import { Accounts } from "meteor/accounts-base";
import { Random } from "meteor/random";
import { assert } from "chai";
import { ACTIVITY_GRANULARITY } from "../../../../imports/lib/config/activityTracking";
import CallActivities from "../../../../imports/lib/models/CallActivities";
import ChatMessages from "../../../../imports/lib/models/ChatMessages";
import MeteorUsers from "../../../../imports/lib/models/MeteorUsers";
import type { PresenceStatus } from "../../../../imports/lib/models/UserStatuses";
import UserStatuses, {
  USER_STATUS_RETENTION_MS,
} from "../../../../imports/lib/models/UserStatuses";
import userStatusForHuntApp from "../../../../imports/lib/publications/userStatusForHuntApp";
import UserStatusHooks from "../../../../imports/server/hooks/UserStatusHooks";
import recordCallPresence from "../../../../imports/server/recordCallPresence";
import serverId from "../../../../imports/server/serverId";
import asUser from "../../../lib/asUser";
import createTestHunt from "../../../lib/createTestHunt";
import resetDatabase from "../../../lib/resetDatabase";
import StubSubscription, {
  publishHandler,
} from "../../../lib/StubSubscription";

describe("user statuses", function () {
  this.timeout(30000);

  let huntId: string;
  let otherHuntId: string;
  let memberId: string;
  let otherMemberId: string;
  let outsiderId: string;
  // A puzzle id that nothing checks against the puzzles collection
  const puzzleId = Random.id();

  this.beforeAll(async function () {
    await resetDatabase("user statuses");
    memberId = await Accounts.createUserAsync({
      email: "member@example.com",
      password: "password",
    });
    otherMemberId = await Accounts.createUserAsync({
      email: "other@example.com",
      password: "password",
    });
    outsiderId = await Accounts.createUserAsync({
      email: "outsider@example.com",
      password: "password",
    });
    huntId = await createTestHunt(memberId, { name: "Presence hunt" });
    otherHuntId = await createTestHunt(memberId, { name: "Other hunt" });
    for (const userId of [memberId, otherMemberId]) {
      await MeteorUsers.updateAsync(userId, {
        $set: { displayName: userId, hunts: [huntId] },
      });
    }
    await MeteorUsers.updateAsync(outsiderId, {
      $set: { displayName: "Outsider", hunts: [otherHuntId] },
    });
  });

  this.beforeEach(async function () {
    await UserStatuses.removeAsync({});
    await CallActivities.removeAsync({});
  });

  describe("userStatusForHuntApp", function () {
    const handler = () => publishHandler(userStatusForHuntApp.name);

    it("tracks a connection's presence and marks it offline when it stops", async function () {
      const sub = new StubSubscription(memberId);
      assert.deepEqual(
        await handler().call(sub, { hunt: huntId, status: "online" }),
        [],
      );
      const row = await UserStatuses.findOneAsync({ user: memberId });
      assert.isDefined(row);
      assert.equal(row.status, "online");
      assert.equal(row.connection, sub.connection.id);
      assert.equal(row.server, serverId);

      await sub.stopAsync();
      assert.equal(
        (await UserStatuses.findOneAsync(row._id))?.status,
        "offline",
      );
    });

    it("lets a re-subscription from the same connection take over the row", async function () {
      const first = new StubSubscription(memberId);
      await handler().call(first, { hunt: huntId, status: "online" });
      // Same connection, new subscription (the tab was hidden)
      const second = new StubSubscription(memberId, first.connection);
      await handler().call(second, { hunt: huntId, status: "away" });
      assert.equal(await UserStatuses.find({ user: memberId }).countAsync(), 1);

      // The old subscription stops after the new one started, as Meteor
      // delivers them; the row stays with the new subscription
      await first.stopAsync();
      assert.equal(
        (await UserStatuses.findOneAsync({ user: memberId }))?.status,
        "away",
      );

      await second.stopAsync();
      assert.equal(
        (await UserStatuses.findOneAsync({ user: memberId }))?.status,
        "offline",
      );
    });

    it("records nothing for non-members or anonymous subscribers", async function () {
      for (const userId of [outsiderId, null]) {
        const sub = new StubSubscription(userId);
        assert.deepEqual(
          await handler().call(sub, { hunt: huntId, status: "online" }),
          [],
        );
        await sub.stopAsync();
      }
      assert.equal(await UserStatuses.find({}).countAsync(), 0);
    });

    it("rejects statuses it doesn't know", async function () {
      const args: { hunt: string; status: PresenceStatus } = {
        hunt: huntId,
        // @ts-expect-error -- invalid on purpose
        status: "sleeping",
      };
      await assert.isRejected(
        handler().call(new StubSubscription(memberId), args),
      );
      assert.equal(await UserStatuses.find({}).countAsync(), 0);
    });
  });

  describe("userStatusesForHunt", function () {
    const handler = () => publishHandler("UserStatuses.publications.forHunt");

    it("publishes the hunt's recent rows to members only", async function () {
      await UserStatuses.insertAsync({
        user: memberId,
        type: "status",
        status: "online",
        hunt: huntId,
      });
      await UserStatuses.insertAsync({
        user: outsiderId,
        type: "status",
        status: "online",
        hunt: otherHuntId,
      });
      const staleId = await UserStatuses.insertAsync({
        user: otherMemberId,
        type: "puzzleStatus",
        status: "chat",
        hunt: huntId,
        puzzle: puzzleId,
      });
      await UserStatuses.collection.rawCollection().updateOne(
        { _id: staleId },
        {
          $set: {
            updatedAt: new Date(Date.now() - USER_STATUS_RETENTION_MS - 1000),
          },
        },
      );

      const cursor = await handler().call(new StubSubscription(memberId), {
        huntId,
      });
      const rows = await cursor.fetchAsync();
      assert.sameMembers(
        rows.map((row: { user: string }) => row.user),
        [memberId],
        "Only this hunt's rows from the last week are published",
      );

      assert.deepEqual(
        await handler().call(new StubSubscription(outsiderId), { huntId }),
        [],
      );
      assert.deepEqual(
        await handler().call(new StubSubscription(), { huntId }),
        [],
      );
    });
  });

  describe("puzzle status writers", function () {
    it("records chat messages from people, but not system messages", async function () {
      const messageId = await asUser(memberId, () =>
        ChatMessages.insertAsync({
          hunt: huntId,
          puzzle: puzzleId,
          content: { type: "message", children: [{ text: "hello" }] },
          sender: memberId,
          timestamp: new Date(),
        }),
      );
      await UserStatusHooks.onChatMessageCreated!(messageId);
      const row = await UserStatuses.findOneAsync({ user: memberId });
      assert.isDefined(row);
      assert.equal(row.type, "puzzleStatus");
      assert.equal(row.status, "chat");
      assert.equal(row.puzzle, puzzleId);
      assert.equal(row.hunt, huntId);
      assert.isUndefined(row.server);

      const systemId = await asUser(memberId, () =>
        ChatMessages.insertAsync({
          hunt: huntId,
          puzzle: puzzleId,
          content: { type: "message", children: [{ text: "beep" }] },
          sender: undefined,
          timestamp: new Date(),
        }),
      );
      await UserStatusHooks.onChatMessageCreated!(systemId);
      assert.equal(await UserStatuses.find({}).countAsync(), 1);
    });

    it("keeps one puzzle status per user and hunt", async function () {
      const otherPuzzleId = Random.id();
      await recordCallPresence({
        hunt: huntId,
        call: puzzleId,
        user: memberId,
      });
      await recordCallPresence({
        hunt: huntId,
        call: otherPuzzleId,
        user: memberId,
      });
      const rows = await UserStatuses.find({ user: memberId }).fetchAsync();
      assert.lengthOf(rows, 1);
      assert.equal(rows[0]!.status, "call");
      assert.equal(rows[0]!.puzzle, otherPuzzleId);
    });

    it("stamps a caller's presence once per activity bucket", async function () {
      const ts = new Date(Date.UTC(2026, 0, 1, 12, 0));
      const presence = { hunt: huntId, call: puzzleId, user: memberId, ts };
      await recordCallPresence(presence);
      const first = await UserStatuses.findOneAsync({ user: memberId });
      assert.isDefined(first);

      // The sweep records the same bucket again (from this or another
      // server): the activity row already exists, so the presence row is
      // left alone while it's fresh. Backdating it a little shows whether it
      // was rewritten.
      const fresh = new Date(Date.now() - ACTIVITY_GRANULARITY / 2);
      await UserStatuses.collection
        .rawCollection()
        .updateOne({ _id: first._id }, { $set: { updatedAt: fresh } });
      await recordCallPresence(presence);
      assert.equal(await CallActivities.find({}).countAsync(), 1);
      assert.deepEqual(
        (await UserStatuses.findOneAsync({ user: memberId }))?.updatedAt,
        fresh,
      );

      // ...unless it has gone a bucket stale, as it does when the speaking
      // observer created the bucket's activity row first
      const stale = new Date(Date.now() - ACTIVITY_GRANULARITY - 1000);
      await UserStatuses.collection
        .rawCollection()
        .updateOne({ _id: first._id }, { $set: { updatedAt: stale } });
      await recordCallPresence(presence);
      const refreshed = await UserStatuses.findOneAsync({ user: memberId });
      assert.isAbove(refreshed!.updatedAt.getTime(), stale.getTime());

      // A sweep never creates a presence row of its own
      await UserStatuses.removeAsync({});
      await recordCallPresence(presence);
      assert.equal(await UserStatuses.find({}).countAsync(), 0);
    });
  });
});
