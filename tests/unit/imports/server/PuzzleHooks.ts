import { setTimeout } from "node:timers/promises";
import { Accounts } from "meteor/accounts-base";
import { DDP } from "meteor/ddp";
import { Random } from "meteor/random";
import { assert } from "chai";
import Hunts from "../../../../imports/lib/models/Hunts";
import MeteorUsers from "../../../../imports/lib/models/MeteorUsers";
import PuzzleNotifications from "../../../../imports/lib/models/PuzzleNotifications";
import Puzzles from "../../../../imports/lib/models/Puzzles";
import { addUserToRole } from "../../../../imports/lib/permission_stubs";
import unlockPuzzle from "../../../../imports/methods/unlockPuzzle";
import addPuzzle from "../../../../imports/server/addPuzzle";
import PuzzleHooks from "../../../../imports/server/hooks/PuzzleHooks";
import resetDatabase from "../../../lib/resetDatabase";

// Hooks run deferred, so a negative check has to give them a moment
const HOOK_GRACE_MS = 100;

describe("PuzzleHooks", function () {
  this.timeout(30000);

  let huntId: string;
  let operatorId: string;
  let memberId: string;
  let outsiderId: string;

  const asUser = <T>(userId: string, fn: () => Promise<T>) =>
    DDP._CurrentMethodInvocation.withValue({ userId }, fn);
  const asOperator = <T>(fn: () => Promise<T>) => asUser(operatorId, fn);

  this.beforeAll(async function () {
    await resetDatabase("PuzzleHooks");
    const newUser = async (email: string) => {
      const userId = await Accounts.createUserAsync({
        email,
        password: "password",
      });
      await MeteorUsers.updateAsync(userId, { $set: { displayName: email } });
      return userId;
    };
    operatorId = await newUser("operator@example.com");
    memberId = await newUser("member@example.com");
    outsiderId = await newUser("outsider@example.com");
    huntId = await asOperator(() =>
      Hunts.insertAsync({
        name: "Notified hunt",
        mailingLists: [],
        openSignups: false,
        hasGuessQueue: true,
        defaultRoles: [],
        allowUnlockablePuzzles: true,
        isArchived: false,
        customLinkEmbed: false,
      }),
    );
    for (const userId of [operatorId, memberId]) {
      await MeteorUsers.updateAsync(userId, { $set: { hunts: [huntId] } });
    }
    await MeteorUsers.updateAsync(outsiderId, {
      $set: { hunts: [Random.id()] },
    });
    await addUserToRole(operatorId, huntId, "operator");
  });

  this.beforeEach(async function () {
    await PuzzleNotifications.removeAsync({});
  });

  it("tells every member of the hunt about the new puzzle", async function () {
    const puzzleId = await asOperator(() =>
      Puzzles.insertAsync({
        hunt: huntId,
        title: "Fresh",
        tags: [],
        answers: [],
        expectedAnswerCount: 1,
      }),
    );

    await asOperator(async () => {
      await PuzzleHooks.onPuzzleCreated!(puzzleId);
    });

    const notifications = await PuzzleNotifications.find({}).fetchAsync();
    assert.sameMembers(
      notifications.map((n) => n.user),
      [operatorId, memberId],
      "Every member gets exactly one, members of other hunts get none",
    );
    for (const notification of notifications) {
      assert.equal(notification.hunt, huntId);
      assert.equal(notification.puzzle, puzzleId);
      assert.isTrue(notification.ephemeral);
      assert.equal(notification.background, "info");
      assert.equal(notification.content, "New puzzle added!");
      assert.equal(notification.createdBy, operatorId);
      assert.isFalse(notification.deleted);
    }
  });

  it("does nothing for a puzzle that doesn't exist", async function () {
    await asOperator(async () => {
      await PuzzleHooks.onPuzzleCreated!(Random.id());
    });
    assert.equal(await PuzzleNotifications.find({}).countAsync(), 0);
  });

  it("waits for a locked puzzle to be unlocked", async function () {
    const puzzleId = await asOperator(() =>
      addPuzzle({
        huntId,
        title: "Locked",
        tags: [],
        expectedAnswerCount: 1,
        docType: "spreadsheet",
        locked: true,
        lockedSummary: "Somewhere",
      }),
    );
    await setTimeout(HOOK_GRACE_MS);
    assert.equal(
      await PuzzleNotifications.find({}).countAsync(),
      0,
      "A locked puzzle isn't announced on creation",
    );

    await asOperator(() =>
      unlockPuzzle.callPromise({
        puzzleId,
        url: "https://example.com/locked",
      }),
    );
    const notified = async () =>
      (await PuzzleNotifications.find({ puzzle: puzzleId }).fetchAsync()).map(
        (n) => n.user,
      );
    const deadline = Date.now() + 1500;
    while (Date.now() < deadline && (await notified()).length < 2) {
      await setTimeout(20);
    }
    assert.sameMembers(await notified(), [operatorId, memberId]);
  });
});
