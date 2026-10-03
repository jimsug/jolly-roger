import { promisify } from "node:util";
import { Meteor } from "meteor/meteor";
import { assert } from "chai";
import type { EditableHuntType } from "../../imports/lib/models/Hunts";
import PuzzleFeedbacks from "../../imports/lib/models/PuzzleFeedbacks";
import Puzzles from "../../imports/lib/models/Puzzles";
import puzzleFeedbacksForHunt from "../../imports/lib/publications/puzzleFeedbacksForHunt";
import puzzlesForPuzzleList from "../../imports/lib/publications/puzzlesForPuzzleList";
import { computeSolvedness } from "../../imports/lib/solvedness";
import addHuntUser from "../../imports/methods/addHuntUser";
import createHunt from "../../imports/methods/createHunt";
import createPuzzle from "../../imports/methods/createPuzzle";
import providePuzzleFeedback from "../../imports/methods/providePuzzleFeedback";
import provisionFirstUser from "../../imports/methods/provisionFirstUser";
import unlockPuzzle from "../../imports/methods/unlockPuzzle";
import updatePuzzle from "../../imports/methods/updatePuzzle";
import withdrawPuzzleInterest from "../../imports/methods/withdrawPuzzleInterest";
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
    allowUnlockablePuzzles: true,
    isArchived: false,
    customLinkEmbed: false,
  };

  const HUNTER_EMAIL = "hunter@example.com";
  const HUNTER_PASSWORD = "password";

  const login = (email: string, password: string) =>
    promisify(Meteor.loginWithPassword)(email, password);

  // Provisions the admin and creates a hunt they belong to
  const setUpHunt = async (testName: string) => {
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
    return huntId;
  };

  const subscribeToHunt = async (huntId: string) => {
    const puzzleSub = await typedSubscribe.async(puzzlesForPuzzleList, {
      huntId,
    });
    const feedbackSub = await typedSubscribe.async(puzzleFeedbacksForHunt, {
      huntId,
    });
    return () => {
      puzzleSub.stop();
      feedbackSub.stop();
    };
  };

  describe("puzzles", function () {
    describe("locked puzzles", function () {
      it("take interest votes until an operator unlocks them", async function () {
        this.timeout(10000);
        const huntId = await setUpHunt("puzzles locked votes");
        const adminId = Meteor.userId()!;
        const puzzleId = await createPuzzle.callPromise({
          huntId,
          title: "Locked",
          tags: [],
          expectedAnswerCount: 1,
          docType: "spreadsheet",
          locked: true,
          lockedSummary: " Behind a door ",
        });
        const hunterId = await createUser.callPromise({
          email: HUNTER_EMAIL,
          password: HUNTER_PASSWORD,
          displayName: "Hunter",
        });
        await addHuntUser.callPromise({ huntId, email: HUNTER_EMAIL });
        await providePuzzleFeedback.callPromise({
          puzzleId,
          score: 1,
          comment: "Looks fun",
        });

        await promisify(Meteor.logout)();
        await login(HUNTER_EMAIL, HUNTER_PASSWORD);
        let stop = await subscribeToHunt(huntId);
        const puzzle = await Puzzles.findOneAsync(puzzleId);
        assert.isTrue(puzzle?.locked);
        assert.equal(puzzle?.lockedSummary, "Behind a door");

        await providePuzzleFeedback.callPromise({
          puzzleId,
          score: 1,
          comment: " Ornithology ",
        });
        // Voting again updates the vote in place; a blank comment clears it
        await providePuzzleFeedback.callPromise({
          puzzleId,
          score: 1,
          comment: "",
        });
        const ownVotes = await PuzzleFeedbacks.find({
          puzzle: puzzleId,
        }).fetchAsync();
        assert.lengthOf(ownVotes, 1, "Members only see their own vote");
        assert.equal(ownVotes[0]!.createdBy, hunterId);
        assert.notProperty(ownVotes[0]!, "comment");
        await providePuzzleFeedback.callPromise({
          puzzleId,
          score: 1,
          comment: "Birds",
        });
        assert.equal(
          (await PuzzleFeedbacks.findOneAsync({ puzzle: puzzleId }))?.comment,
          "Birds",
        );
        // Votes can't be weighted: the count operators see is a sum of scores
        await assert.isRejected(
          providePuzzleFeedback.callPromise({ puzzleId, score: 0 }),
          /score of 1/,
        );
        await assert.isRejected(
          providePuzzleFeedback.callPromise({ puzzleId, score: 2 }),
          /score of 1/,
        );
        assert.equal(
          (await PuzzleFeedbacks.findOneAsync({ puzzle: puzzleId }))?.score,
          1,
        );
        await assert.isRejected(
          unlockPuzzle.callPromise({ puzzleId }),
          /may not unlock/,
        );
        stop();

        await promisify(Meteor.logout)();
        await login(USER_EMAIL, USER_PASSWORD);
        stop = await subscribeToHunt(huntId);
        assert.sameMembers(
          (await PuzzleFeedbacks.find({ puzzle: puzzleId }).fetchAsync()).map(
            (vote) => vote.createdBy,
          ),
          [adminId, hunterId],
          "Operators see everyone's votes",
        );

        await unlockPuzzle.callPromise({
          puzzleId,
          url: " https://example.com/unlocked ",
        });
        const unlocked = await Puzzles.findOneAsync(puzzleId);
        assert.notProperty(unlocked ?? {}, "locked");
        assert.notProperty(unlocked ?? {}, "lockedSummary");
        assert.equal(unlocked?.url, "https://example.com/unlocked");
        await assert.isRejected(
          providePuzzleFeedback.callPromise({ puzzleId, score: 1 }),
          /not locked/,
        );

        // Stale votes can still be withdrawn, one's own only
        await withdrawPuzzleInterest.callPromise({ puzzleId });
        assert.sameMembers(
          (await PuzzleFeedbacks.find({ puzzle: puzzleId }).fetchAsync()).map(
            (vote) => vote.createdBy,
          ),
          [hunterId],
        );
        stop();
      });

      it("can be locked and unlocked from the edit form where the hunt allows it", async function () {
        this.timeout(10000);
        const huntId = await setUpHunt("puzzles locked edit form");
        const puzzleId = await createPuzzle.callPromise({
          huntId,
          title: "Locked",
          tags: [],
          expectedAnswerCount: 1,
          docType: "spreadsheet",
          locked: true,
          lockedSummary: "Behind a door",
        });
        const stop = await subscribeToHunt(huntId);

        await updatePuzzle.callPromise({
          puzzleId,
          title: "Locked",
          tags: [],
          expectedAnswerCount: 1,
          locked: false,
        });
        const unlocked = await Puzzles.findOneAsync(puzzleId);
        assert.notProperty(unlocked ?? {}, "locked");
        assert.notProperty(unlocked ?? {}, "lockedSummary");

        await updatePuzzle.callPromise({
          puzzleId,
          title: "Locked",
          tags: [],
          expectedAnswerCount: 1,
          locked: true,
          lockedSummary: "Behind another door",
        });
        const relocked = await Puzzles.findOneAsync(puzzleId);
        assert.isTrue(relocked?.locked);
        assert.equal(relocked?.lockedSummary, "Behind another door");
        stop();

        const plainHuntId = await createHunt.callPromise({
          ...huntFields,
          allowUnlockablePuzzles: false,
          initialTags: "",
        });
        await assert.isRejected(
          createPuzzle.callPromise({
            huntId: plainHuntId,
            title: "Not here",
            tags: [],
            expectedAnswerCount: 1,
            docType: "spreadsheet",
            locked: true,
          }),
          /does not allow locked/,
        );
      });
    });

    describe("expected answer count", function () {
      it("accepts -1 for an unknown count, which never counts as solved", async function () {
        const huntId = await setUpHunt("puzzles unknown answer count");
        const puzzleId = await createPuzzle.callPromise({
          huntId,
          title: "Mystery",
          tags: [],
          expectedAnswerCount: -1,
          docType: "spreadsheet",
        });
        const stop = await subscribeToHunt(huntId);
        const puzzle = await Puzzles.findOneAsync(puzzleId);
        assert.isDefined(puzzle);
        assert.equal(puzzle.expectedAnswerCount, -1);
        assert.equal(computeSolvedness(puzzle), "unsolved");

        await assert.isRejected(
          createPuzzle.callPromise({
            huntId,
            title: "Nonsense",
            tags: [],
            expectedAnswerCount: -2,
            docType: "spreadsheet",
          }),
        );
        assert.equal(await Puzzles.find({ hunt: huntId }).countAsync(), 1);
        stop();
      });
    });
  });
}
