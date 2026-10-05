import { Accounts } from "meteor/accounts-base";
import { Random } from "meteor/random";
import { assert } from "chai";
import FixtureHunt from "../../../../imports/FixtureHunt";
import mergeUsersJob from "../../../../imports/lib/jobs/mergeUsers";
import Hunts from "../../../../imports/lib/models/Hunts";
import MeteorUsers from "../../../../imports/lib/models/MeteorUsers";
import Puzzles from "../../../../imports/lib/models/Puzzles";
import WhiteboardEdges from "../../../../imports/lib/models/WhiteboardEdges";
import WhiteboardNodes from "../../../../imports/lib/models/WhiteboardNodes";
import WhiteboardVersions from "../../../../imports/lib/models/WhiteboardVersions";
import { VERSION_INTERVAL_MS } from "../../../../imports/lib/whiteboard/limits";
import placeWhiteboardCardsByTags from "../../../../imports/methods/placeWhiteboardCardsByTags";
import setWhiteboardEditPolicy from "../../../../imports/methods/setWhiteboardEditPolicy";
import setWhiteboardLayoutLocked from "../../../../imports/methods/setWhiteboardLayoutLocked";
import upsertWhiteboardNodes from "../../../../imports/methods/upsertWhiteboardNodes";
import makeFixtureHunt from "../../../../imports/server/makeFixtureHunt";
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
  restoreItems,
  restoreVersion,
} from "../../../../imports/server/whiteboardVersions";
import asUser from "../../../lib/asUser";
import resetDatabase from "../../../lib/resetDatabase";
import runJob from "../../../lib/runJob";

const huntId = FixtureHunt._id;
const anger = FixtureHunt.tags.find((t) => t.name === "group:anger")!;
const joy = FixtureHunt.tags.find((t) => t.name === "group:joy")!;

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

describe("whiteboard locks", function () {
  this.timeout(30000);

  let operator: string;
  let member: string;
  let other: string;
  let boardId: string;

  beforeEach(async function () {
    await resetDatabase("whiteboard locks");
    operator = await makeUser("operator@example.com", ["operator"]);
    member = await makeUser("member@example.com", []);
    other = await makeUser("other@example.com", []);
    await makeFixtureHunt(operator);
    boardId = await ensureWhiteboard(operator, huntId);
  });

  const sticky = async (position: { x: number; y: number }) => {
    const _id = Random.id();
    await upsertNodes(member, boardId, [
      {
        _id,
        type: "sticky",
        position,
        width: 160,
        height: 120,
        text: "note",
        color: "yellow",
      },
    ]);
    return _id;
  };
  const userFrame = async () => {
    const _id = Random.id();
    await upsertNodes(member, boardId, [
      {
        _id,
        type: "frame",
        position: { x: 8000, y: 8000 },
        width: 400,
        height: 300,
        label: "Mine",
      },
    ]);
    return _id;
  };
  // Through the method, so its argument check takes locked
  const setLocked = (userId: string, _id: string, locked: boolean) =>
    asUser(userId, () =>
      upsertWhiteboardNodes.callPromise({
        boardId,
        nodes: [{ _id, locked }],
      }),
    );
  const node = async (id: string) => (await WhiteboardNodes.findOneAsync(id))!;
  const frameFor = async (tagId: string) =>
    (await WhiteboardNodes.findOneAsync({ board: boardId, tag: tagId }))!;
  const cardFor = async (puzzleId: string) =>
    (await WhiteboardNodes.findOneAsync({
      board: boardId,
      puzzle: puzzleId,
    }))!;
  const versionCount = () =>
    WhiteboardVersions.find({ board: boardId }).countAsync();
  // Moves every version, and everyone's window on it, back in time, so the
  // next edit starts a new one.
  const nextWindow = async () => {
    const ms = VERSION_INTERVAL_MS + 60 * 1000;
    for (const version of await WhiteboardVersions.find({
      board: boardId,
    }).fetchAsync()) {
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
  const newestVersion = async () =>
    (await WhiteboardVersions.findOneAsync(
      { board: boardId },
      { sort: { createdAt: -1 } },
    ))!;

  it("locks a node for the caller without making it manual or naming them", async function () {
    const frame = await frameFor(anger._id);
    await setLocked(member, frame._id, true);
    const locked = await node(frame._id);
    assert.isTrue(locked.locked);
    assert.equal(locked.lockedBy, member);
    assert.notOk(locked.manual);
    assert.deepEqual(locked.contributors, frame.contributors);

    await setLocked(member, frame._id, false);
    const unlocked = await node(frame._id);
    assert.notProperty(unlocked, "locked");
    assert.notProperty(unlocked, "lockedBy");
  });

  it("stops another member moving, resizing, retitling, recolouring, hiding and deleting it", async function () {
    const note = await sticky({ x: 5000, y: 5000 });
    const frame = await userFrame();
    await setLocked(member, note, true);
    await setLocked(member, frame, true);
    const before = await node(note);
    const frameBefore = await node(frame);

    const refusals = [
      { _id: note, position: { x: 1, y: 1 } },
      { _id: note, parent: frame },
      { _id: note, width: 300 },
      { _id: note, height: 300 },
      { _id: note, text: "changed" },
      { _id: note, color: "blue" as const },
      { _id: note, hidden: false },
      { _id: frame, label: "Renamed" },
    ];
    for (const input of refusals) {
      await assert.isRejected(
        upsertNodes(other, boardId, [input]),
        /That's locked/,
      );
    }
    await assert.isRejected(
      deleteNodes(other, boardId, [note]),
      /That's locked/,
    );
    // The locker is held to it too, until they unlock it
    await assert.isRejected(
      upsertNodes(member, boardId, [{ _id: note, position: { x: 1, y: 1 } }]),
      /That's locked/,
    );

    assert.deepEqual(await node(note), before);
    assert.deepEqual(await node(frame), frameBefore);
  });

  it("refuses a batch that touches a locked node before writing any of it", async function () {
    const free = await sticky({ x: 0, y: 0 });
    const held = await sticky({ x: 500, y: 0 });
    const segments = [Random.id(), Random.id()];
    const stroke = Random.id();
    await upsertNodes(
      member,
      boardId,
      segments.map((_id, i) => ({
        _id,
        type: "ink" as const,
        position: { x: i * 100, y: 900 },
        points: [[0, 0, 0.5] as [number, number, number]],
        strokeWidth: "medium" as const,
        stroke,
      })),
    );
    await setLocked(member, held, true);
    await setLocked(member, segments[1]!, true);
    await WhiteboardVersions.removeAsync({ board: boardId });

    await assert.isRejected(
      upsertNodes(other, boardId, [
        { _id: free, position: { x: 10, y: 10 } },
        { _id: held, position: { x: 510, y: 10 } },
      ]),
      /That's locked/,
    );
    await assert.isRejected(
      deleteNodes(other, boardId, [free, held]),
      /That's locked/,
    );
    // Deleting one segment takes the stroke, so a locked segment keeps it
    await assert.isRejected(
      deleteNodes(other, boardId, [segments[0]!]),
      /That's locked/,
    );

    assert.deepEqual((await node(free)).position, { x: 0, y: 0 });
    assert.ok(await WhiteboardNodes.findOneAsync(segments[0]));
    assert.equal(await versionCount(), 0);
  });

  it("refuses moving a line's end off a locked node, but not restyling it or drawing to it", async function () {
    const a = await sticky({ x: 0, y: 0 });
    const b = await sticky({ x: 400, y: 0 });
    const c = await sticky({ x: 800, y: 0 });
    const line = Random.id();
    await upsertEdges(member, boardId, [{ _id: line, source: a, target: b }]);
    await setLocked(member, a, true);

    await assert.isRejected(
      upsertEdges(other, boardId, [{ _id: line, source: c }]),
      /That's locked/,
    );
    // The whole batch goes, restyle and all
    await assert.isRejected(
      upsertEdges(other, boardId, [
        { _id: line, color: "red" },
        { _id: line, source: c },
      ]),
      /That's locked/,
    );
    const unchanged = (await WhiteboardEdges.findOneAsync(line))!;
    assert.equal(unchanged.source, a);
    assert.isUndefined(unchanged.color);

    await upsertEdges(other, boardId, [{ _id: line, color: "red" }]);
    // The end on the unlocked node can still move
    await upsertEdges(other, boardId, [{ _id: line, target: c }]);
    const toLocked = Random.id();
    await upsertEdges(other, boardId, [
      { _id: toLocked, source: b, target: a },
    ]);
    const moved = (await WhiteboardEdges.findOneAsync(line))!;
    assert.equal(moved.color, "red");
    assert.equal(moved.target, c);
    assert.ok(await WhiteboardEdges.findOneAsync(toLocked));
  });

  it("lets the locker and an operator unlock, and nobody else", async function () {
    const note = await sticky({ x: 5000, y: 5000 });
    await setLocked(member, note, true);

    await assert.isRejected(
      setLocked(other, note, false),
      /Only the person who locked this, or an operator, can unlock it/,
    );
    // Locking it again doesn't take it over
    await setLocked(other, note, true);
    assert.equal((await node(note)).lockedBy, member);

    await setLocked(member, note, false);
    assert.notOk((await node(note)).locked);

    await setLocked(member, note, true);
    await setLocked(operator, note, false);
    assert.notOk((await node(note)).locked);
  });

  it("won't lock a line's free end or something new", async function () {
    const point = Random.id();
    await upsertNodes(member, boardId, [
      { _id: point, type: "point", position: { x: 0, y: 0 } },
    ]);
    await assert.isRejected(
      setLocked(member, point, true),
      /That can't be locked/,
    );
    await assert.isRejected(
      upsertNodes(member, boardId, [
        {
          _id: Random.id(),
          type: "sticky",
          position: { x: 0, y: 0 },
          locked: true,
        },
      ]),
      /That can't be locked/,
    );
  });

  it("still lets a locked frame be folded", async function () {
    const frame = await frameFor(anger._id);
    await setLocked(member, frame._id, true);
    await upsertNodes(other, boardId, [{ _id: frame._id, collapsed: true }]);
    assert.isTrue((await node(frame._id)).collapsed);
  });

  it("lets a frame be resized from its left edge around a locked node that stays put", async function () {
    const frame = await userFrame();
    const note = Random.id();
    await upsertNodes(member, boardId, [
      {
        _id: note,
        type: "sticky",
        parent: frame,
        position: { x: 100, y: 100 },
        width: 160,
        height: 120,
      },
    ]);
    await setLocked(member, note, true);

    // The frame's origin moves 50 left, so the note moves 50 right in it
    await upsertNodes(other, boardId, [
      { _id: frame, position: { x: 7950, y: 8000 }, width: 450 },
      { _id: note, position: { x: 150, y: 100 } },
    ]);
    const resized = await node(frame);
    const kept = await node(note);
    assert.equal(resized.width, 450);
    assert.equal(resized.position.x + kept.position.x, 8100);
    assert.equal(resized.position.y + kept.position.y, 8100);
    assert.isTrue(kept.locked);

    // A move that would shift it on the board is still refused
    await assert.isRejected(
      upsertNodes(other, boardId, [
        { _id: frame, position: { x: 7900, y: 8000 }, width: 500 },
        { _id: note, position: { x: 150, y: 100 } },
      ]),
      /That's locked/,
    );
    // So is the note's position without its frame's
    await assert.isRejected(
      upsertNodes(other, boardId, [
        { _id: note, position: { x: 200, y: 100 } },
      ]),
      /That's locked/,
    );
    assert.deepEqual((await node(frame)).position, { x: 7950, y: 8000 });

    // Listing the frame twice to net a move of the note in it is too
    await assert.isRejected(
      upsertNodes(other, boardId, [
        { _id: frame, position: { x: 8000, y: 8000 }, width: 400 },
        { _id: note, position: { x: 100, y: 100 } },
        { _id: frame, position: { x: 7950, y: 8000 } },
      ]),
      /That's locked/,
    );
    // as is moving the frame, without resizing it, to cover a move of the
    // note
    await assert.isRejected(
      upsertNodes(other, boardId, [
        { _id: frame, position: { x: 8000, y: 8000 } },
        { _id: note, position: { x: 100, y: 100 } },
      ]),
      /That's locked/,
    );
    // and so is moving it while resizing it, which a resize from one edge
    // never does: otherwise moving the frame back afterwards would leave
    // the note shifted in it
    await assert.isRejected(
      upsertNodes(other, boardId, [
        { _id: frame, position: { x: 8000, y: 8000 }, width: 500 },
        { _id: note, position: { x: 100, y: 100 } },
      ]),
      /That's locked/,
    );
    await assert.isRejected(
      upsertNodes(other, boardId, [
        { _id: frame, position: { x: 7950, y: 8050 }, height: 400 },
        { _id: note, position: { x: 150, y: 50 } },
      ]),
      /That's locked/,
    );
    assert.deepEqual((await node(note)).position, { x: 150, y: 100 });
  });

  it("won't let someone who can't edit the board lock", async function () {
    const note = await sticky({ x: 5000, y: 5000 });
    await asUser(operator, () =>
      setWhiteboardEditPolicy.callPromise({
        boardId,
        editPolicy: "operators",
        editors: [],
      }),
    );
    await assert.isRejected(setLocked(member, note, true), /Only operators/);
    assert.notOk((await node(note)).locked);
  });

  it("records no version for locking and unlocking", async function () {
    const note = await sticky({ x: 5000, y: 5000 });
    await WhiteboardVersions.removeAsync({ board: boardId });
    await setLocked(member, note, true);
    await setLocked(member, note, false);
    const frame = await frameFor(anger._id);
    await upsertNodes(member, boardId, [
      { _id: frame._id, locked: true, collapsed: true },
    ]);
    await asUser(operator, () =>
      setWhiteboardLayoutLocked.callPromise({ boardId, locked: true }),
    );
    assert.equal(await versionCount(), 0);
  });

  it("still places new cards into a locked frame and grows it", async function () {
    const frame = await frameFor(anger._id);
    await setLocked(member, frame._id, true);
    const ids = [];
    // More than a row's worth, so the frame needs another row
    for (const title of ["L1", "L2", "L3", "L4", "L5"]) {
      ids.push(
        await Puzzles.insertAsync({
          hunt: huntId,
          title,
          tags: [anger._id],
          answers: [],
          expectedAnswerCount: 1,
          createdBy: operator,
        }),
      );
    }
    await syncPuzzlesOnBoard(huntId, ids);
    for (const id of ids) {
      assert.equal((await cardFor(id)).parent, frame._id);
    }
    const grown = await node(frame._id);
    assert.isTrue(grown.locked);
    assert.isAbove(grown.height!, frame.height!);
  });

  it("refuses Place by tags on a locked card", async function () {
    const card = (await WhiteboardNodes.findOneAsync({
      board: boardId,
      type: "puzzle",
      parent: (await frameFor(anger._id))._id,
    }))!;
    await upsertNodes(member, boardId, [
      { _id: card._id, position: { x: 900, y: 900 } },
    ]);
    await setLocked(member, card._id, true);
    await assert.isRejected(
      asUser(other, () =>
        placeWhiteboardCardsByTags.callPromise({
          boardId,
          nodeIds: [card._id],
        }),
      ),
      /That's locked/,
    );
    assert.isTrue((await node(card._id)).manual);
  });

  it("still resets a locked card into its round", async function () {
    const angerFrame = await frameFor(anger._id);
    const card = (await WhiteboardNodes.findOneAsync({
      board: boardId,
      type: "puzzle",
      parent: angerFrame._id,
    }))!;
    await upsertNodes(member, boardId, [
      {
        _id: card._id,
        parent: (await frameFor(joy._id))._id,
        position: { x: 900, y: 900 },
      },
    ]);
    await setLocked(member, card._id, true);

    await resetLayout(member, boardId, false);

    const reset = await node(card._id);
    assert.equal(reset.parent, angerFrame._id);
    assert.notOk(reset.manual);
    assert.isTrue(reset.locked);
  });

  it("restores locked nodes, and for an operator the locks a version has", async function () {
    const note = await sticky({ x: 100, y: 100 });
    await nextWindow();
    await sticky({ x: 9000, y: 9000 });
    const unlockedVersion = await newestVersion();

    await upsertNodes(member, boardId, [
      { _id: note, position: { x: 700, y: 700 } },
    ]);
    await setLocked(member, note, true);
    await nextWindow();
    await sticky({ x: 9500, y: 9000 });
    const lockedVersion = await newestVersion();
    assert.notEqual(lockedVersion._id, unlockedVersion._id);

    await restoreVersion(operator, boardId, unlockedVersion._id);
    const restored = await node(note);
    assert.deepEqual(restored.position, { x: 100, y: 100 });
    assert.notProperty(restored, "locked");
    assert.notProperty(restored, "lockedBy");

    await restoreVersion(operator, boardId, lockedVersion._id);
    const relocked = await node(note);
    assert.deepEqual(relocked.position, { x: 700, y: 700 });
    assert.isTrue(relocked.locked);
    assert.equal(relocked.lockedBy, member);
  });

  it("keeps the board's locks when someone who isn't an operator restores", async function () {
    const kept = await sticky({ x: 100, y: 100 });
    const unlocked = await sticky({ x: 200, y: 100 });
    const removed = await sticky({ x: 300, y: 100 });
    await setLocked(member, unlocked, true);
    await setLocked(member, removed, true);
    await nextWindow();
    await sticky({ x: 9000, y: 9000 });
    const version = await newestVersion();

    await upsertNodes(member, boardId, [
      { _id: kept, position: { x: 700, y: 700 } },
    ]);
    await setLocked(member, kept, true);
    await setLocked(member, unlocked, false);
    await setLocked(member, removed, false);
    await deleteNodes(member, boardId, [removed]);

    await restoreVersion(other, boardId, version._id);

    // Laid out as the version has it, locked as the board had it
    const keptNow = await node(kept);
    assert.deepEqual(keptNow.position, { x: 100, y: 100 });
    assert.isTrue(keptNow.locked);
    assert.equal(keptNow.lockedBy, member);
    const unlockedNow = await node(unlocked);
    assert.notProperty(unlockedNow, "locked");
    assert.notProperty(unlockedNow, "lockedBy");
    // Put back, but not locked
    const removedNow = await node(removed);
    assert.deepEqual(removedNow.position, { x: 300, y: 100 });
    assert.notProperty(removedNow, "locked");
    assert.notProperty(removedNow, "lockedBy");
  });

  it("won't restore one item over a locked node, even for its locker", async function () {
    const note = await sticky({ x: 100, y: 100 });
    await nextWindow();
    await sticky({ x: 9000, y: 9000 });
    const version = await newestVersion();

    await upsertNodes(member, boardId, [
      { _id: note, position: { x: 700, y: 700 } },
    ]);
    await setLocked(member, note, true);
    const versions = await versionCount();

    for (const userId of [other, member, operator]) {
      await assert.isRejected(
        restoreItems(userId, boardId, version._id, [note]),
        /That's locked/,
      );
    }
    const held = await node(note);
    assert.deepEqual(held.position, { x: 700, y: 700 });
    assert.isTrue(held.locked);
    assert.equal(await versionCount(), versions);

    await setLocked(member, note, false);
    assert.isTrue(await restoreItems(other, boardId, version._id, [note]));
    assert.deepEqual((await node(note)).position, { x: 100, y: 100 });
  });

  it("keeps the board's locks when someone who isn't an operator restores one item", async function () {
    const moved = await sticky({ x: 100, y: 100 });
    const removed = await sticky({ x: 300, y: 100 });
    await setLocked(member, moved, true);
    await setLocked(member, removed, true);
    await nextWindow();
    await sticky({ x: 9000, y: 9000 });
    const version = await newestVersion();

    await setLocked(member, moved, false);
    await upsertNodes(member, boardId, [
      { _id: moved, position: { x: 700, y: 700 } },
    ]);
    await setLocked(member, removed, false);
    await deleteNodes(member, boardId, [removed]);

    assert.isTrue(
      await restoreItems(other, boardId, version._id, [moved, removed]),
    );
    // Where the version had it, unlocked as the board had it
    const movedNow = await node(moved);
    assert.deepEqual(movedNow.position, { x: 100, y: 100 });
    assert.notProperty(movedNow, "locked");
    assert.notProperty(movedNow, "lockedBy");
    // Put back, but not locked
    const removedNow = await node(removed);
    assert.deepEqual(removedNow.position, { x: 300, y: 100 });
    assert.notProperty(removedNow, "locked");
    assert.notProperty(removedNow, "lockedBy");

    // An operator puts back the version's lock
    await upsertNodes(member, boardId, [
      { _id: moved, position: { x: 700, y: 700 } },
    ]);
    assert.isTrue(await restoreItems(operator, boardId, version._id, [moved]));
    const relocked = await node(moved);
    assert.deepEqual(relocked.position, { x: 100, y: 100 });
    assert.isTrue(relocked.locked);
    assert.equal(relocked.lockedBy, member);
  });

  describe("setLayoutLocked", function () {
    const frames = () =>
      WhiteboardNodes.find({ board: boardId, type: "frame" }).fetchAsync();
    const setLayout = (userId: string, locked: boolean) =>
      asUser(userId, () =>
        setWhiteboardLayoutLocked.callPromise({ boardId, locked }),
      );

    it("locks and unlocks every frame for an operator", async function () {
      const mine = await userFrame();
      const note = await sticky({ x: 5000, y: 5000 });
      const joyFrame = (await frameFor(joy._id))._id;
      await setLocked(member, joyFrame, true);

      await setLayout(operator, true);
      const locked = await frames();
      assert.isAbove(locked.length, 2);
      assert.include(
        locked.map((f) => f._id),
        mine,
      );
      locked.forEach((f) => {
        assert.isTrue(f.locked);
        // A frame already locked keeps its locker
        assert.equal(f.lockedBy, f._id === joyFrame ? member : operator);
      });
      assert.notOk((await node(note)).locked);
      await assert.isRejected(
        upsertNodes(member, boardId, [{ _id: mine, position: { x: 0, y: 0 } }]),
        /That's locked/,
      );

      await setLayout(operator, false);
      (await frames()).forEach((f) => {
        assert.notProperty(f, "locked");
        assert.notProperty(f, "lockedBy");
      });
      await upsertNodes(member, boardId, [
        { _id: mine, position: { x: 0, y: 0 } },
      ]);
    });

    it("leaves a frame taken off the board unlocked, so it can be put back", async function () {
      const angerFrame = (await frameFor(anger._id))._id;
      await deleteNodes(member, boardId, [angerFrame]);
      assert.isTrue((await node(angerFrame)).hidden);

      await setLayout(operator, true);
      assert.notOk((await node(angerFrame)).locked);
      await upsertNodes(member, boardId, [
        {
          _id: angerFrame,
          hidden: false,
          parent: null,
          position: { x: 0, y: 0 },
        },
      ]);
      assert.notOk((await node(angerFrame)).hidden);
    });

    it("is refused for a plain member, a non-member and on an archived hunt", async function () {
      await assert.isRejected(
        setLayout(member, true),
        /Only operators can lock or unlock the layout/,
      );
      const outsider = await makeUser("outsider@example.com");
      await assert.isRejected(setLayout(outsider, true), /not a member/);
      await Hunts.updateAsync(huntId, { $set: { isArchived: true } });
      await assert.isRejected(setLayout(operator, true), /archived/);
      await Hunts.updateAsync(huntId, { $set: { isArchived: false } });
      (await frames()).forEach((f) => assert.notOk(f.locked));
    });
  });

  it("moves a lock to the merged account", async function () {
    const source = await makeUser("source@example.com", []);
    const target = await makeUser("target@example.com", []);
    const note = await sticky({ x: 5000, y: 5000 });
    await setLocked(source, note, true);

    await runJob(
      mergeUsersJob,
      { sourceUser: source, targetUser: target },
      { userId: target },
    );

    assert.equal((await node(note)).lockedBy, target);
  });
});
