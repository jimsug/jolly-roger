import { Accounts } from "meteor/accounts-base";
import { DDP } from "meteor/ddp";
import { Random } from "meteor/random";
import { assert } from "chai";
import FeatureFlags from "../../../../imports/lib/models/FeatureFlags";
import MeteorUsers from "../../../../imports/lib/models/MeteorUsers";
import PuzzleNotifications from "../../../../imports/lib/models/PuzzleNotifications";
import Puzzles from "../../../../imports/lib/models/Puzzles";
import Tags from "../../../../imports/lib/models/Tags";
import TagHooks from "../../../../imports/server/hooks/TagHooks";
import resetDatabase from "../../../lib/resetDatabase";

async function createUser(
  email: string,
  huntId: string,
  dingwords: string[],
): Promise<string> {
  const userId = await Accounts.createUserAsync({
    email,
    password: "password",
  });
  await MeteorUsers.updateAsync(userId, {
    $set: { displayName: email, hunts: [huntId], dingwords },
  });
  return userId;
}

describe("TagHooks", function () {
  this.timeout(30000);

  const huntId = Random.id();
  let adderId: string;
  let dingedId: string;
  let quietId: string;
  let elsewhereId: string;
  let puzzleId: string;
  let tagId: string;

  const asAdder = <T>(fn: () => Promise<T>) =>
    DDP._CurrentMethodInvocation.withValue({ userId: adderId }, fn);
  const runHook = (puzzle: string, tag: string) =>
    asAdder(async () => {
      await TagHooks.onAddPuzzleTag!(puzzle, tag, adderId);
    });

  this.beforeAll(async function () {
    await resetDatabase("TagHooks");
    // The adder's dingwords match too, but they shouldn't be told about
    // their own tagging.
    adderId = await createUser("adder@example.com", huntId, ["events"]);
    dingedId = await createUser("dinged@example.com", huntId, ["EVENTS"]);
    quietId = await createUser("quiet@example.com", huntId, ["cryptic"]);
    elsewhereId = await createUser("elsewhere@example.com", Random.id(), [
      "events",
    ]);
    await asAdder(async () => {
      tagId = await Tags.insertAsync({ hunt: huntId, name: "group:events" });
      puzzleId = await Puzzles.insertAsync({
        hunt: huntId,
        title: "Opening Ceremony",
        tags: [tagId],
        answers: [],
        expectedAnswerCount: 1,
      });
    });
  });

  this.beforeEach(async function () {
    await PuzzleNotifications.removeAsync({});
    await FeatureFlags.removeAsync({});
  });

  it("notifies hunt members whose dingwords match the tag", async function () {
    await runHook(puzzleId, tagId);

    const notifications = await PuzzleNotifications.find({}).fetchAsync();
    assert.sameMembers(
      notifications.map((n) => n.user),
      [dingedId],
      "Only the matching member who didn't add the tag should be notified",
    );
    const notification = notifications[0];
    assert.isDefined(notification);
    assert.equal(notification.hunt, huntId);
    assert.equal(notification.puzzle, puzzleId);
    assert.equal(notification.background, "secondary");
    assert.include(notification.content, "Opening Ceremony");
    assert.include(notification.content, "group:events");
    assert.notInclude(
      notifications.map((n) => n.user),
      quietId,
      "A member whose dingwords don't match must not be notified",
    );
    assert.notInclude(
      notifications.map((n) => n.user),
      elsewhereId,
      "Members of other hunts must not be notified",
    );
  });

  it("does nothing while dingwords are disabled", async function () {
    await asAdder(() =>
      FeatureFlags.insertAsync({ name: "disable.dingwords", type: "on" }),
    );
    await runHook(puzzleId, tagId);
    assert.equal(await PuzzleNotifications.find({}).countAsync(), 0);
  });

  it("ignores tags and puzzles that no longer exist", async function () {
    await runHook(puzzleId, Random.id());
    await runHook(Random.id(), tagId);
    assert.equal(await PuzzleNotifications.find({}).countAsync(), 0);
  });
});
