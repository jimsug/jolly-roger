import { Accounts } from "meteor/accounts-base";
import { DDP } from "meteor/ddp";
import { Random } from "meteor/random";
import { assert } from "chai";
import Hunts from "../../../../imports/lib/models/Hunts";
import MeteorUsers from "../../../../imports/lib/models/MeteorUsers";
import Peers from "../../../../imports/lib/models/mediasoup/Peers";
import Subscribers from "../../../../imports/server/models/Subscribers";
import serverId from "../../../../imports/server/serverId";
import resetDatabase from "../../../lib/resetDatabase";
import StubSubscription, {
  publishHandler,
} from "../../../lib/StubSubscription";
import waitForAssertion from "../../../lib/waitForAssertion";
import withWriteFence from "../../../lib/withWriteFence";

describe("subscriber presence", function () {
  this.timeout(30000);

  let huntId: string;
  let memberId: string;
  let outsiderId: string;
  const puzzleId = Random.id();
  const topic = `puzzle:${puzzleId}`;

  const asUser = <T>(userId: string, fn: () => Promise<T>) =>
    DDP._CurrentMethodInvocation.withValue({ userId }, fn);

  const addSubscriber = (user: string, visible: boolean | string) =>
    Subscribers.insertAsync({
      server: serverId,
      connection: Random.id(),
      user,
      name: topic,
      context: { puzzle: puzzleId, hunt: huntId, visible },
    });

  this.beforeAll(async function () {
    await resetDatabase("subscriber presence");
    memberId = await Accounts.createUserAsync({
      email: "member@example.com",
      password: "password",
    });
    outsiderId = await Accounts.createUserAsync({
      email: "outsider@example.com",
      password: "password",
    });
    huntId = await asUser(memberId, () =>
      Hunts.insertAsync({
        name: "Presence hunt",
        mailingLists: [],
        openSignups: false,
        hasGuessQueue: true,
        defaultRoles: [],
        allowUnlockablePuzzles: false,
        isArchived: false,
        customLinkEmbed: false,
      }),
    );
    await MeteorUsers.updateAsync(memberId, {
      $set: { displayName: "Member", hunts: [huntId] },
    });
    await MeteorUsers.updateAsync(outsiderId, {
      $set: { displayName: "Outsider", hunts: [] },
    });
  });

  let subs: StubSubscription[] = [];
  this.afterEach(async function () {
    subs.forEach((sub) => sub.stop());
    subs = [];
    await Subscribers.removeAsync({});
    await Peers.removeAsync({});
  });

  const stub = (userId: string | null) => {
    const sub = new StubSubscription(userId);
    subs.push(sub);
    return sub;
  };

  describe("subscribers.fetch", function () {
    it("folds a user's connections into one record", async function () {
      const hiddenId = await addSubscriber(memberId, false);
      await addSubscriber(memberId, true);
      await addSubscriber(outsiderId, "visible");

      const sub = stub(memberId);
      await publishHandler("subscribers.fetch").call(sub, topic);

      const published = sub.published("subscribers");
      assert.sameMembers(
        [...published.keys()],
        [`${topic}:${memberId}`, `${topic}:${outsiderId}`],
      );
      const member = published.get(`${topic}:${memberId}`)!;
      assert.equal(member.name, topic);
      assert.equal(member.user, memberId);
      assert.isTrue(member.visible, "Visible if any connection is visible");
      assert.instanceOf(member.updatedAt, Date);
      assert.isTrue(
        published.get(`${topic}:${outsiderId}`)!.visible,
        'The old string form "visible" still counts',
      );

      // Closing the visible tab leaves the hidden one
      const visibleRow = (
        await Subscribers.find({
          user: memberId,
          "context.visible": true,
        }).fetchAsync()
      )[0]!;
      await withWriteFence(async () => {
        await Subscribers.removeAsync(visibleRow._id);
      });
      await waitForAssertion(() => {
        assert.isFalse(published.get(`${topic}:${memberId}`)!.visible);
      });
      assert.deepEqual(
        published.get(`${topic}:${memberId}`)!.updatedAt,
        (await Subscribers.findOneAsync(hiddenId))!.updatedAt,
      );

      // And closing the last one removes the record
      await withWriteFence(async () => {
        await Subscribers.removeAsync(hiddenId);
      });
      await waitForAssertion(() => {
        assert.isFalse(published.has(`${topic}:${memberId}`));
      });
    });
  });

  describe("subscribers.fetchAll", function () {
    it("publishes every subscriber in the hunt to members", async function () {
      await addSubscriber(memberId, true);
      await Subscribers.insertAsync({
        server: serverId,
        connection: Random.id(),
        user: outsiderId,
        name: "operators",
        context: { [huntId]: true },
      });
      await Subscribers.insertAsync({
        server: serverId,
        connection: Random.id(),
        user: outsiderId,
        name: "puzzle:elsewhere",
        context: { hunt: Random.id(), visible: true },
      });

      const sub = stub(memberId);
      await publishHandler("subscribers.fetchAll").call(sub, huntId);
      assert.sameMembers(
        [...sub.published("subscribers").keys()],
        [`${topic}:${memberId}`],
        "Only rows with this hunt in their context are published",
      );
    });

    it("rejects non-members and anonymous subscribers", async function () {
      await assert.isRejected(
        publishHandler("subscribers.fetchAll").call(stub(outsiderId), huntId),
        /Not a member/,
      );
      await assert.isRejected(
        publishHandler("subscribers.fetchAll").call(stub(null), huntId),
        /Not logged in/,
      );
    });
  });

  describe("mediasoup:metadataAll", function () {
    it("publishes the hunt's peers to members only", async function () {
      await asUser(memberId, () =>
        Peers.insertAsync({
          createdServer: serverId,
          hunt: huntId,
          call: puzzleId,
          tab: Random.id(),
          initialPeerState: "active",
          muted: false,
          deafened: false,
        }),
      );
      await asUser(memberId, () =>
        Peers.insertAsync({
          createdServer: serverId,
          hunt: Random.id(),
          call: Random.id(),
          tab: Random.id(),
          initialPeerState: "active",
          muted: false,
          deafened: false,
        }),
      );

      const cursor = await publishHandler("mediasoup:metadataAll").call(
        stub(memberId),
        huntId,
      );
      const peers = await cursor.fetchAsync();
      assert.lengthOf(peers, 1);
      assert.equal(peers[0].call, puzzleId);
      assert.equal(peers[0].createdBy, memberId);
      assert.sameMembers(
        Object.keys(peers[0]),
        ["_id", "hunt", "call", "createdBy", "deleted"],
        "Only what the solver column needs; a peer's tab id stays private",
      );

      await assert.isRejected(
        publishHandler("mediasoup:metadataAll").call(stub(outsiderId), huntId),
        /Not a member/,
      );
      await assert.isRejected(
        publishHandler("mediasoup:metadataAll").call(stub(null), huntId),
        /Not logged in/,
      );
    });
  });
});
