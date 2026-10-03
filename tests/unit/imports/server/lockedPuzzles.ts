import { Accounts } from "meteor/accounts-base";
import { Meteor } from "meteor/meteor";
import { assert } from "chai";
import sinon from "sinon";
import ChatMessages from "../../../../imports/lib/models/ChatMessages";
import Hunts from "../../../../imports/lib/models/Hunts";
import MeteorUsers from "../../../../imports/lib/models/MeteorUsers";
import PuzzleInterests from "../../../../imports/lib/models/PuzzleInterests";
import Puzzles from "../../../../imports/lib/models/Puzzles";
import { addUserToRole } from "../../../../imports/lib/permission_stubs";
import registerPuzzleInterest from "../../../../imports/methods/registerPuzzleInterest";
import unlockPuzzle from "../../../../imports/methods/unlockPuzzle";
import updatePuzzle from "../../../../imports/methods/updatePuzzle";
import addPuzzle from "../../../../imports/server/addPuzzle";
import GlobalHooks from "../../../../imports/server/GlobalHooks";
import asUser from "../../../lib/asUser";
import createTestHunt from "../../../lib/createTestHunt";
import resetDatabase from "../../../lib/resetDatabase";

describe("locked puzzles", function () {
  this.timeout(30000);

  let huntId: string;
  let operatorId: string;
  let memberId: string;
  // Stands in for the creation hooks, which announce a new puzzle
  let announce: sinon.SinonStub<[puzzleId: string], Promise<void>>;

  const asOperator = <T>(fn: () => Promise<T>) => asUser(operatorId, fn);
  const addLockedPuzzle = (title: string) =>
    asOperator(() =>
      addPuzzle({
        huntId,
        title,
        tags: [],
        expectedAnswerCount: 1,
        docType: "spreadsheet",
        locked: true,
        lockedSummary: " Somewhere on campus ",
      }),
    );
  const unlockThroughForm = (puzzleId: string, title: string) =>
    asOperator(() =>
      updatePuzzle.callPromise({
        puzzleId,
        title,
        tags: [],
        expectedAnswerCount: 1,
        locked: false,
      }),
    );

  beforeEach(async function () {
    await resetDatabase("locked puzzles");
    operatorId = await Accounts.createUserAsync({
      email: "operator@example.com",
      password: "password",
    });
    memberId = await Accounts.createUserAsync({
      email: "member@example.com",
      password: "password",
    });
    huntId = await createTestHunt(operatorId, {
      name: "Locked hunt",
      allowUnlockablePuzzles: true,
    });
    await MeteorUsers.updateAsync(operatorId, {
      $set: { displayName: "Operator", hunts: [huntId] },
    });
    await MeteorUsers.updateAsync(memberId, {
      $set: { displayName: "Member", hunts: [huntId] },
    });
    await addUserToRole(operatorId, huntId, "operator");

    // Deferred work runs on the spot, so whatever a call was going to
    // announce has been announced by the time it returns
    sinon.stub(Meteor, "defer").callsFake((fn) => fn());
    announce = sinon.stub(GlobalHooks, "runPuzzleCreatedHooks").resolves();
  });

  afterEach(function () {
    sinon.restore();
  });

  it("holds the creation hooks until an operator unlocks the puzzle", async function () {
    const puzzleId = await addLockedPuzzle("Locked one");
    const puzzle = await Puzzles.findOneAsync(puzzleId);
    assert.isTrue(puzzle?.locked);
    assert.equal(puzzle?.lockedSummary, "Somewhere on campus");
    sinon.assert.notCalled(announce);

    await asOperator(() =>
      unlockPuzzle.callPromise({
        puzzleId,
        url: " https://example.com/locked-one ",
      }),
    );
    const unlocked = await Puzzles.findOneAsync(puzzleId);
    assert.notProperty(unlocked ?? {}, "locked");
    assert.notProperty(unlocked ?? {}, "lockedSummary");
    assert.equal(unlocked?.url, "https://example.com/locked-one");
    sinon.assert.calledOnceWithExactly(announce, puzzleId);

    const messages = await ChatMessages.find({ puzzle: puzzleId }).fetchAsync();
    assert.lengthOf(messages, 1);
    assert.isTrue(
      messages[0]!.content.children.some(
        (child) =>
          "type" in child &&
          child.type === "mention" &&
          child.userId === operatorId,
      ),
      "The unlock message mentions whoever unlocked the puzzle",
    );

    // Unlocking an unlocked puzzle changes nothing
    await asOperator(() => unlockPuzzle.callPromise({ puzzleId }));
    sinon.assert.calledOnce(announce);
    assert.equal(await ChatMessages.find({ puzzle: puzzleId }).countAsync(), 1);
  });

  it("posts one chat line and announces once when two unlocks race", async function () {
    const puzzleId = await addLockedPuzzle("Locked race");
    await Promise.all([
      asOperator(() => unlockPuzzle.callPromise({ puzzleId })),
      asOperator(() => unlockPuzzle.callPromise({ puzzleId })),
    ]);
    assert.notProperty((await Puzzles.findOneAsync(puzzleId)) ?? {}, "locked");
    sinon.assert.calledOnceWithExactly(announce, puzzleId);
    assert.equal(await ChatMessages.find({ puzzle: puzzleId }).countAsync(), 1);
  });

  it("announces once when the edit form and an unlock race", async function () {
    const puzzleId = await addLockedPuzzle("Locked form race");
    await Promise.all([
      unlockThroughForm(puzzleId, "Locked form race"),
      asOperator(() => unlockPuzzle.callPromise({ puzzleId })),
    ]);
    assert.notProperty((await Puzzles.findOneAsync(puzzleId)) ?? {}, "locked");
    sinon.assert.calledOnceWithExactly(announce, puzzleId);
    // Only the unlock method posts a chat line, and only if it got there
    // first
    assert.isAtMost(
      await ChatMessages.find({ puzzle: puzzleId }).countAsync(),
      1,
    );
  });

  it("announces a puzzle unlocked through the edit form too", async function () {
    const puzzleId = await addLockedPuzzle("Locked two");
    await unlockThroughForm(puzzleId, "Locked two");
    const puzzle = await Puzzles.findOneAsync(puzzleId);
    assert.notProperty(puzzle ?? {}, "locked");
    assert.notProperty(puzzle ?? {}, "lockedSummary");
    sinon.assert.calledOnceWithExactly(announce, puzzleId);

    // Editing it again doesn't announce it again
    await asOperator(() =>
      updatePuzzle.callPromise({
        puzzleId,
        title: "Locked two",
        tags: [],
        expectedAnswerCount: 2,
        locked: false,
      }),
    );
    sinon.assert.calledOnce(announce);
  });

  it("doesn't announce a deleted puzzle unlocked through the edit form", async function () {
    const puzzleId = await addLockedPuzzle("Locked deleted");
    await asOperator(() =>
      Puzzles.updateAsync(puzzleId, { $set: { deleted: true } }),
    );
    await unlockThroughForm(puzzleId, "Locked deleted");
    const puzzle = await Puzzles.findOneDeletedAsync(puzzleId);
    assert.isTrue(puzzle?.deleted);
    assert.notProperty(puzzle ?? {}, "locked");
    sinon.assert.notCalled(announce);
  });

  it("rejects a malformed URL on unlock", async function () {
    const puzzleId = await addLockedPuzzle("Locked bad url");
    await assert.isRejected(
      asOperator(() =>
        unlockPuzzle.callPromise({ puzzleId, url: "puzzles.example.com/bad" }),
      ),
      /valid URL/,
    );
    const puzzle = await Puzzles.findOneAsync(puzzleId);
    assert.isTrue(puzzle?.locked);
    assert.notProperty(puzzle ?? {}, "url");
    assert.equal(await ChatMessages.find({ puzzle: puzzleId }).countAsync(), 0);
    sinon.assert.notCalled(announce);
  });

  it("leaves the lock alone when an edit doesn't mention it", async function () {
    const puzzleId = await addLockedPuzzle("Locked three");
    await asOperator(() =>
      updatePuzzle.callPromise({
        puzzleId,
        title: "Locked three",
        tags: [],
        expectedAnswerCount: 3,
      }),
    );
    const puzzle = await Puzzles.findOneAsync(puzzleId);
    assert.isTrue(puzzle?.locked);
    assert.equal(puzzle?.lockedSummary, "Somewhere on campus");
    assert.equal(puzzle?.expectedAnswerCount, 3);

    // Relocking with a blank summary clears the old one
    await asOperator(() =>
      updatePuzzle.callPromise({
        puzzleId,
        title: "Locked three",
        tags: [],
        expectedAnswerCount: 3,
        locked: true,
        lockedSummary: "  ",
      }),
    );
    const relocked = await Puzzles.findOneAsync(puzzleId);
    assert.isTrue(relocked?.locked);
    assert.notProperty(relocked ?? {}, "lockedSummary");
    sinon.assert.notCalled(announce);
  });

  it("only allows locked puzzles where the hunt does", async function () {
    await asOperator(() =>
      Hunts.updateAsync(huntId, { $set: { allowUnlockablePuzzles: false } }),
    );
    await assert.isRejected(
      addLockedPuzzle("Not allowed"),
      /does not allow locked/,
    );
    const puzzleId = await asOperator(() =>
      addPuzzle({
        huntId,
        title: "Plain",
        tags: [],
        expectedAnswerCount: 1,
        docType: "spreadsheet",
      }),
    );
    sinon.assert.calledOnceWithExactly(announce, puzzleId);
    await assert.isRejected(
      asOperator(() =>
        updatePuzzle.callPromise({
          puzzleId,
          title: "Plain",
          tags: [],
          expectedAnswerCount: 1,
          locked: true,
        }),
      ),
      /does not allow locked/,
    );
    assert.notProperty((await Puzzles.findOneAsync(puzzleId)) ?? {}, "locked");
  });

  it("lets only operators unlock", async function () {
    const puzzleId = await addLockedPuzzle("Locked four");
    await assert.isRejected(
      asUser(memberId, () => unlockPuzzle.callPromise({ puzzleId })),
      /may not unlock/,
    );
    assert.isTrue((await Puzzles.findOneAsync(puzzleId))?.locked);
    sinon.assert.notCalled(announce);
  });

  it("keeps one interest row when a member's first two votes land at once", async function () {
    const puzzleId = await addLockedPuzzle("Locked votes");
    await Promise.all([
      asUser(memberId, () =>
        registerPuzzleInterest.callPromise({ puzzleId, score: 1 }),
      ),
      asUser(memberId, () =>
        registerPuzzleInterest.callPromise({ puzzleId, score: 1 }),
      ),
    ]);
    assert.lengthOf(
      await PuzzleInterests.find({ puzzle: puzzleId }).fetchAsync(),
      1,
    );
  });
});
