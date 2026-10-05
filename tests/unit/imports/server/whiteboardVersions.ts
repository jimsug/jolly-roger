import { randomBytes } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { Accounts } from "meteor/accounts-base";
import { EJSON } from "meteor/ejson";
import type { Meteor } from "meteor/meteor";
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
import Puzzles from "../../../../imports/lib/models/Puzzles";
import Settings from "../../../../imports/lib/models/Settings";
import WhiteboardEdges from "../../../../imports/lib/models/WhiteboardEdges";
import WhiteboardNodes from "../../../../imports/lib/models/WhiteboardNodes";
import Whiteboards from "../../../../imports/lib/models/Whiteboards";
import type { WhiteboardVersionType } from "../../../../imports/lib/models/WhiteboardVersions";
import WhiteboardVersions from "../../../../imports/lib/models/WhiteboardVersions";
import whiteboardVersions from "../../../../imports/lib/publications/whiteboardVersions";
import {
  BIG_READS_PER_MINUTE,
  MAX_BATCH,
  MAX_INK_POINTS_PER_BOARD,
  MAX_KEPT_EXPORTS,
  MAX_NODES_PER_BOARD,
  MAX_VERSION_BYTES_PER_BOARD,
  VERSION_INTERVAL_MS,
} from "../../../../imports/lib/whiteboard/limits";
import exportWhiteboard from "../../../../imports/methods/exportWhiteboard";
import fetchWhiteboardVersion from "../../../../imports/methods/fetchWhiteboardVersion";
import restoreWhiteboardItems from "../../../../imports/methods/restoreWhiteboardItems";
import restoreWhiteboardVersion from "../../../../imports/methods/restoreWhiteboardVersion";
import sendChatMessage from "../../../../imports/methods/sendChatMessage";
import setWhiteboardEditPolicy from "../../../../imports/methods/setWhiteboardEditPolicy";
import makeFixtureHunt from "../../../../imports/server/makeFixtureHunt";
import Locks from "../../../../imports/server/models/Locks";
import WhiteboardVersionChunks from "../../../../imports/server/models/WhiteboardVersionChunks";
import {
  ensureWhiteboard,
  syncPuzzlesOnBoard,
} from "../../../../imports/server/whiteboard";
import {
  deleteNodes,
  upsertEdges,
  upsertNodes,
} from "../../../../imports/server/whiteboardEdits";
import { resetLayout } from "../../../../imports/server/whiteboardReset";
import {
  compressVersion,
  decodeVersion,
  EXPORT_KEPT_MS,
  exportBoard,
  fetchVersion,
  pruneWhiteboardVersions,
  restoreItems,
  restoreVersion,
  serializeBoard,
} from "../../../../imports/server/whiteboardVersions";
import asUser from "../../../lib/asUser";
import createTestHunt from "../../../lib/createTestHunt";
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

  // An ink stroke of `count` points that zigzags, so simplifying keeps
  // every one of them
  const zigzag = (count: number) => ({
    _id: Random.id(),
    type: "ink" as const,
    position: { x: 600, y: 600 },
    strokeWidth: "thin" as const,
    stroke: Random.id(),
    points: Array.from({ length: count }, (_, i): [number, number, number] => [
      i * 5,
      (i % 2) * 5,
      0.5,
    ]),
  });

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

  describe("export", function () {
    const exportChunk = (userId: string, index = 0) =>
      asUser(userId, () => exportWhiteboard.callPromise({ boardId, index }));
    const download = async (userId: string) => {
      const { data, chunkCount } = await exportChunk(userId);
      assert.equal(chunkCount, 1);
      return EJSON.parse(gunzipSync(data).toString("utf8")) as {
        format: number;
        nodes: unknown[];
        edges: unknown[];
      };
    };

    it("gives a member every node and line on the board, ink included", async function () {
      const ink = zigzag(20);
      await upsertNodes(member, boardId, [ink]);
      const [a, b] = [await sticky(member), await sticky(member)];
      await upsertEdges(member, boardId, [
        { _id: Random.id(), source: a, target: b },
      ]);
      const live = await board();

      const payload = await download(member);
      assert.equal(payload.format, 1);
      assert.sameDeepMembers(payload.nodes, live.nodes);
      assert.sameDeepMembers(payload.edges, live.edges);
      assert.isNotEmpty(live.edges);
      assert.deepEqual(
        (payload.nodes as typeof live.nodes).find((n) => n._id === ink._id)
          ?.points,
        ink.points,
      );
      await assert.isRejected(exportChunk(member, 1), /No such part/);
      await assert.isRejected(exportChunk(member, -1), /No such part/);
    });

    it("gives the same hash for the same board, and a new one once it changes", async function () {
      const first = await exportChunk(member);
      const again = await exportChunk(member);
      assert.equal(again.hash, first.hash);
      assert.deepEqual([...again.data], [...first.data]);
      await sticky(member);
      assert.notEqual((await exportChunk(member)).hash, first.hash);
    });

    describe("a board too big for one chunk", function () {
      // A connection whose close can be triggered, as the method's is.
      const connection = () => {
        const closers: (() => void)[] = [];
        return {
          id: Random.id(),
          onClose(cb: () => void) {
            closers.push(cb);
          },
          close: () => closers.forEach((cb) => cb()),
        } satisfies Pick<Meteor.Connection, "id" | "onClose"> & {
          close: () => void;
        };
      };
      // How many times the board's nodes are read
      const boardReads = () => {
        const find = WhiteboardNodes.find.bind(WhiteboardNodes);
        let reads = 0;
        sinon
          .stub(WhiteboardNodes, "find")
          .callsFake((...args: Parameters<typeof find>) => {
            const selector = args[0] as Record<string, unknown> | undefined;
            if (
              selector?.board === boardId &&
              Object.keys(selector).length === 1
            ) {
              reads += 1;
            }
            return find(...args);
          });
        return () => reads;
      };

      beforeEach(async function () {
        // Text that doesn't compress, so the board comes to two chunks
        await WhiteboardNodes.insertAsync({
          hunt: huntId,
          board: boardId,
          type: "sticky",
          position: { x: 0, y: 0 },
          text: randomBytes(6 * 1024 * 1024).toString("base64"),
          createdBy: member,
        });
      });

      afterEach(function () {
        sinon.restore();
      });

      it("reads and compresses it once for all its chunks", async function () {
        const live = await board();
        const reads = boardReads();
        const conn = connection();
        const first = await exportBoard(member, boardId, 0, undefined, conn);
        assert.equal(first.chunkCount, 2);
        const second = await exportBoard(member, boardId, 1, first.hash, conn);
        assert.equal(second.hash, first.hash);
        assert.equal(reads(), 1);
        const payload = EJSON.parse(
          gunzipSync(Buffer.concat([first.data, second.data])).toString("utf8"),
        ) as { nodes: unknown[]; edges: unknown[] };
        assert.sameDeepMembers(payload.nodes, live.nodes);
        assert.sameDeepMembers(payload.edges, live.edges);

        // The export is dropped once its last chunk is sent
        await exportBoard(member, boardId, 1, first.hash, conn);
        assert.equal(reads(), 2);
      });

      it("reads the board again for a later chunk of an export it no longer has", async function () {
        const reads = boardReads();
        const conn = connection();
        const first = await exportBoard(member, boardId, 0, undefined, conn);
        conn.close();
        await WhiteboardNodes.insertAsync({
          hunt: huntId,
          board: boardId,
          type: "text",
          position: { x: 0, y: 0 },
          createdBy: member,
        });
        const second = await exportBoard(member, boardId, 1, first.hash, conn);
        assert.equal(reads(), 2);
        assert.notEqual(second.hash, first.hash);

        // and without a connection, every chunk reads it
        const third = await exportBoard(member, boardId, 0, undefined, null);
        await exportBoard(member, boardId, 1, third.hash, null);
        assert.equal(reads(), 4);
      });

      it("drops an export nothing has fetched from for five minutes", async function () {
        const reads = boardReads();
        const conn = connection();
        // Only Date, so the database's own timers still run
        const clock = sinon.useFakeTimers({
          now: Date.now(),
          toFake: ["Date"],
        });
        const other = connection();
        try {
          const first = await exportBoard(member, boardId, 0, undefined, conn);
          clock.tick(EXPORT_KEPT_MS - 1000);
          // Another connection's export sweeps, but this one isn't stale yet
          await exportBoard(member, boardId, 0, undefined, other);
          assert.equal(reads(), 2);
          clock.tick(1000);
          await WhiteboardNodes.insertAsync({
            hunt: huntId,
            board: boardId,
            type: "text",
            position: { x: 0, y: 0 },
            createdBy: member,
          });
          const second = await exportBoard(
            member,
            boardId,
            1,
            first.hash,
            conn,
          );
          assert.equal(reads(), 3);
          assert.notEqual(second.hash, first.hash);
        } finally {
          other.close();
        }
      });

      it("keeps at most eight exports on a server, dropping the one fetched from longest ago", async function () {
        const reads = boardReads();
        const conns = Array.from({ length: MAX_KEPT_EXPORTS + 1 }, () =>
          connection(),
        );
        try {
          const first = await exportBoard(
            member,
            boardId,
            0,
            undefined,
            conns[0]!,
          );
          for (const conn of conns.slice(1)) {
            await exportBoard(member, boardId, 0, undefined, conn);
          }
          assert.equal(reads(), conns.length);
          // The newest still has its export
          await exportBoard(member, boardId, 1, first.hash, conns.at(-1)!);
          assert.equal(reads(), conns.length);
          // The first's has gone, so its next chunk reads the board again
          await exportBoard(member, boardId, 1, first.hash, conns[0]!);
          assert.equal(reads(), conns.length + 1);
        } finally {
          conns.forEach((conn) => conn.close());
        }
      });

      it("keeps an export for its next chunk until five minutes are up", async function () {
        const reads = boardReads();
        const conn = connection();
        const clock = sinon.useFakeTimers({
          now: Date.now(),
          toFake: ["Date"],
        });
        const first = await exportBoard(member, boardId, 0, undefined, conn);
        clock.tick(EXPORT_KEPT_MS - 1000);
        const second = await exportBoard(member, boardId, 1, first.hash, conn);
        assert.equal(second.hash, first.hash);
        assert.equal(reads(), 1);
      });

      it("counts the five minutes from the last chunk fetched", async function () {
        // A second sticky that doesn't compress, so there are more than two
        // chunks
        await WhiteboardNodes.insertAsync({
          hunt: huntId,
          board: boardId,
          type: "sticky",
          position: { x: 0, y: 0 },
          text: randomBytes(6 * 1024 * 1024).toString("base64"),
          createdBy: member,
        });
        const reads = boardReads();
        const conn = connection();
        const clock = sinon.useFakeTimers({
          now: Date.now(),
          toFake: ["Date"],
        });
        try {
          const first = await exportBoard(member, boardId, 0, undefined, conn);
          assert.isAtLeast(first.chunkCount, 3);
          clock.tick(EXPORT_KEPT_MS - 1000);
          await exportBoard(member, boardId, 1, first.hash, conn);
          // Over five minutes since chunk 0, but not since chunk 1
          clock.tick(2000);
          const third = await exportBoard(member, boardId, 2, first.hash, conn);
          assert.equal(third.hash, first.hash);
          assert.equal(reads(), 1);
        } finally {
          conn.close();
        }
      });
    });

    it("lets each person fetch 60 chunks a minute, versions and exports together, across connections", async function () {
      const { nodes, edges } = await board();
      const { versionId } = await storeVersion(nodes, edges);
      const clock = sinon.useFakeTimers({
        now: Date.now(),
        toFake: ["Date"],
      });
      try {
        for (let i = 0; i < BIG_READS_PER_MINUTE; i++) {
          if (i % 2 === 0) {
            await fetchVersion(member, boardId, versionId, 0);
          } else {
            await exportBoard(member, boardId, 0, undefined, null);
          }
        }
        await assert.isRejected(
          fetchVersion(member, boardId, versionId, 0),
          /try again in a minute/,
        );
        await assert.isRejected(exportChunk(member), /try again in a minute/);
        await assert.isRejected(
          asUser(member, () =>
            fetchWhiteboardVersion.callPromise({
              boardId,
              versionId,
              index: 0,
            }),
          ),
          /try again in a minute/,
        );
        // Someone else isn't held back
        await fetchVersion(other, boardId, versionId, 0);
        // A second later there's one more
        clock.tick(1000);
        await fetchVersion(member, boardId, versionId, 0);
        await assert.isRejected(
          fetchVersion(member, boardId, versionId, 0),
          /try again in a minute/,
        );
      } finally {
        clock.restore();
      }
    });

    it("works on an archived hunt, and with history off", async function () {
      await Hunts.updateAsync(huntId, { $set: { isArchived: true } });
      await FeatureFlags.insertAsync({
        name: "disable.whiteboard_versions",
        type: "on",
        createdBy: operator,
      });
      const payload = await download(member);
      assert.sameDeepMembers(payload.nodes, (await board()).nodes);
    });

    it("refuses someone outside the hunt, and while the whiteboard is off", async function () {
      await assert.isRejected(exportChunk(outsider), /member/);
      await FeatureFlags.insertAsync({
        name: "disable.whiteboard",
        type: "on",
        createdBy: operator,
      });
      await assert.isRejected(exportChunk(member), /whiteboard is disabled/);
    });
  });

  // A puzzle's card, and the puzzle deleted (and replaced by replacedBy, if
  // given) with the board synced, as destroyPuzzle's deferred sync does.
  const firstCard = async () =>
    (await WhiteboardNodes.findOneAsync({ board: boardId, type: "puzzle" }))!;
  const deletePuzzle = async (puzzleId: string, replacedBy?: string) => {
    await Puzzles.updateAsync(puzzleId, {
      $set: { deleted: true, ...(replacedBy ? { replacedBy } : {}) },
    });
    await syncPuzzlesOnBoard(huntId, [puzzleId]);
  };
  const newPuzzle = async (tags: string[]) => {
    const puzzleId = await Puzzles.insertAsync({
      hunt: huntId,
      title: "Replacement",
      tags,
      answers: [],
      expectedAnswerCount: 1,
      createdBy: operator,
    });
    await syncPuzzlesOnBoard(huntId, [puzzleId]);
    return puzzleId;
  };

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

    it("keeps an image node in a version and puts it back", async function () {
      await Settings.insertAsync({
        name: "s3.image_bucket",
        value: { bucketName: "jr-test-images", bucketRegion: "us-east-1" },
        createdBy: operator,
      });
      const backing = (await Whiteboards.findOneAsync(boardId))!.puzzle;
      const _id = Random.id();
      const image = {
        url: `https://s3.us-east-1.amazonaws.com/jr-test-images/${huntId}/${backing}/${Random.id()}`,
        width: 640,
        height: 480,
      };
      await upsertNodes(member, boardId, [
        {
          _id,
          type: "image",
          position: { x: 40, y: 60 },
          width: 320,
          height: 240,
          image,
        },
      ]);
      await nextWindow();
      await deleteNodes(member, boardId, [_id]);
      const version = await newest();
      const payload = await payloadOf(version);
      assert.deepEqual(payload.nodes.find((n) => n._id === _id)?.image, image);

      await asUser(member, () =>
        restoreWhiteboardVersion.callPromise({
          boardId,
          versionId: version._id,
        }),
      );
      const restored = (await WhiteboardNodes.findOneAsync(_id))!;
      assert.equal(restored.type, "image");
      assert.deepEqual(restored.image, image);
      assert.equal(restored.width, 320);
      assert.equal(restored.height, 240);
    });

    it("keeps a shape and a highlighter stroke in a version and puts them back", async function () {
      const shape = Random.id();
      const marker = Random.id();
      await upsertNodes(member, boardId, [
        {
          _id: shape,
          type: "shape",
          position: { x: 40, y: 60 },
          width: 160,
          height: 120,
          shape: "ellipse",
          color: "pink",
        },
        {
          _id: marker,
          type: "ink",
          position: { x: 0, y: 0 },
          strokeWidth: "marker",
          stroke: Random.id(),
          points: [
            [0, 0, 0.5],
            [100, 0, 0.5],
          ],
        },
      ]);
      await nextWindow();
      await deleteNodes(member, boardId, [shape, marker]);
      const version = await newest();

      await asUser(member, () =>
        restoreWhiteboardVersion.callPromise({
          boardId,
          versionId: version._id,
        }),
      );
      const restored = (await WhiteboardNodes.findOneAsync(shape))!;
      assert.equal(restored.type, "shape");
      assert.equal(restored.shape, "ellipse");
      assert.equal(restored.color, "pink");
      assert.equal(restored.width, 160);
      assert.equal(
        (await WhiteboardNodes.findOneAsync(marker))?.strokeWidth,
        "marker",
      );
    });

    it("doesn't put back a deleted puzzle's card, but moves it with the version", async function () {
      const card = await firstCard();
      const note = await sticky(member, { x: 6000, y: 6000 });
      const line = Random.id();
      await upsertEdges(member, boardId, [
        { _id: line, source: note, target: card._id },
      ]);
      await nextWindow();
      await sticky(member);
      const version = await newest();
      await upsertNodes(member, boardId, [
        { _id: card._id, position: { x: 7000, y: 7000 } },
      ]);
      await deletePuzzle(card.puzzle!);
      assert.isTrue((await WhiteboardNodes.findOneAsync(card._id))?.hidden);

      await restoreVersion(member, boardId, version._id);

      const after = (await WhiteboardNodes.findOneAsync(card._id))!;
      assert.isTrue(after.hidden);
      assert.isTrue(after.hiddenWithPuzzle);
      assert.deepEqual(after.position, card.position);
      assert.equal(after.parent, card.parent);
      assert.equal(
        (await WhiteboardEdges.findOneAsync(line))?.target,
        card._id,
      );
      assert.equal(
        await WhiteboardNodes.find({
          board: boardId,
          puzzle: card.puzzle,
          hidden: { $ne: true },
        }).countAsync(),
        0,
      );
    });

    it("keeps a card handed over to a replacement, where the version had it", async function () {
      const card = await firstCard();
      const note = await sticky(member, { x: 6000, y: 6000 });
      const line = Random.id();
      await upsertEdges(member, boardId, [
        { _id: line, source: note, target: card._id },
      ]);
      await nextWindow();
      await sticky(member);
      const version = await newest();
      const old = (await Puzzles.findOneAsync(card.puzzle))!;
      const replacement = await newPuzzle(old.tags);
      await deletePuzzle(old._id, replacement);
      assert.equal(
        (await WhiteboardNodes.findOneAsync(card._id))?.puzzle,
        replacement,
      );
      await upsertNodes(member, boardId, [
        { _id: card._id, position: { x: 7000, y: 7000 } },
      ]);

      await restoreVersion(member, boardId, version._id);

      const cards = await WhiteboardNodes.find({
        board: boardId,
        puzzle: { $in: [old._id, replacement] },
      }).fetchAsync();
      assert.deepEqual(
        cards.map((c) => [c._id, c.puzzle, c.hidden]),
        [[card._id, replacement, undefined]],
      );
      assert.deepEqual(cards[0]!.position, card.position);
      assert.equal(cards[0]!.parent, card.parent);
      assert.equal(
        (await WhiteboardEdges.findOneAsync(line))?.target,
        card._id,
      );
    });

    it("restores whether a frame is collapsed", async function () {
      const frame = (await WhiteboardNodes.findOneAsync({
        board: boardId,
        type: "frame",
      }))!;
      const isCollapsed = async () =>
        (await WhiteboardNodes.findOneAsync(frame._id))?.collapsed;
      // Folding alone records nothing, so an edit after it records the board
      // with the frame folded
      await upsertNodes(member, boardId, [{ _id: frame._id, collapsed: true }]);
      await nextWindow();
      await sticky(member);
      const folded = await newest();
      await upsertNodes(member, boardId, [
        { _id: frame._id, collapsed: false },
      ]);
      await nextWindow();
      await sticky(member);
      const open = await newest();
      assert.notEqual(open._id, folded._id);
      assert.isUndefined(await isCollapsed());

      await restoreVersion(member, boardId, folded._id);
      assert.isTrue(await isCollapsed());

      await restoreVersion(member, boardId, open._id);
      assert.isUndefined(await isCollapsed());
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

    it("puts back nodes and lines whose ids have since been taken on another board, under new ones", async function () {
      const a = await sticky(member, { x: 0, y: 0 });
      const b = await sticky(member, { x: 400, y: 0 });
      const line = Random.id();
      await upsertEdges(member, boardId, [{ _id: line, source: a, target: b }]);
      await upsertNodes(member, boardId, [{ _id: a, text: "taken" }]);
      const puzzleId = (await Whiteboards.findOneAsync(boardId))!.puzzle;
      await asUser(member, () =>
        sendChatMessage.callPromise({
          puzzleId,
          content: JSON.stringify(contentFromMessage("on the taken sticky")),
          comment: { node: a, x: 10, y: 20 },
        }),
      );
      await nextWindow();
      await sticky(member, { x: 800, y: 0 });
      const version = await newest();
      await deleteNodes(member, boardId, [a]);
      assert.notOk(await WhiteboardEdges.findOneAsync(line));

      // A member of another hunt reuses both ids there
      const otherHunt = await createTestHunt(operator);
      await MeteorUsers.updateAsync(operator, {
        $addToSet: { hunts: otherHunt },
        $set: { [`roles.${otherHunt}`]: ["operator"] },
      });
      const otherBoard = await ensureWhiteboard(operator, otherHunt);
      const end = Random.id();
      await upsertNodes(operator, otherBoard, [
        { _id: a, type: "sticky", position: { x: 0, y: 0 } },
        { _id: end, type: "sticky", position: { x: 400, y: 0 } },
      ]);
      await upsertEdges(operator, otherBoard, [
        { _id: line, source: a, target: end },
      ]);

      await restoreVersion(member, boardId, version._id);

      const restored = (await WhiteboardNodes.findOneAsync({
        board: boardId,
        text: "taken",
      }))!;
      assert.ok(restored);
      assert.notEqual(restored._id, a);
      const lines = await WhiteboardEdges.find({
        board: boardId,
        target: b,
      }).fetchAsync();
      assert.lengthOf(lines, 1);
      assert.equal(lines[0]!.source, restored._id);
      assert.notEqual(lines[0]!._id, line);
      assert.equal(
        (
          await ChatMessages.findOneAsync({
            "content.children.text": "on the taken sticky",
          })
        )?.comment?.node,
        restored._id,
      );
      // The other board's are left alone
      assert.equal((await WhiteboardNodes.findOneAsync(a))?.board, otherBoard);
      assert.equal(
        (await WhiteboardEdges.findOneAsync(line))?.board,
        otherBoard,
      );
      // and so it can be restored again, when the node keeps its new id
      // and its comment
      await restoreVersion(other, boardId, version._id);
      const again = await WhiteboardNodes.find({
        board: boardId,
        text: "taken",
      }).fetchAsync();
      assert.deepEqual(
        again.map((n) => n._id),
        [restored._id],
      );
      assert.equal(
        (
          await ChatMessages.findOneAsync({
            "content.children.text": "on the taken sticky",
          })
        )?.comment?.node,
        restored._id,
      );
    });

    it("finishes a restore that fails part-way through writing", async function () {
      const a = await sticky(member, { x: 0, y: 0 });
      const b = await sticky(member, { x: 400, y: 0 });
      await upsertEdges(member, boardId, [
        { _id: Random.id(), source: a, target: b },
      ]);
      await nextWindow();
      await sticky(member, { x: 800, y: 0 });
      const version = await newest();
      const target = await payloadOf(version);
      await deleteNodes(member, boardId, [a, b]);

      const insertEdges = sinon.stub(WhiteboardEdges, "insertManyAsync");
      insertEdges.callThrough();
      insertEdges.onFirstCall().rejects(new Error("connection reset"));
      try {
        await restoreVersion(member, boardId, version._id);
      } finally {
        insertEdges.restore();
      }

      const live = await board();
      assert.sameMembers(
        live.nodes.map((n) => n._id),
        target.nodes.map((n) => n._id),
      );
      assert.sameMembers(
        live.edges.map((e) => e._id),
        target.edges.map((e) => e._id),
      );
    });

    it("records one version for a burst of resets and restores by one person", async function () {
      await sticky(member, { x: 0, y: 0 });
      await nextWindow();
      await sticky(member, { x: 400, y: 0 });
      const version = await newest();
      await restoreVersion(member, boardId, version._id);
      const recorded = (await versions()).length;
      const size = (await versions()).reduce((sum, v) => sum + v.size, 0);

      for (let i = 0; i < 3; i++) {
        await restoreVersion(member, boardId, version._id);
      }
      await resetLayout(member, boardId, false);
      assert.lengthOf(await versions(), recorded);
      assert.equal(
        (await versions()).reduce((sum, v) => sum + v.size, 0),
        size,
      );

      // Someone else's records the board as they found it
      await restoreVersion(other, boardId, version._id);
      assert.lengthOf(await versions(), recorded + 1);
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

    it("records nothing when a version has more drawing on it than a board can hold", async function () {
      const stroke = zigzag(3);
      await upsertNodes(member, boardId, [stroke]);
      const template = (await WhiteboardNodes.findOneAsync(stroke._id))!;
      const inky = await storeVersion(
        [{ ...template, points: zigzag(MAX_INK_POINTS_PER_BOARD + 1).points }],
        [],
      );
      const before = await versions();
      const { nodes } = await board();
      await assert.isRejected(
        restoreVersion(member, boardId, inky.versionId),
        /more drawing on it than a board can hold/,
      );
      assert.sameMembers(
        (await versions()).map((v) => v._id),
        before.map((v) => v._id),
      );
      assert.sameDeepMembers((await board()).nodes, nodes);
    });

    it("restores a version with less drawing on a board already past the budget", async function () {
      const stroke = zigzag(10);
      await upsertNodes(member, boardId, [stroke]);
      await nextWindow();
      await deleteNodes(member, boardId, [stroke._id]);
      const version = await newest();
      // Ink from before there was a budget
      const heavy = await WhiteboardNodes.insertAsync({
        hunt: huntId,
        board: boardId,
        type: "ink",
        position: { x: 0, y: 0 },
        strokeWidth: "thin",
        points: zigzag(MAX_INK_POINTS_PER_BOARD + 10).points,
        createdBy: member,
      });

      await restoreVersion(member, boardId, version._id);
      assert.ok(await WhiteboardNodes.findOneAsync(stroke._id));
      assert.notOk(await WhiteboardNodes.findOneAsync(heavy));
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

  describe("restoring items", function () {
    const frame = async (position: { x: number; y: number }) => {
      const _id = Random.id();
      await upsertNodes(member, boardId, [
        { _id, type: "frame", position, width: 3000, height: 3000 },
      ]);
      return _id;
    };
    const stickiesIn = async (parent: string, count: number) => {
      const ids = Array.from({ length: count }, () => Random.id());
      await upsertNodes(
        member,
        boardId,
        ids.map((_id, i) => ({
          _id,
          type: "sticky" as const,
          parent,
          position: {
            x: 24 + (i % 10) * 200,
            y: 64 + Math.floor(i / 10) * 200,
          },
        })),
      );
      return ids;
    };
    const nodeById = async (id: string) =>
      (await WhiteboardNodes.findOneAsync(id))!;

    it("restores one deleted sticky from a version", async function () {
      const gone = await sticky(member, { x: 300, y: 40 });
      await upsertNodes(member, boardId, [{ _id: gone, text: "remember me" }]);
      const puzzleId = (await Whiteboards.findOneAsync(boardId))!.puzzle;
      await asUser(member, () =>
        sendChatMessage.callPromise({
          puzzleId,
          content: JSON.stringify(contentFromMessage("on the sticky")),
          comment: { node: gone, x: 10, y: 20 },
        }),
      );
      const pin = (await ChatMessages.findOneAsync({
        "content.children.text": "on the sticky",
      }))!._id;
      await nextWindow();
      await deleteNodes(member, boardId, [gone]);
      const version = await newest();
      assert.notOk(await WhiteboardNodes.findOneAsync(gone));

      const changed = await asUser(member, () =>
        restoreWhiteboardItems.callPromise({
          boardId,
          versionId: version._id,
          nodeIds: [gone],
        }),
      );

      assert.isTrue(changed.restored);
      const restored = await nodeById(gone);
      assert.deepEqual(restored.position, { x: 300, y: 40 });
      assert.equal(restored.text, "remember me");
      assert.deepEqual((await ChatMessages.findOneAsync(pin))?.comment, {
        node: gone,
        x: 10,
        y: 20,
      });
    });

    it("changes nothing, and says so, for an item that's as the version has it", async function () {
      const id = await sticky(member, { x: 300, y: 40 });
      await nextWindow();
      await sticky(member, { x: 900, y: 40 });
      const version = await newest();
      const before = await board();
      const recorded = (await versions()).map((v) => v._id);

      const changed = await asUser(member, () =>
        restoreWhiteboardItems.callPromise({
          boardId,
          versionId: version._id,
          nodeIds: [id],
        }),
      );

      assert.isFalse(changed.restored);
      const after = await board();
      assert.sameDeepMembers(after.nodes, before.nodes);
      assert.sameDeepMembers(after.edges, before.edges);
      assert.sameMembers(
        (await versions()).map((v) => v._id),
        recorded,
      );
    });

    it("takes comments off a node it hides", async function () {
      // A deleted card is hidden, and a version can have it so
      const card = (await WhiteboardNodes.findOneAsync({
        board: boardId,
        type: "puzzle",
      }))!;
      await deleteNodes(member, boardId, [card._id]);
      await nextWindow();
      await upsertNodes(member, boardId, [{ _id: card._id, hidden: false }]);
      const version = await newest();
      assert.notOk((await nodeById(card._id)).hidden);
      const puzzleId = (await Whiteboards.findOneAsync(boardId))!.puzzle;
      await asUser(member, () =>
        sendChatMessage.callPromise({
          puzzleId,
          content: JSON.stringify(contentFromMessage("on the shown card")),
          comment: { node: card._id, x: 10, y: 20 },
        }),
      );
      const pin = (await ChatMessages.findOneAsync({
        "content.children.text": "on the shown card",
      }))!._id;

      assert.isTrue(
        await restoreItems(member, boardId, version._id, [card._id]),
      );

      assert.isTrue((await nodeById(card._id)).hidden);
      const comment = (await ChatMessages.findOneAsync(pin))?.comment;
      assert.isUndefined(comment?.node);
      assert.equal(comment?.detachedFrom, card._id);
    });

    it("restores a frame and its children within the cap and refuses past it", async function () {
      const small = await frame({ x: 6000, y: 0 });
      const children = await stickiesIn(small, 3);
      const big = await frame({ x: 12000, y: 0 });
      const crowd = await stickiesIn(big, MAX_BATCH);
      await nextWindow();
      await upsertNodes(member, boardId, [
        { _id: children[0]!, parent: null, position: { x: 9000, y: 9000 } },
      ]);
      const version = await newest();
      await deleteNodes(member, boardId, [small, big]);
      assert.notOk(await WhiteboardNodes.findOneAsync(small));

      await restoreItems(member, boardId, version._id, [small]);

      assert.ok(await WhiteboardNodes.findOneAsync(small));
      for (const [i, id] of children.entries()) {
        const child = await nodeById(id);
        assert.equal(child.parent, small);
        assert.deepEqual(child.position, { x: 24 + i * 200, y: 64 });
      }

      const before = await board();
      const recorded = (await versions()).map((v) => v._id);
      await assert.isRejected(
        restoreItems(member, boardId, version._id, [big]),
        /too much to restore at once/,
      );
      assert.notOk(await WhiteboardNodes.findOneAsync(big));
      assert.sameDeepMembers((await board()).nodes, before.nodes);
      assert.sameMembers(
        (await versions()).map((v) => v._id),
        recorded,
      );
      assert.lengthOf(crowd, MAX_BATCH);
    });

    it("leaves live documents outside the set alone", async function () {
      const round = await frame({ x: 6000, y: 0 });
      const [inside] = await stickiesIn(round, 1);
      const outside = await sticky(member, { x: 0, y: 6000 });
      await nextWindow();
      await upsertNodes(member, boardId, [
        { _id: inside!, parent: null, position: { x: 9000, y: 9000 } },
        { _id: outside, position: { x: 100, y: 7000 } },
      ]);
      const version = await newest();
      // Added since: a sticky in the frame and a line to it
      const [added] = await stickiesIn(round, 1);
      await upsertNodes(member, boardId, [
        { _id: added!, position: { x: 1200, y: 1200 } },
      ]);
      const line = Random.id();
      await upsertEdges(member, boardId, [
        { _id: line, source: added!, target: outside },
      ]);
      const before = await board();

      await restoreItems(member, boardId, version._id, [round]);

      const after = await board();
      assert.includeMembers(
        after.nodes.map((n) => n._id),
        before.nodes.map((n) => n._id),
      );
      assert.includeMembers(
        after.edges.map((e) => e._id),
        before.edges.map((e) => e._id),
      );
      assert.equal((await nodeById(inside!)).parent, round);
      const stillAdded = await nodeById(added!);
      assert.equal(stillAdded.parent, round);
      assert.deepEqual(stillAdded.position, { x: 1200, y: 1200 });
      assert.deepEqual((await nodeById(outside)).position, {
        x: 100,
        y: 7000,
      });
    });

    it("updates a live card whose stored id changed instead of inserting a duplicate", async function () {
      const card = (await WhiteboardNodes.findOneAsync({
        board: boardId,
        type: "puzzle",
      }))!;
      await nextWindow();
      await sticky(member);
      const version = await newest();

      // The card is replaced by another for the same puzzle, somewhere else
      await WhiteboardNodes.removeAsync(card._id);
      const replacement = await WhiteboardNodes.insertAsync({
        hunt: huntId,
        board: boardId,
        type: "puzzle",
        puzzle: card.puzzle,
        position: { x: 9000, y: 9000 },
        manual: true,
        createdBy: operator,
      });

      await restoreItems(member, boardId, version._id, [card._id]);

      const cards = await WhiteboardNodes.find({
        board: boardId,
        puzzle: card.puzzle,
      }).fetchAsync();
      assert.lengthOf(cards, 1);
      assert.equal(cards[0]!._id, replacement);
      assert.deepEqual(cards[0]!.position, card.position);
      assert.equal(cards[0]!.parent, card.parent);
      assert.isUndefined(cards[0]!.manual);
    });

    it("doesn't put back a deleted puzzle's card", async function () {
      const card = await firstCard();
      await nextWindow();
      await sticky(member);
      const version = await newest();
      await deletePuzzle(card.puzzle!);

      await restoreItems(member, boardId, version._id, [card._id]);

      const after = (await WhiteboardNodes.findOneAsync(card._id))!;
      assert.isTrue(after.hidden);
      assert.isTrue(after.hiddenWithPuzzle);
      assert.equal(
        await WhiteboardNodes.find({
          board: boardId,
          puzzle: card.puzzle,
        }).countAsync(),
        1,
      );
    });

    it("refuses without edit access, on an archived hunt and with history off", async function () {
      const id = await sticky(member);
      await nextWindow();
      await deleteNodes(member, boardId, [id]);
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
          restoreWhiteboardItems.callPromise({
            boardId,
            versionId: version._id,
            nodeIds: [id],
          }),
        ),
        /Only operators/,
      );
      await assert.isRejected(
        restoreItems(outsider, boardId, version._id, [id]),
        /member/,
      );
      await assert.isRejected(
        restoreItems(operator, boardId, Random.id(), [id]),
        /Unknown version/,
      );
      await assert.isRejected(
        restoreItems(operator, boardId, version._id, [Random.id()]),
        /isn't in this version/,
      );
      await assert.isRejected(
        restoreItems(operator, boardId, version._id, []),
        /Nothing to restore/,
      );
      await assert.isRejected(
        restoreItems(
          operator,
          boardId,
          version._id,
          Array.from({ length: MAX_BATCH + 1 }, () => id),
        ),
        /Too many nodes/,
      );

      await Hunts.updateAsync(huntId, { $set: { isArchived: true } });
      await assert.isRejected(
        restoreItems(operator, boardId, version._id, [id]),
        /archived/,
      );
      await Hunts.updateAsync(huntId, { $set: { isArchived: false } });

      await FeatureFlags.insertAsync({
        name: "disable.whiteboard_versions",
        type: "on",
        createdBy: operator,
      });
      await assert.isRejected(
        restoreItems(operator, boardId, version._id, [id]),
        /history is turned off/,
      );
      assert.notOk(await WhiteboardNodes.findOneAsync(id));
      assert.lengthOf(await versions(), 2);
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
      const foreignSticky = Random.id();
      await upsertNodes(operator, otherBoard, [
        { _id: foreignSticky, type: "sticky", position: { x: 0, y: 0 } },
      ]);
      const foreign = (await WhiteboardVersions.findOneAsync({
        board: otherBoard,
      }))!;
      const before = await board();
      const recorded = (await versions()).map((v) => v._id);

      await assert.isRejected(
        restoreItems(operator, boardId, foreign._id, [foreignSticky]),
        /Unknown version/,
      );
      const after = await board();
      assert.sameDeepMembers(after.nodes, before.nodes);
      assert.sameDeepMembers(after.edges, before.edges);
      assert.sameMembers(
        (await versions()).map((v) => v._id),
        recorded,
      );
    });

    it("records an edits version, not a restore one, and leaves lastRewrittenAt unset", async function () {
      const id = await sticky(member);
      await nextWindow();
      await deleteNodes(member, boardId, [id]);
      const version = await newest();
      await nextWindow();

      await restoreItems(other, boardId, version._id, [id]);

      const recorded = await newest();
      assert.notEqual(recorded._id, version._id);
      assert.equal(recorded.kind, "edits");
      assert.deepEqual(
        recorded.users.map((u) => u.user),
        [other],
      );
      const payload = await payloadOf(recorded);
      assert.notInclude(
        payload.nodes.map((n) => n._id),
        id,
      );
      assert.isUndefined(
        (await Whiteboards.findOneAsync(boardId))?.lastRewrittenAt,
      );

      // It coalesces with the same person's next edit
      await sticky(other);
      const after = await newest();
      assert.equal(after._id, recorded._id);
      assert.equal(after.changeCount, 2);
    });

    it("records no version when there's nothing to restore", async function () {
      const id = await sticky(member, { x: 300, y: 40 });
      await nextWindow();
      await sticky(member, { x: 900, y: 40 });
      const version = await newest();
      // Far enough on that any edit would start a version of its own
      await nextWindow();
      const before = (await versions()).map((v) => [v._id, v.changeCount]);

      const restored = await restoreItems(member, boardId, version._id, [id]);

      assert.isFalse(restored);
      assert.sameDeepMembers(
        (await versions()).map((v) => [v._id, v.changeCount]),
        before,
      );
    });

    it("refuses to put back ink the board has no room for", async function () {
      const stroke = zigzag(20);
      await upsertNodes(member, boardId, [stroke]);
      await nextWindow();
      await deleteNodes(member, boardId, [stroke._id]);
      const version = await newest();
      await WhiteboardNodes.insertAsync({
        hunt: huntId,
        board: boardId,
        type: "ink",
        position: { x: 0, y: 0 },
        strokeWidth: "thin",
        points: zigzag(MAX_INK_POINTS_PER_BOARD - 10).points,
        createdBy: member,
      });

      await assert.isRejected(
        restoreItems(member, boardId, version._id, [stroke._id]),
        /as much drawing as it can hold/,
      );
      assert.notOk(await WhiteboardNodes.findOneAsync(stroke._id));
    });

    it("restores every segment of an ink stroke from one of them", async function () {
      const stroke = Random.id();
      const segments = [Random.id(), Random.id()];
      await upsertNodes(
        member,
        boardId,
        segments.map((_id, i) => ({
          _id,
          type: "ink" as const,
          position: { x: 400 + i * 50, y: 400 },
          width: 50,
          height: 10,
          points: [
            [0, 0, 0.5],
            [50, 10, 0.5],
          ],
          strokeWidth: "medium" as const,
          stroke,
        })),
      );
      await nextWindow();
      await deleteNodes(member, boardId, [segments[0]!]);
      assert.equal(
        await WhiteboardNodes.find({ _id: { $in: segments } }).countAsync(),
        0,
      );
      const version = await newest();

      const restored = await restoreItems(member, boardId, version._id, [
        segments[1]!,
      ]);

      assert.isTrue(restored);
      const back = await WhiteboardNodes.find({
        _id: { $in: segments },
      }).fetchAsync();
      assert.sameMembers(
        back.map((n) => n._id),
        segments,
      );
      assert.isTrue(back.every((n) => n.stroke === stroke));
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
