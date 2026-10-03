import { setTimeout } from "node:timers/promises";
import { Accounts } from "meteor/accounts-base";
import { DDP } from "meteor/ddp";
import { assert } from "chai";
import ChatMessages from "../../../../imports/lib/models/ChatMessages";
import Hunts from "../../../../imports/lib/models/Hunts";
import MeteorUsers from "../../../../imports/lib/models/MeteorUsers";
import Puzzles from "../../../../imports/lib/models/Puzzles";
import { addUserToRole } from "../../../../imports/lib/permission_stubs";
import unlockPuzzle from "../../../../imports/methods/unlockPuzzle";
import updatePuzzle from "../../../../imports/methods/updatePuzzle";
import addPuzzle from "../../../../imports/server/addPuzzle";
import GlobalHooks from "../../../../imports/server/GlobalHooks";
import type Hookset from "../../../../imports/server/hooks/Hookset";
import resetDatabase from "../../../lib/resetDatabase";
import waitForAssertion from "../../../lib/waitForAssertion";

// Hooks run deferred, so a negative check has to give them a moment
const HOOK_GRACE_MS = 100;

describe("locked puzzles", function () {
  this.timeout(30000);

  let huntId: string;
  let operatorId: string;
  let memberId: string;
  const announced: string[] = [];
  const recorder: Hookset = {
    name: "LockedPuzzlesRecorder",
    onPuzzleCreated(puzzleId: string) {
      announced.push(puzzleId);
    },
  };

  const asUser = <T>(userId: string, fn: () => Promise<T>) =>
    DDP._CurrentMethodInvocation.withValue({ userId }, fn);
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

  this.beforeAll(async function () {
    await resetDatabase("locked puzzles");
    operatorId = await Accounts.createUserAsync({
      email: "operator@example.com",
      password: "password",
    });
    memberId = await Accounts.createUserAsync({
      email: "member@example.com",
      password: "password",
    });
    huntId = await asOperator(() =>
      Hunts.insertAsync({
        name: "Locked hunt",
        mailingLists: [],
        openSignups: false,
        hasGuessQueue: true,
        defaultRoles: [],
        allowUnlockablePuzzles: true,
        isArchived: false,
        customLinkEmbed: false,
      }),
    );
    await MeteorUsers.updateAsync(operatorId, {
      $set: { displayName: "Operator", hunts: [huntId] },
    });
    await MeteorUsers.updateAsync(memberId, {
      $set: { displayName: "Member", hunts: [huntId] },
    });
    await addUserToRole(operatorId, huntId, "operator");
    GlobalHooks.addHookSet(recorder);
  });

  this.afterAll(function () {
    GlobalHooks.removeHookSet(recorder);
  });

  this.beforeEach(function () {
    announced.length = 0;
  });

  it("holds the creation hooks until an operator unlocks the puzzle", async function () {
    const puzzleId = await addLockedPuzzle("Locked one");
    const puzzle = await Puzzles.findOneAsync(puzzleId);
    assert.isTrue(puzzle?.locked);
    assert.equal(puzzle?.lockedSummary, "Somewhere on campus");
    await setTimeout(HOOK_GRACE_MS);
    assert.isEmpty(announced, "A locked puzzle isn't announced on creation");

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
    await waitForAssertion(() => assert.deepEqual(announced, [puzzleId]));

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
    await setTimeout(HOOK_GRACE_MS);
    assert.deepEqual(announced, [puzzleId]);
    assert.equal(await ChatMessages.find({ puzzle: puzzleId }).countAsync(), 1);
  });

  it("announces a puzzle unlocked through the edit form too", async function () {
    const puzzleId = await addLockedPuzzle("Locked two");
    await asOperator(() =>
      updatePuzzle.callPromise({
        puzzleId,
        title: "Locked two",
        tags: [],
        expectedAnswerCount: 1,
        locked: false,
      }),
    );
    const puzzle = await Puzzles.findOneAsync(puzzleId);
    assert.notProperty(puzzle ?? {}, "locked");
    assert.notProperty(puzzle ?? {}, "lockedSummary");
    await waitForAssertion(() => assert.deepEqual(announced, [puzzleId]));

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
    await setTimeout(HOOK_GRACE_MS);
    assert.deepEqual(announced, [puzzleId]);
  });

  it("doesn't announce a deleted puzzle unlocked through the edit form", async function () {
    const puzzleId = await addLockedPuzzle("Locked deleted");
    await asOperator(() =>
      Puzzles.updateAsync(puzzleId, { $set: { deleted: true } }),
    );
    await asOperator(() =>
      updatePuzzle.callPromise({
        puzzleId,
        title: "Locked deleted",
        tags: [],
        expectedAnswerCount: 1,
        locked: false,
      }),
    );
    const puzzle = await Puzzles.findOneDeletedAsync(puzzleId);
    assert.isTrue(puzzle?.deleted);
    assert.notProperty(puzzle ?? {}, "locked");
    await setTimeout(HOOK_GRACE_MS);
    assert.isEmpty(announced);
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
    await setTimeout(HOOK_GRACE_MS);
    assert.isEmpty(announced);
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
    await setTimeout(HOOK_GRACE_MS);
    assert.isEmpty(announced);
  });

  it("only allows locked puzzles where the hunt does", async function () {
    await asOperator(() =>
      Hunts.updateAsync(huntId, { $set: { allowUnlockablePuzzles: false } }),
    );
    try {
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
      await waitForAssertion(() => assert.deepEqual(announced, [puzzleId]));
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
      assert.notProperty(
        (await Puzzles.findOneAsync(puzzleId)) ?? {},
        "locked",
      );
    } finally {
      await asOperator(() =>
        Hunts.updateAsync(huntId, { $set: { allowUnlockablePuzzles: true } }),
      );
    }
  });

  it("lets only operators unlock", async function () {
    const puzzleId = await addLockedPuzzle("Locked four");
    await assert.isRejected(
      asUser(memberId, () => unlockPuzzle.callPromise({ puzzleId })),
      /may not unlock/,
    );
    assert.isTrue((await Puzzles.findOneAsync(puzzleId))?.locked);
    await setTimeout(HOOK_GRACE_MS);
    assert.isEmpty(announced);
  });
});
