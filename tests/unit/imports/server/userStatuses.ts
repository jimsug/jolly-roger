import { setTimeout } from "node:timers/promises";
import { Accounts } from "meteor/accounts-base";
import { DDP } from "meteor/ddp";
import { Random } from "meteor/random";
import { assert } from "chai";
import { ACTIVITY_GRANULARITY } from "../../../../imports/lib/config/activityTracking";
import ChatMessages from "../../../../imports/lib/models/ChatMessages";
import Hunts from "../../../../imports/lib/models/Hunts";
import MeteorUsers from "../../../../imports/lib/models/MeteorUsers";
import Puzzles from "../../../../imports/lib/models/Puzzles";
import UserStatuses, {
  USER_STATUS_RETENTION_MS,
} from "../../../../imports/lib/models/UserStatuses";
import setUserStatus from "../../../../imports/methods/setUserStatus";
import UserStatusHooks from "../../../../imports/server/hooks/UserStatusHooks";
import CallActivities from "../../../../imports/server/models/CallActivities";
import recordCallPresence from "../../../../imports/server/recordCallPresence";
import serverId from "../../../../imports/server/serverId";
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
  // A puzzle that exists in the hunt, for the method's puzzle check
  let realPuzzleId: string;

  const asUser = <T>(userId: string, fn: () => Promise<T>) =>
    DDP._CurrentMethodInvocation.withValue({ userId }, fn);

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
    const newHunt = (name: string) =>
      asUser(memberId, () =>
        Hunts.insertAsync({
          name,
          mailingLists: [],
          openSignups: false,
          hasGuessQueue: true,
          defaultRoles: [],
          allowUnlockablePuzzles: false,
          isArchived: false,
          customLinkEmbed: false,
        }),
      );
    huntId = await newHunt("Presence hunt");
    otherHuntId = await newHunt("Other hunt");
    for (const userId of [memberId, otherMemberId]) {
      await MeteorUsers.updateAsync(userId, {
        $set: { displayName: userId, hunts: [huntId] },
      });
    }
    await MeteorUsers.updateAsync(outsiderId, {
      $set: { displayName: "Outsider", hunts: [otherHuntId] },
    });
    realPuzzleId = await asUser(memberId, () =>
      Puzzles.insertAsync({
        hunt: huntId,
        title: "Present",
        tags: [],
        answers: [],
        expectedAnswerCount: 1,
      }),
    );
  });

  this.beforeEach(async function () {
    await UserStatuses.removeAsync({});
    await CallActivities.removeAsync({});
  });

  describe("setUserStatus", function () {
    it("records the caller's own presence in the hunt", async function () {
      await asUser(memberId, () =>
        setUserStatus.callPromise({
          hunt: huntId,
          type: "status",
          status: "online",
        }),
      );
      const rows = await UserStatuses.find({}).fetchAsync();
      assert.lengthOf(rows, 1);
      const row = rows[0]!;
      assert.equal(row.user, memberId);
      assert.equal(row.hunt, huntId);
      assert.equal(row.type, "status");
      assert.equal(row.status, "online");
      assert.equal(row.server, serverId);

      // A later call updates the same row rather than adding one
      await asUser(memberId, () =>
        setUserStatus.callPromise({
          hunt: huntId,
          type: "status",
          status: "away",
        }),
      );
      const updated = await UserStatuses.find({}).fetchAsync();
      assert.lengthOf(updated, 1);
      assert.equal(updated[0]!._id, row._id);
      assert.equal(updated[0]!.status, "away");
    });

    it("rejects callers who aren't logged in", async function () {
      await assert.isRejected(
        setUserStatus.callPromise({
          hunt: huntId,
          type: "status",
          status: "online",
        }),
      );
      assert.equal(await UserStatuses.find({}).countAsync(), 0);
    });

    it("rejects callers who aren't members of the hunt", async function () {
      await assert.isRejected(
        asUser(outsiderId, () =>
          setUserStatus.callPromise({
            hunt: huntId,
            type: "status",
            status: "online",
          }),
        ),
        /Not a member/,
      );
      assert.equal(await UserStatuses.find({}).countAsync(), 0);
    });

    it("rejects statuses and types it doesn't know", async function () {
      await assert.isRejected(
        asUser(memberId, () =>
          setUserStatus.callPromise({
            hunt: huntId,
            type: "status",
            status: "sleeping" as any,
          }),
        ),
      );
      await assert.isRejected(
        asUser(memberId, () =>
          setUserStatus.callPromise({
            hunt: huntId,
            type: "mood" as any,
            status: "online",
          }),
        ),
      );
      // Known values, but not for that type
      await assert.isRejected(
        asUser(memberId, () =>
          setUserStatus.callPromise({
            hunt: huntId,
            type: "status",
            status: "chat",
          }),
        ),
        /not a status/,
      );
      await assert.isRejected(
        asUser(memberId, () =>
          setUserStatus.callPromise({
            hunt: huntId,
            type: "puzzleStatus",
            status: "chat",
          }),
        ),
        /needs a puzzle/,
      );
      assert.equal(await UserStatuses.find({}).countAsync(), 0);
    });

    it("only records puzzle statuses for puzzles in the hunt", async function () {
      await assert.isRejected(
        asUser(memberId, () =>
          setUserStatus.callPromise({
            hunt: huntId,
            type: "puzzleStatus",
            status: "chat",
            puzzle: Random.id(),
          }),
        ),
        /No such puzzle/,
      );
      assert.equal(await UserStatuses.find({}).countAsync(), 0);

      await asUser(memberId, () =>
        setUserStatus.callPromise({
          hunt: huntId,
          type: "puzzleStatus",
          status: "chat",
          puzzle: realPuzzleId,
        }),
      );
      const row = await UserStatuses.findOneAsync({ user: memberId });
      assert.equal(row?.type, "puzzleStatus");
      assert.equal(row?.puzzle, realPuzzleId);
    });

    it("can't touch another user's row", async function () {
      await asUser(otherMemberId, () =>
        setUserStatus.callPromise({
          hunt: huntId,
          type: "status",
          status: "online",
        }),
      );
      await asUser(memberId, () =>
        setUserStatus.callPromise({
          hunt: huntId,
          type: "status",
          status: "away",
        }),
      );
      const theirs = await UserStatuses.find({
        user: otherMemberId,
      }).fetchAsync();
      assert.lengthOf(theirs, 1);
      assert.equal(theirs[0]!.status, "online");
      const mine = await UserStatuses.find({ user: memberId }).fetchAsync();
      assert.lengthOf(mine, 1);
      assert.equal(mine[0]!.status, "away");
    });
  });

  describe("userStatus.inc", function () {
    const handler = () => publishHandler("userStatus.inc");

    it("tracks a connection's presence and marks it offline when it stops", async function () {
      const sub = new StubSubscription(memberId);
      await handler().call(sub, huntId, "online");
      const row = await UserStatuses.findOneAsync({ user: memberId });
      assert.isDefined(row);
      assert.equal(row.status, "online");
      assert.equal(row.connection, sub.connection.id);
      assert.equal(row.server, serverId);

      sub.stop();
      await assertEventually(async () => {
        const stopped = await UserStatuses.findOneAsync(row._id);
        assert.equal(stopped?.status, "offline");
      });
    });

    it("lets a re-subscription from the same connection take over the row", async function () {
      const first = new StubSubscription(memberId);
      await handler().call(first, huntId, "online");
      // Same connection, new subscription (the tab was hidden)
      const second = new StubSubscription(memberId);
      Object.assign(second, { connection: first.connection });
      await handler().call(second, huntId, "away");
      assert.equal(await UserStatuses.find({ user: memberId }).countAsync(), 1);

      // The old subscription stops after the new one started, as Meteor
      // delivers them; the row stays with the new subscription
      first.stop();
      await setTimeout(50);
      assert.equal(
        (await UserStatuses.findOneAsync({ user: memberId }))?.status,
        "away",
      );

      second.stop();
      await assertEventually(async () => {
        assert.equal(
          (await UserStatuses.findOneAsync({ user: memberId }))?.status,
          "offline",
        );
      });
    });

    it("rejects non-members", async function () {
      const sub = new StubSubscription(outsiderId);
      await assert.isRejected(
        handler().call(sub, huntId, "online"),
        /Not a member/,
      );
      assert.equal(await UserStatuses.find({}).countAsync(), 0);
    });
  });

  describe("statusesForHuntUsers", function () {
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
      // left alone
      await setTimeout(20);
      await recordCallPresence(presence);
      assert.equal(await CallActivities.find({}).countAsync(), 1);
      assert.deepEqual(
        (await UserStatuses.findOneAsync({ user: memberId }))?.updatedAt,
        first.updatedAt,
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

async function assertEventually(assertion: () => Promise<void>) {
  const deadline = Date.now() + 1500;
  while (Date.now() < deadline) {
    try {
      await assertion();
      return;
    } catch {
      await setTimeout(20);
    }
  }
  await assertion();
}
