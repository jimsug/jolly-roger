import { Accounts } from "meteor/accounts-base";
import { EJSON } from "meteor/ejson";
import type { Mongo } from "meteor/mongo";
import { Random } from "meteor/random";
import { assert } from "chai";
import sinon from "sinon";
import FixtureHunt from "../../../../imports/FixtureHunt";
import ChatMessages, {
  contentFromMessage,
} from "../../../../imports/lib/models/ChatMessages";
import FeatureFlags from "../../../../imports/lib/models/FeatureFlags";
import Hunts from "../../../../imports/lib/models/Hunts";
import MergeOperations from "../../../../imports/lib/models/MergeOperations";
import MeteorUsers from "../../../../imports/lib/models/MeteorUsers";
import WhiteboardEdges from "../../../../imports/lib/models/WhiteboardEdges";
import WhiteboardNodes from "../../../../imports/lib/models/WhiteboardNodes";
import Whiteboards from "../../../../imports/lib/models/Whiteboards";
import type { WhiteboardVersionType } from "../../../../imports/lib/models/WhiteboardVersions";
import WhiteboardVersions from "../../../../imports/lib/models/WhiteboardVersions";
import whiteboardVersions from "../../../../imports/lib/publications/whiteboardVersions";
import {
  MAX_NODES_PER_BOARD,
  MAX_VERSION_BYTES_PER_BOARD,
  VERSION_INTERVAL_MS,
} from "../../../../imports/lib/whiteboard/limits";
import fetchWhiteboardVersion from "../../../../imports/methods/fetchWhiteboardVersion";
import restoreWhiteboardVersion from "../../../../imports/methods/restoreWhiteboardVersion";
import sendChatMessage from "../../../../imports/methods/sendChatMessage";
import setWhiteboardEditPolicy from "../../../../imports/methods/setWhiteboardEditPolicy";
import makeFixtureHunt from "../../../../imports/server/makeFixtureHunt";
import Locks from "../../../../imports/server/models/Locks";
import WhiteboardVersionChunks from "../../../../imports/server/models/WhiteboardVersionChunks";
import { ensureWhiteboard } from "../../../../imports/server/whiteboard";
import {
  deleteNodes,
  upsertEdges,
  upsertNodes,
} from "../../../../imports/server/whiteboardEdits";
import { resetLayout } from "../../../../imports/server/whiteboardReset";
import {
  compressVersion,
  decodeVersion,
  pruneWhiteboardVersions,
  restoreVersion,
  serializeBoard,
} from "../../../../imports/server/whiteboardVersions";
import asUser from "../../../lib/asUser";
import resetDatabase from "../../../lib/resetDatabase";
import StubSubscription, {
  publishHandler,
} from "../../../lib/StubSubscription";

const huntId = FixtureHunt._id;
const MINUTE = 60 * 1000;

async function makeUser(email: string, roles?: string[]) {
  const userId = await Accounts.createUserAsync({
    email,
    password: "password",
  });
  if (roles) {
    await MeteorUsers.updateAsync(userId, {
      $set: { hunts: [huntId], roles: { [huntId]: roles } },
    });
  }
  return userId;
}

describe("whiteboard versions", function () {
  this.timeout(30000);

  let operator: string;
  let member: string;
  let other: string;
  let outsider: string;
  let boardId: string;

  beforeEach(async function () {
    await resetDatabase("whiteboard versions");
    operator = await makeUser("operator@example.com", ["operator"]);
    member = await makeUser("member@example.com", []);
    other = await makeUser("other@example.com", []);
    outsider = await makeUser("outsider@example.com");
    await makeFixtureHunt(operator);
    boardId = await ensureWhiteboard(operator, huntId);
  });

  const versions = () =>
    WhiteboardVersions.find(
      { board: boardId },
      { sort: { createdAt: -1 } },
    ).fetchAsync();
  const newest = async () => (await versions())[0]!;

  // Moves every version, and everyone's window on it, back in time, so the
  // next edit starts a new one.
  const age = async (ms: number) => {
    for (const version of await versions()) {
      await WhiteboardVersions.collection.rawCollection().updateOne(
        { _id: version._id },
        {
          $set: {
            createdAt: new Date(version.createdAt.getTime() - ms),
            users: version.users.map((u) => ({
              user: u.user,
              at: new Date(u.at.getTime() - ms),
            })),
          },
        },
      );
    }
  };
  const nextWindow = () => age(VERSION_INTERVAL_MS + MINUTE);

  const sticky = async (
    userId: string,
    position?: { x: number; y: number },
  ) => {
    const _id = Random.id();
    await upsertNodes(userId, boardId, [
      { _id, type: "sticky", position: position ?? { x: 5000, y: 5000 } },
    ]);
    return _id;
  };

  const payloadOf = async (version: WhiteboardVersionType) =>
    decodeVersion(
      (
        await WhiteboardVersionChunks.find(
          { version: version._id },
          { sort: { index: 1 } },
        ).fetchAsync()
      ).map((c) => c.data),
    );
  const board = async () => ({
    nodes: await WhiteboardNodes.find({ board: boardId }).fetchAsync(),
    edges: await WhiteboardEdges.find({ board: boardId }).fetchAsync(),
  });

  // Stores a version made from a payload, as recording one would.
  const storeVersion = async (
    nodes: unknown[],
    edges: unknown[],
    chunkBytes?: number,
  ) => {
    const json = EJSON.stringify({ format: 1, nodes, edges });
    const chunks = await compressVersion(json, chunkBytes);
    const versionId = Random.id();
    const createdAt = new Date(Date.now() - 30 * MINUTE);
    for (const [index, data] of chunks.entries()) {
      await WhiteboardVersionChunks.insertAsync({
        hunt: huntId,
        board: boardId,
        version: versionId,
        index,
        data,
        createdAt,
      });
    }
    await WhiteboardVersions.insertAsync({
      _id: versionId,
      hunt: huntId,
      board: boardId,
      kind: "edits",
      users: [{ user: member, at: createdAt }],
      changeCount: 1,
      lastEditAt: createdAt,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      size: chunks.reduce((sum, c) => sum + c.length, 0),
      chunkCount: chunks.length,
      format: 1,
      hash: "0".repeat(64),
      createdAt,
      createdBy: member,
    });
    return { versionId, chunks };
  };

  describe("recording", function () {
    it("records a version on a user's first edit", async function () {
      const before = await board();
      const id = await sticky(member);
      const [version, ...rest] = await versions();
      assert.isEmpty(rest);
      assert.equal(version!.kind, "edits");
      assert.deepEqual(
        version!.users.map((u) => u.user),
        [member],
      );
      assert.equal(version!.changeCount, 1);
      assert.equal(version!.nodeCount, before.nodes.length);
      assert.equal(version!.edgeCount, before.edges.length);
      // It's the board from before the edit
      const payload = await payloadOf(version!);
      assert.notInclude(
        payload.nodes.map((n) => n._id),
        id,
      );
      assert.sameMembers(
        payload.nodes.map((n) => n._id),
        before.nodes.map((n) => n._id),
      );
      assert.equal(
        await WhiteboardVersionChunks.find({
          version: version!._id,
        }).countAsync(),
        version!.chunkCount,
      );
    });

    it("doesn't record twice for one user within the interval", async function () {
      const id = await sticky(member);
      await upsertNodes(member, boardId, [{ _id: id, text: "edited" }]);
      await deleteNodes(member, boardId, [await sticky(member)]);
      const [version, ...rest] = await versions();
      assert.isEmpty(rest);
      assert.equal(version!.changeCount, 4);

      // Once the interval has passed, the next edit records again
      await nextWindow();
      await sticky(member);
      assert.lengthOf(await versions(), 2);
    });

    it("joins a version less than a minute old", async function () {
      await sticky(member);
      await sticky(other);
      const [version, ...rest] = await versions();
      assert.isEmpty(rest);
      assert.deepEqual(
        version!.users.map((u) => u.user),
        [member, other],
      );
      assert.equal(version!.changeCount, 2);

      // A minute on, someone else's edit to a changed board starts a new one
      await age(2 * MINUTE);
      await sticky(operator);
      const latest = await newest();
      assert.lengthOf(await versions(), 2);
      assert.deepEqual(
        latest.users.map((u) => u.user),
        [operator],
      );
      // and the first two can still extend theirs
      await sticky(other);
      assert.lengthOf(await versions(), 2);
    });

    it("prunes under the lock instead of refusing when the board is over the byte cap", async function () {
      await sticky(member);
      const big = MAX_VERSION_BYTES_PER_BOARD / 2;
      const fakes: string[] = [];
      for (const hours of [3, 4, 5]) {
        const createdAt = new Date(Date.now() - hours * 60 * MINUTE);
        fakes.push(
          await WhiteboardVersions.insertAsync({
            hunt: huntId,
            board: boardId,
            kind: "edits",
            users: [{ user: other, at: createdAt }],
            changeCount: 1,
            lastEditAt: createdAt,
            nodeCount: 0,
            edgeCount: 0,
            size: big,
            chunkCount: 1,
            format: 1,
            hash: "0".repeat(64),
            createdAt,
            createdBy: other,
          }),
        );
      }
      await nextWindow();
      const id = await sticky(member);
      assert.ok(await WhiteboardNodes.findOneAsync(id));
      const left = (await versions()).map((v) => v._id);
      assert.lengthOf(left, 3);
      assert.include(left, fakes[0]);
      assert.notInclude(left, fakes[1]);
      assert.notInclude(left, fakes[2]);
      assert.ok(
        (await Whiteboards.findOneAsync(boardId))?.versionsPrunedBefore,
      );
    });
  });

  describe("payloads", function () {
    it("round-trips a payload larger than one chunk", async function () {
      const { nodes, edges } = await board();
      const { json } = serializeBoard(nodes, edges);
      const chunks = await compressVersion(json, 256);
      assert.isAbove(chunks.length, 1);
      chunks.forEach((chunk) => assert.isAtMost(chunk.length, 256));
      const decoded = await decodeVersion(chunks);
      assert.sameDeepMembers(decoded.nodes, nodes);
      assert.sameDeepMembers(decoded.edges, edges);
    });

    it("fetches a multi-chunk version one chunk per call and refuses an index out of range", async function () {
      const { nodes, edges } = await board();
      const { versionId, chunks } = await storeVersion(nodes, edges, 512);
      assert.isAbove(chunks.length, 1);
      const fetch = (userId: string, index: number) =>
        asUser(userId, () =>
          fetchWhiteboardVersion.callPromise({ boardId, versionId, index }),
        );
      const fetched: Uint8Array[] = [];
      for (let index = 0; index < chunks.length; index++) {
        fetched.push(await fetch(member, index));
      }
      fetched.forEach((chunk, i) =>
        assert.deepEqual([...chunk], [...chunks[i]!]),
      );
      assert.sameDeepMembers((await decodeVersion(fetched)).nodes, nodes);

      await assert.isRejected(fetch(member, chunks.length), /Unknown version/);
      await assert.isRejected(fetch(member, -1), /Unknown version/);
      await assert.isRejected(fetch(outsider, 0), /member/);
      // An archived hunt's history can still be read
      await Hunts.updateAsync(huntId, { $set: { isArchived: true } });
      assert.lengthOf(await fetch(member, 0), chunks[0]!.length);
      await FeatureFlags.insertAsync({
        name: "disable.whiteboard_versions",
        type: "on",
        createdBy: operator,
      });
      await assert.isRejected(fetch(member, 0), /history is turned off/);
    });
  });

  describe("restoring", function () {
    it("restores moved, deleted and hidden nodes", async function () {
      const moved = await sticky(member, { x: 0, y: 0 });
      const deleted = await sticky(member, { x: 300, y: 0 });
      const card = (await WhiteboardNodes.findOneAsync({
        board: boardId,
        type: "puzzle",
      }))!;
      await nextWindow();
      await upsertNodes(member, boardId, [
        { _id: moved, position: { x: 500, y: 500 } },
      ]);
      const version = await newest();
      await deleteNodes(member, boardId, [deleted, card._id]);
      assert.isTrue((await WhiteboardNodes.findOneAsync(card._id))?.hidden);

      await asUser(member, () =>
        restoreWhiteboardVersion.callPromise({
          boardId,
          versionId: version._id,
        }),
      );

      assert.deepEqual((await WhiteboardNodes.findOneAsync(moved))?.position, {
        x: 0,
        y: 0,
      });
      assert.ok(await WhiteboardNodes.findOneAsync(deleted));
      assert.notOk((await WhiteboardNodes.findOneAsync(card._id))?.hidden);
      assert.ok((await Whiteboards.findOneAsync(boardId))?.lastRewrittenAt);
    });

    it("restores a card whose id changed since", async function () {
      const card = (await WhiteboardNodes.findOneAsync({
        board: boardId,
        type: "puzzle",
      }))!;
      const note = await sticky(member);
      await upsertEdges(member, boardId, [
        { _id: Random.id(), source: note, target: card._id },
      ]);
      await nextWindow();
      await sticky(member);
      const version = await newest();

      // The card is replaced by another for the same puzzle, somewhere else
      await WhiteboardEdges.removeAsync({ target: card._id });
      await WhiteboardNodes.removeAsync(card._id);
      const replacement = await WhiteboardNodes.insertAsync({
        hunt: huntId,
        board: boardId,
        type: "puzzle",
        puzzle: card.puzzle,
        position: { x: 9000, y: 9000 },
        createdBy: operator,
      });

      await restoreVersion(member, boardId, version._id);

      const cards = await WhiteboardNodes.find({
        board: boardId,
        puzzle: card.puzzle,
      }).fetchAsync();
      assert.lengthOf(cards, 1);
      assert.equal(cards[0]!._id, replacement);
      assert.deepEqual(cards[0]!.position, card.position);
      assert.equal(cards[0]!.parent, card.parent);
      const lines = await WhiteboardEdges.find({
        board: boardId,
        source: note,
      }).fetchAsync();
      assert.deepEqual(
        lines.map((l) => l.target),
        [replacement],
      );
    });

    it("detaches comments from nodes it removes and re-attaches them to nodes it brings back", async function () {
      const kept = await sticky(member, { x: 100, y: 200 });
      await nextWindow();
      const added = await sticky(member, { x: 1000, y: 1000 });
      const version = await newest();
      const puzzleId = (await Whiteboards.findOneAsync(boardId))!.puzzle;
      const comment = async (node: string, text: string) => {
        await asUser(member, () =>
          sendChatMessage.callPromise({
            puzzleId,
            content: JSON.stringify(contentFromMessage(text)),
            comment: { node, x: 10, y: 20 },
          }),
        );
        return (await ChatMessages.findOneAsync({
          "content.children.text": text,
        }))!._id;
      };
      const onKept = await comment(kept, "on the kept sticky");
      const onAdded = await comment(added, "on the added sticky");
      await deleteNodes(member, boardId, [kept]);
      assert.deepEqual((await ChatMessages.findOneAsync(onKept))?.comment, {
        x: 110,
        y: 220,
        detachedFrom: kept,
      });

      await restoreVersion(member, boardId, version._id);

      assert.ok(await WhiteboardNodes.findOneAsync(kept));
      assert.notOk(await WhiteboardNodes.findOneAsync(added));
      assert.deepEqual((await ChatMessages.findOneAsync(onKept))?.comment, {
        node: kept,
        x: 10,
        y: 20,
      });
      assert.deepEqual((await ChatMessages.findOneAsync(onAdded))?.comment, {
        x: 1010,
        y: 1020,
        detachedFrom: added,
      });
    });

    it("gives what it puts back a fresh updatedAt", async function () {
      const id = await sticky(member, { x: 0, y: 0 });
      await nextWindow();
      await sticky(member, { x: 400, y: 0 });
      const version = await newest();
      const stored = (await WhiteboardNodes.findOneAsync(id))!.updatedAt;
      await deleteNodes(member, boardId, [id]);
      const before = new Date();

      await restoreVersion(member, boardId, version._id);

      const restored = (await WhiteboardNodes.findOneAsync(id))!;
      assert.isAtLeast(restored.updatedAt.getTime(), before.getTime());
      assert.isAbove(restored.updatedAt.getTime(), stored.getTime());
    });

    // Runs a restore and then a reset, each of which loses the board's lock
    // to another server the moment `steal` is first called while it holds
    // it, and checks both refuse readably and leave the board and its
    // history as they were.
    const refusedWhenPreempted = async (
      stub: (steal: () => Promise<void>) => sinon.SinonStub,
    ) => {
      await sticky(member, { x: 0, y: 0 });
      await nextWindow();
      const moved = await sticky(member, { x: 400, y: 0 });
      const version = await newest();
      await upsertNodes(member, boardId, [
        { _id: moved, position: { x: 800, y: 800 } },
      ]);
      const before = await board();
      const recorded = (await versions()).map((v) => v._id);

      const lockName = `whiteboard:${boardId}`;
      let held: string | undefined;
      const steal = async () => {
        const theirs = await Locks.findOneAsync({ name: lockName });
        if (theirs && !held) {
          await Locks.removeAsync(theirs._id);
          held = await Locks.insertAsync({ name: lockName });
        }
      };
      const letGo = async () => {
        if (held) await Locks.removeAsync(held);
        held = undefined;
      };
      const stubbed = stub(steal);
      try {
        await assert.isRejected(
          restoreVersion(member, boardId, version._id),
          /The board was busy; try again/,
        );
        assert.ok(held);
        await letGo();
        await assert.isRejected(
          resetLayout(member, boardId, false),
          /The board was busy; try again/,
        );
        assert.ok(held);
      } finally {
        stubbed.restore();
        await letGo();
      }

      assert.sameDeepMembers((await board()).nodes, before.nodes);
      assert.sameDeepMembers((await board()).edges, before.edges);
      assert.sameMembers(
        (await versions()).map((v) => v._id),
        recorded,
      );
      assert.equal(
        await WhiteboardVersionChunks.find({ board: boardId }).countAsync(),
        recorded.length,
      );
    };

    it("refuses readably, with nothing written, when another server takes the board's lock", async function () {
      const findHunt = Hunts.findOneAsync.bind(Hunts);
      await refusedWhenPreempted((steal) =>
        sinon
          .stub(Hunts, "findOneAsync")
          .callsFake(async (...args: Parameters<typeof findHunt>) => {
            await steal();
            return findHunt(...args);
          }),
      );
    });

    it("takes away the version it recorded when the lock goes before the board is touched", async function () {
      const insert = WhiteboardVersions.insertAsync.bind(WhiteboardVersions);
      await refusedWhenPreempted((steal) =>
        sinon
          .stub(WhiteboardVersions, "insertAsync")
          .callsFake(async (...args: Parameters<typeof insert>) => {
            const id = await insert(...args);
            await steal();
            return id;
          }),
      );
    });

    it("records a restore version after planning and before writing", async function () {
      await sticky(member, { x: 0, y: 0 });
      await nextWindow();
      await sticky(member, { x: 400, y: 0 });
      const version = await newest();
      await sticky(member, { x: 800, y: 0 });
      const before = await board();

      await restoreVersion(other, boardId, version._id);

      const restore = await newest();
      assert.equal(restore.kind, "restore");
      assert.deepEqual(
        restore.users.map((u) => u.user),
        [other],
      );
      assert.deepEqual(restore.restoredFromAt, version.createdAt);
      const payload = await payloadOf(restore);
      assert.sameMembers(
        payload.nodes.map((n) => n._id),
        before.nodes.map((n) => n._id),
      );
      // The first edit after a restore records the restored board
      await sticky(other);
      const after = await newest();
      assert.equal(after.kind, "edits");
      assert.notEqual(after._id, restore._id);
    });

    it("records nothing when a restore is refused", async function () {
      const { nodes } = await board();
      const unreadable = await storeVersion(
        [{ ...nodes[0], type: "bogus" }],
        [],
      );
      const before = await versions();
      await assert.isRejected(
        restoreVersion(member, boardId, unreadable.versionId),
        /older layout/,
      );
      // Nor does a version whose chunks don't unpack
      await WhiteboardVersionChunks.updateAsync(
        { version: unreadable.versionId },
        { $set: { data: new Uint8Array([1, 2, 3]) } },
      );
      await assert.isRejected(
        restoreVersion(member, boardId, unreadable.versionId),
        /older layout/,
      );
      assert.lengthOf(await versions(), before.length);
      assert.sameMembers(
        (await board()).nodes.map((n) => n._id),
        nodes.map((n) => n._id),
      );
      await assert.isRejected(
        restoreVersion(member, boardId, Random.id()),
        /Unknown version/,
      );
    });

    it("records nothing when a version has more on it than a board can hold", async function () {
      const template = (await WhiteboardNodes.findOneAsync(
        await sticky(member),
      ))!;
      const crowded = await storeVersion(
        Array.from({ length: MAX_NODES_PER_BOARD + 1 }, () => ({
          ...template,
          _id: Random.id(),
        })),
        [],
      );
      const before = await versions();
      const { nodes } = await board();
      await assert.isRejected(
        restoreVersion(member, boardId, crowded.versionId),
        /more on it than a board can hold/,
      );
      assert.sameMembers(
        (await versions()).map((v) => v._id),
        before.map((v) => v._id),
      );
      assert.sameDeepMembers((await board()).nodes, nodes);
    });

    it("refuses a version from another board", async function () {
      const otherHunt = await Hunts.insertAsync({
        name: "Another hunt",
        openSignups: true,
        hasGuessQueue: true,
        createdBy: operator,
      });
      await MeteorUsers.updateAsync(operator, {
        $addToSet: { hunts: otherHunt },
        $set: { [`roles.${otherHunt}`]: ["operator"] },
      });
      const otherBoard = await ensureWhiteboard(operator, otherHunt);
      await upsertNodes(operator, otherBoard, [
        { _id: Random.id(), type: "sticky", position: { x: 0, y: 0 } },
      ]);
      const foreign = (await WhiteboardVersions.findOneAsync({
        board: otherBoard,
      }))!;
      const otherNodes = await WhiteboardNodes.find({
        board: otherBoard,
      }).fetchAsync();

      await assert.isRejected(
        asUser(member, () =>
          fetchWhiteboardVersion.callPromise({
            boardId,
            versionId: foreign._id,
            index: 0,
          }),
        ),
        /Unknown version/,
      );
      await assert.isRejected(
        asUser(member, () =>
          restoreWhiteboardVersion.callPromise({
            boardId,
            versionId: foreign._id,
          }),
        ),
        /Unknown version/,
      );
      assert.sameDeepMembers(
        await WhiteboardNodes.find({ board: otherBoard }).fetchAsync(),
        otherNodes,
      );
      assert.lengthOf(
        await WhiteboardVersions.find({ board: otherBoard }).fetchAsync(),
        1,
      );
    });

    it("maps merged accounts in a restored payload", async function () {
      const source = await makeUser("source@example.com", []);
      const id = await sticky(source);
      await nextWindow();
      await sticky(member);
      const version = await newest();
      await deleteNodes(member, boardId, [id]);
      await MergeOperations.insertAsync({
        participants: [source, other],
        job: Random.id(),
        completedAt: new Date(),
        createdBy: other,
      });

      await restoreVersion(member, boardId, version._id);

      const restored = (await WhiteboardNodes.findOneAsync(id))!;
      assert.equal(restored.createdBy, other);
      assert.deepEqual(
        restored.contributors.map((c) => c.user),
        [other],
      );
    });

    it("refuses restore without edit access, on an archived hunt, and with history off", async function () {
      const id = await sticky(member);
      const version = await newest();
      await asUser(operator, () =>
        setWhiteboardEditPolicy.callPromise({
          boardId,
          editPolicy: "operators",
          editors: [],
        }),
      );
      await assert.isRejected(
        asUser(member, () =>
          restoreWhiteboardVersion.callPromise({
            boardId,
            versionId: version._id,
          }),
        ),
        /Only operators/,
      );
      await assert.isRejected(
        restoreVersion(outsider, boardId, version._id),
        /member/,
      );

      await Hunts.updateAsync(huntId, { $set: { isArchived: true } });
      await assert.isRejected(
        restoreVersion(operator, boardId, version._id),
        /archived/,
      );
      await Hunts.updateAsync(huntId, { $set: { isArchived: false } });

      await FeatureFlags.insertAsync({
        name: "disable.whiteboard_versions",
        type: "on",
        createdBy: operator,
      });
      await assert.isRejected(
        restoreVersion(operator, boardId, version._id),
        /history is turned off/,
      );
      assert.ok(await WhiteboardNodes.findOneAsync(id));
      assert.lengthOf(await versions(), 1);
    });
  });

  describe("pruneWhiteboardVersions", function () {
    const HOUR = 60 * MINUTE;
    // An hour boundary well in the past, so the test doesn't straddle one
    const now = new Date(Math.floor(Date.now() / HOUR) * HOUR + 30 * MINUTE);

    const fake = async (createdAt: Date, kind: "edits" | "reset" = "edits") => {
      const _id = await WhiteboardVersions.insertAsync({
        hunt: huntId,
        board: boardId,
        kind,
        users: [{ user: member, at: createdAt }],
        changeCount: 1,
        lastEditAt: createdAt,
        nodeCount: 0,
        edgeCount: 0,
        size: 10,
        chunkCount: 1,
        format: 1,
        hash: "0".repeat(64),
        createdAt,
        createdBy: member,
      });
      await WhiteboardVersionChunks.insertAsync({
        hunt: huntId,
        board: boardId,
        version: _id,
        index: 0,
        data: new Uint8Array([1]),
        createdAt,
      });
      return _id;
    };

    it("prunes old versions per the rules", async function () {
      const hourAgo = (h: number, m = 0) =>
        new Date(now.getTime() - 30 * MINUTE - h * HOUR + m * MINUTE);
      const recent = await fake(new Date(now.getTime() - 15 * MINUTE));
      const firstOfHour = await fake(hourAgo(3, 0));
      const laterInHour = await fake(hourAgo(3, 20));
      const reset = await fake(hourAgo(3, 40), "reset");

      const sizes = await pruneWhiteboardVersions(now);

      const left = (await versions()).map((v) => v._id);
      assert.sameMembers(left, [recent, firstOfHour, reset]);
      assert.equal(
        await WhiteboardVersionChunks.find({
          version: laterInHour,
        }).countAsync(),
        0,
      );
      assert.equal(sizes.get(boardId), 30);
      assert.deepEqual(
        (await Whiteboards.findOneAsync(boardId))?.versionsPrunedBefore,
        hourAgo(3, 20),
      );

      // Once the hunt is archived, only the newest ten (and resets) stay
      const more = [];
      for (let i = 1; i <= 12; i++) {
        more.push(await fake(new Date(now.getTime() - i * MINUTE)));
      }
      await Hunts.updateAsync(huntId, { $set: { isArchived: true } });
      await pruneWhiteboardVersions(now);
      assert.sameMembers(
        (await versions()).map((v) => v._id),
        [...more.slice(0, 10), reset],
      );
    });

    it("sweeps headerless chunks older than an hour and keeps newer ones", async function () {
      const real = await fake(new Date(now.getTime() - 10 * MINUTE));
      const orphan = async (age: number) => {
        const version = Random.id();
        await WhiteboardVersionChunks.insertAsync({
          hunt: huntId,
          board: boardId,
          version,
          index: 0,
          data: new Uint8Array([1]),
          createdAt: new Date(now.getTime() - age),
        });
        return version;
      };
      const old = await orphan(2 * HOUR);
      const fresh = await orphan(10 * MINUTE);

      await pruneWhiteboardVersions(now);

      const left = await WhiteboardVersionChunks.find({}).fetchAsync();
      assert.sameMembers(
        left.map((c) => c.version),
        [real, fresh],
      );
      assert.notInclude(
        left.map((c) => c.version),
        old,
      );
    });
  });

  it("publishes nothing with history off", async function () {
    await sticky(member);
    const publish = (
      userId: string,
    ): Promise<Mongo.Cursor<WhiteboardVersionType> | []> =>
      publishHandler(whiteboardVersions.name).call(
        new StubSubscription(userId),
        { boardId },
      );
    const cursor = await publish(member);
    if (Array.isArray(cursor)) throw new Error("Published nothing");
    const published = await cursor.fetchAsync();
    assert.lengthOf(published, 1);
    // without the hash
    assert.notProperty(published[0], "hash");
    assert.deepEqual(await publish(outsider), []);

    await FeatureFlags.insertAsync({
      name: "disable.whiteboard_versions",
      type: "on",
      createdBy: operator,
    });
    assert.deepEqual(await publish(member), []);
    // and records nothing, while edits still go through
    const id = await sticky(other);
    assert.ok(await WhiteboardNodes.findOneAsync(id));
    assert.lengthOf(await versions(), 1);
  });
});
