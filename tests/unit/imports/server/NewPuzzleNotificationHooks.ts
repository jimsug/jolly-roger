import { Accounts } from "meteor/accounts-base";
import { Meteor } from "meteor/meteor";
import { Random } from "meteor/random";
import { assert } from "chai";
import sinon from "sinon";
import FeatureFlags from "../../../../imports/lib/models/FeatureFlags";
import MeteorUsers from "../../../../imports/lib/models/MeteorUsers";
import PuzzleNotifications from "../../../../imports/lib/models/PuzzleNotifications";
import Puzzles from "../../../../imports/lib/models/Puzzles";
import { addUserToRole } from "../../../../imports/lib/permission_stubs";
import unlockPuzzle from "../../../../imports/methods/unlockPuzzle";
import addPuzzle from "../../../../imports/server/addPuzzle";
import GlobalHooks from "../../../../imports/server/GlobalHooks";
import NewPuzzleNotificationHooks from "../../../../imports/server/hooks/NewPuzzleNotificationHooks";
import asUser from "../../../lib/asUser";
import createTestHunt from "../../../lib/createTestHunt";
import resetDatabase from "../../../lib/resetDatabase";
import waitForAssertion from "../../../lib/waitForAssertion";

describe("NewPuzzleNotificationHooks", function () {
  this.timeout(30000);

  let huntId: string;
  let operatorId: string;
  let memberId: string;
  let outsiderId: string;

  const asOperator = <T>(fn: () => Promise<T>) => asUser(operatorId, fn);

  this.beforeAll(async function () {
    await resetDatabase("NewPuzzleNotificationHooks");
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
    huntId = await createTestHunt(operatorId, {
      name: "Notified hunt",
      allowUnlockablePuzzles: true,
    });
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
    await FeatureFlags.removeAsync({});
  });

  this.afterEach(function () {
    sinon.restore();
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
      await NewPuzzleNotificationHooks.onPuzzleCreated!(puzzleId);
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

  it("does nothing while new puzzle notifications are disabled", async function () {
    const puzzleId = await asOperator(async () => {
      await FeatureFlags.insertAsync({
        name: "disable.new_puzzle_notifications",
        type: "on",
      });
      return Puzzles.insertAsync({
        hunt: huntId,
        title: "Unannounced",
        tags: [],
        answers: [],
        expectedAnswerCount: 1,
      });
    });

    await asOperator(async () => {
      await NewPuzzleNotificationHooks.onPuzzleCreated!(puzzleId);
    });

    assert.equal(await PuzzleNotifications.find({}).countAsync(), 0);
  });

  it("does nothing for a puzzle that doesn't exist", async function () {
    await asOperator(async () => {
      await NewPuzzleNotificationHooks.onPuzzleCreated!(Random.id());
    });
    assert.equal(await PuzzleNotifications.find({}).countAsync(), 0);
  });

  it("waits for a locked puzzle to be unlocked", async function () {
    const runPuzzleCreatedHooks = sinon.spy(
      GlobalHooks,
      "runPuzzleCreatedHooks",
    );
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
    // Creation hooks are deferred, and defers run in order, so anything
    // addPuzzle deferred has started once a later defer runs
    await new Promise<void>((resolve) => {
      Meteor.defer(resolve);
    });
    assert.isFalse(
      runPuzzleCreatedHooks.calledWith(puzzleId),
      "A locked puzzle isn't announced on creation",
    );

    await asOperator(() =>
      unlockPuzzle.callPromise({
        puzzleId,
        url: "https://example.com/locked",
      }),
    );
    await waitForAssertion(async () => {
      assert.isTrue(runPuzzleCreatedHooks.calledWith(puzzleId));
      assert.sameMembers(
        (await PuzzleNotifications.find({ puzzle: puzzleId }).fetchAsync()).map(
          (n) => n.user,
        ),
        [operatorId, memberId],
        "Unlocking announces it to every member, once",
      );
    });
  });
});
