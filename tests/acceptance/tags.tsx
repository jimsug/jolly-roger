import { promisify } from "node:util";
import { Meteor } from "meteor/meteor";
import { assert } from "chai";
import type { EditableHuntType } from "../../imports/lib/models/Hunts";
import PuzzleNotifications from "../../imports/lib/models/PuzzleNotifications";
import Puzzles from "../../imports/lib/models/Puzzles";
import Tags from "../../imports/lib/models/Tags";
import puzzleNotificationsForSelf from "../../imports/lib/publications/puzzleNotificationsForSelf";
import puzzlesForPuzzleList from "../../imports/lib/publications/puzzlesForPuzzleList";
import { MAX_TAG_NAME_LENGTH } from "../../imports/lib/tagNames";
import addHuntUser from "../../imports/methods/addHuntUser";
import addPuzzleTag from "../../imports/methods/addPuzzleTag";
import createHunt from "../../imports/methods/createHunt";
import createPuzzle from "../../imports/methods/createPuzzle";
import dismissPuzzleNotification from "../../imports/methods/dismissPuzzleNotification";
import provisionFirstUser from "../../imports/methods/provisionFirstUser";
import removePuzzleTag from "../../imports/methods/removePuzzleTag";
import renameTag from "../../imports/methods/renameTag";
import updateProfile from "../../imports/methods/updateProfile";
import resetDatabase from "../lib/resetDatabase";
import createUser from "./createTestUser";
import { USER_EMAIL, USER_PASSWORD } from "./lib";

if (Meteor.isClient) {
  const typedSubscribe = require("../../imports/client/typedSubscribe")
    .default as typeof import("../../imports/client/typedSubscribe").default;

  const huntFields: EditableHuntType = {
    name: "Test Hunt",
    mailingLists: [],
    openSignups: false,
    hasGuessQueue: true,
    defaultRoles: [],
    allowUnlockablePuzzles: false,
    isArchived: false,
    customLinkEmbed: false,
  };

  const HUNTER_EMAIL = "hunter@example.com";
  const HUNTER_PASSWORD = "password";
  const OUTSIDER_EMAIL = "outsider@example.com";
  const OUTSIDER_PASSWORD = "password";

  const login = (email: string, password: string) =>
    promisify(Meteor.loginWithPassword)(email, password);

  // Provisions the admin, creates a hunt they belong to, and adds one puzzle
  // per tag name so each tag exists.
  const setUpHunt = async (testName: string, puzzleTags: string[][]) => {
    await resetDatabase(testName);
    await provisionFirstUser.callPromise({
      email: USER_EMAIL,
      password: USER_PASSWORD,
    });
    await login(USER_EMAIL, USER_PASSWORD);
    const huntId = await createHunt.callPromise({
      ...huntFields,
      initialTags: "",
    });
    await addHuntUser.callPromise({ huntId, email: USER_EMAIL });
    const puzzleIds = [];
    for (const [i, tags] of puzzleTags.entries()) {
      puzzleIds.push(
        await createPuzzle.callPromise({
          huntId,
          title: `Puzzle ${i}`,
          tags,
          expectedAnswerCount: 1,
          docType: "spreadsheet",
        }),
      );
    }
    return { huntId, puzzleIds };
  };

  describe("tags", function () {
    describe("renameTag", function () {
      it("renames a tag in place and can keep the old name as an alias", async function () {
        const { huntId, puzzleIds } = await setUpHunt("tags rename in place", [
          ["Needs: Extraction"],
        ]);
        const sub = await typedSubscribe.async(puzzlesForPuzzleList, {
          huntId,
        });
        const tag = await Tags.findOneAsync({ hunt: huntId });
        assert.isDefined(tag);

        await renameTag.callPromise({
          tagId: tag._id,
          name: "  needs:extraction ",
          alias: true,
        });
        const renamed = await Tags.findOneAsync(tag._id);
        assert.equal(renamed?.name, "needs:extraction");
        assert.sameMembers(renamed?.aliases ?? [], ["Needs: Extraction"]);
        assert.sameMembers(
          (await Puzzles.findOneAsync(puzzleIds[0]))?.tags ?? [],
          [tag._id],
        );

        // Adding a tag by the old name resolves to the renamed tag
        await addPuzzleTag.callPromise({
          puzzleId: puzzleIds[0]!,
          tagName: "needs: extraction",
        });
        assert.equal(await Tags.find({ hunt: huntId }).countAsync(), 1);
        sub.stop();
      });

      it("merges into an existing tag with the new name", async function () {
        const { huntId, puzzleIds } = await setUpHunt("tags rename merge", [
          ["needs:extraction"],
          ["needs: extraction", "cryptic"],
          ["cryptic"],
        ]);
        const sub = await typedSubscribe.async(puzzlesForPuzzleList, {
          huntId,
        });
        const target = await Tags.findOneAsync({
          hunt: huntId,
          name: "needs:extraction",
        });
        const source = await Tags.findOneAsync({
          hunt: huntId,
          name: "needs: extraction",
        });
        assert.isDefined(target);
        assert.isDefined(source);

        await renameTag.callPromise({
          tagId: source._id,
          name: "Needs:Extraction",
          alias: true,
        });

        assert.isUndefined(
          await Tags.findOneAsync(source._id),
          "The merged tag should be gone",
        );
        const survivor = await Tags.findOneAsync(target._id);
        assert.equal(survivor?.name, "needs:extraction");
        assert.sameMembers(survivor?.aliases ?? [], ["needs: extraction"]);

        const cryptic = await Tags.findOneAsync({
          hunt: huntId,
          name: "cryptic",
        });
        assert.sameMembers(
          (await Puzzles.findOneAsync(puzzleIds[0]))?.tags ?? [],
          [target._id],
        );
        assert.sameMembers(
          (await Puzzles.findOneAsync(puzzleIds[1]))?.tags ?? [],
          [target._id, cryptic!._id],
          "Every puzzle with the merged tag should now carry the surviving tag",
        );
        assert.sameMembers(
          (await Puzzles.findOneAsync(puzzleIds[2]))?.tags ?? [],
          [cryptic!._id],
        );
        sub.stop();
      });

      it("rejects unknown tags and blank names", async function () {
        const { huntId } = await setUpHunt("tags rename errors", [["cryptic"]]);
        const sub = await typedSubscribe.async(puzzlesForPuzzleList, {
          huntId,
        });
        const tag = await Tags.findOneAsync({ hunt: huntId });
        assert.isDefined(tag);

        await assert.isRejected(
          renameTag.callPromise({ tagId: "nope", name: "x", alias: false }),
          /No tag known/,
        );
        await assert.isRejected(
          renameTag.callPromise({ tagId: tag._id, name: "  ", alias: false }),
          /must not be empty/,
        );
        assert.equal((await Tags.findOneAsync(tag._id))?.name, "cryptic");
        sub.stop();
      });

      it("lets any hunt member rename, but not outsiders", async function () {
        const { huntId } = await setUpHunt("tags rename permissions", [
          ["cryptic"],
        ]);
        const sub = await typedSubscribe.async(puzzlesForPuzzleList, {
          huntId,
        });
        const tag = await Tags.findOneAsync({ hunt: huntId });
        assert.isDefined(tag);
        sub.stop();

        await createUser.callPromise({
          email: HUNTER_EMAIL,
          password: HUNTER_PASSWORD,
          displayName: "Hunter",
        });
        await addHuntUser.callPromise({ huntId, email: HUNTER_EMAIL });
        await createUser.callPromise({
          email: OUTSIDER_EMAIL,
          password: OUTSIDER_PASSWORD,
          displayName: "Outsider",
        });

        // A plain member (no operator role) can rename
        await promisify(Meteor.logout)();
        await login(HUNTER_EMAIL, HUNTER_PASSWORD);
        await renameTag.callPromise({
          tagId: tag._id,
          name: "logic",
          alias: false,
        });
        const memberSub = await typedSubscribe.async(puzzlesForPuzzleList, {
          huntId,
        });
        assert.equal((await Tags.findOneAsync(tag._id))?.name, "logic");
        await assert.isRejected(
          renameTag.callPromise({
            tagId: tag._id,
            name: "x".repeat(MAX_TAG_NAME_LENGTH + 1),
            alias: false,
          }),
          /at most/,
        );
        assert.equal((await Tags.findOneAsync(tag._id))?.name, "logic");
        memberSub.stop();

        await promisify(Meteor.logout)();
        await login(OUTSIDER_EMAIL, OUTSIDER_PASSWORD);
        await assert.isRejected(
          renameTag.callPromise({
            tagId: tag._id,
            name: "cryptic",
            alias: false,
          }),
          /not a member/,
        );
      });
    });

    describe("addPuzzleTag", function () {
      it("rejects outsiders before anything is written", async function () {
        const { huntId, puzzleIds } = await setUpHunt("tags add permissions", [
          ["cryptic"],
        ]);
        const adminSub = await typedSubscribe.async(puzzlesForPuzzleList, {
          huntId,
        });
        const tag = await Tags.findOneAsync({ hunt: huntId });
        assert.isDefined(tag);
        adminSub.stop();

        await createUser.callPromise({
          email: HUNTER_EMAIL,
          password: HUNTER_PASSWORD,
          displayName: "Hunter",
        });
        await addHuntUser.callPromise({ huntId, email: HUNTER_EMAIL });
        await createUser.callPromise({
          email: OUTSIDER_EMAIL,
          password: OUTSIDER_PASSWORD,
          displayName: "Outsider",
        });

        await promisify(Meteor.logout)();
        await login(HUNTER_EMAIL, HUNTER_PASSWORD);
        await updateProfile.callPromise({
          displayName: "Hunter",
          dingwords: ["events"],
        });

        await promisify(Meteor.logout)();
        await login(OUTSIDER_EMAIL, OUTSIDER_PASSWORD);
        await assert.isRejected(
          addPuzzleTag.callPromise({
            puzzleId: puzzleIds[0]!,
            tagName: "group:events",
          }),
          /not a member/,
        );
        await assert.isRejected(
          removePuzzleTag.callPromise({
            puzzleId: puzzleIds[0]!,
            tagId: tag._id,
          }),
          /not a member/,
        );

        await promisify(Meteor.logout)();
        await login(HUNTER_EMAIL, HUNTER_PASSWORD);
        const puzzleSub = await typedSubscribe.async(puzzlesForPuzzleList, {
          huntId,
        });
        const notificationSub = await typedSubscribe.async(
          puzzleNotificationsForSelf,
        );
        assert.sameMembers(
          (await Puzzles.findOneAsync(puzzleIds[0]))?.tags ?? [],
          [tag._id],
          "The puzzle's tags are untouched",
        );
        assert.isUndefined(
          await Tags.findOneAsync({ hunt: huntId, name: "group:events" }),
          "No tag was created",
        );
        assert.equal(
          await PuzzleNotifications.find().countAsync(),
          0,
          "Nobody was dinged",
        );
        puzzleSub.stop();
        notificationSub.stop();
      });
    });

    describe("tag dings", function () {
      it("notifies members whose dingwords match a newly added tag", async function () {
        const { huntId, puzzleIds } = await setUpHunt("tags dings", [[]]);
        await createUser.callPromise({
          email: HUNTER_EMAIL,
          password: HUNTER_PASSWORD,
          displayName: "Hunter",
        });
        await addHuntUser.callPromise({ huntId, email: HUNTER_EMAIL });

        await promisify(Meteor.logout)();
        await login(HUNTER_EMAIL, HUNTER_PASSWORD);
        await updateProfile.callPromise({
          displayName: "Hunter",
          dingwords: ["events"],
        });

        await promisify(Meteor.logout)();
        await login(USER_EMAIL, USER_PASSWORD);
        await addPuzzleTag.callPromise({
          puzzleId: puzzleIds[0]!,
          tagName: "group:events",
        });
        // Adding a tag the puzzle already carries (here by a differently
        // cased name) changes nothing, so it mustn't ding anyone again
        await addPuzzleTag.callPromise({
          puzzleId: puzzleIds[0]!,
          tagName: "Group:Events",
        });
        const adderSub = await typedSubscribe.async(puzzleNotificationsForSelf);
        assert.equal(
          await PuzzleNotifications.find().countAsync(),
          0,
          "Whoever adds the tag isn't notified",
        );
        adderSub.stop();

        await promisify(Meteor.logout)();
        await login(HUNTER_EMAIL, HUNTER_PASSWORD);
        const sub = await typedSubscribe.async(puzzleNotificationsForSelf);
        const notifications = await PuzzleNotifications.find().fetchAsync();
        assert.lengthOf(notifications, 1, "Exactly one ding for one tagging");
        const notification = notifications[0];
        assert.isDefined(notification);
        assert.equal(notification.puzzle, puzzleIds[0]);
        assert.equal(notification.hunt, huntId);
        assert.include(notification.content, "group:events");
        assert.isDefined(
          await Puzzles.findOneAsync(puzzleIds[0]),
          "The puzzle is published alongside the notification",
        );

        await dismissPuzzleNotification.callPromise({
          puzzleNotificationId: notification._id,
        });
        assert.equal(await PuzzleNotifications.find().countAsync(), 0);
        sub.stop();
      });
    });
  });
}
