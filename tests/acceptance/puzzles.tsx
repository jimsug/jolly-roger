import { promisify } from "node:util";
import { Meteor } from "meteor/meteor";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { assert } from "chai";
import { MemoryRouter } from "react-router";
import type { EditableHuntType } from "../../imports/lib/models/Hunts";
import PuzzleInterests from "../../imports/lib/models/PuzzleInterests";
import Puzzles from "../../imports/lib/models/Puzzles";
import Tags from "../../imports/lib/models/Tags";
import puzzleInterestsForHunt from "../../imports/lib/publications/puzzleInterestsForHunt";
import puzzlesForPuzzleList from "../../imports/lib/publications/puzzlesForPuzzleList";
import { computeSolvedness } from "../../imports/lib/solvedness";
import addHuntUser from "../../imports/methods/addHuntUser";
import createHunt from "../../imports/methods/createHunt";
import createPuzzle from "../../imports/methods/createPuzzle";
import destroyPuzzle from "../../imports/methods/destroyPuzzle";
import promoteOperator from "../../imports/methods/promoteOperator";
import provisionFirstUser from "../../imports/methods/provisionFirstUser";
import registerPuzzleInterest from "../../imports/methods/registerPuzzleInterest";
import unlockPuzzle from "../../imports/methods/unlockPuzzle";
import updatePuzzle from "../../imports/methods/updatePuzzle";
import withdrawPuzzleInterest from "../../imports/methods/withdrawPuzzleInterest";
import resetDatabase from "../lib/resetDatabase";
import createUser from "./createTestUser";
import { stabilize, USER_EMAIL, USER_PASSWORD } from "./lib";

if (Meteor.isClient) {
  const Routes: typeof import("../../imports/client/components/Routes").default =
    require("../../imports/client/components/Routes").default;
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
      initialTags: [],
    });
    await addHuntUser.callPromise({ huntId, email: USER_EMAIL });
    return huntId;
  };

  // Stopped after each test (or before it switches users), so a failed
  // assertion can't leave a subscription running into the next test
  const subscriptionStops: (() => void)[] = [];
  const stopSubscriptions = () => {
    for (const stop of subscriptionStops.splice(0)) {
      stop();
    }
  };

  const subscribeToHunt = async (huntId: string) => {
    const puzzleSub = await typedSubscribe.async(puzzlesForPuzzleList, {
      huntId,
    });
    subscriptionStops.push(() => puzzleSub.stop());
    const interestSub = await typedSubscribe.async(puzzleInterestsForHunt, {
      huntId,
    });
    subscriptionStops.push(() => interestSub.stop());
  };

  describe("puzzles", function () {
    afterEach(stopSubscriptions);

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
        await registerPuzzleInterest.callPromise({
          puzzleId,
          score: 1,
          comment: "Looks fun",
        });

        await promisify(Meteor.logout)();
        await login(HUNTER_EMAIL, HUNTER_PASSWORD);
        await subscribeToHunt(huntId);
        const puzzle = await Puzzles.findOneAsync(puzzleId);
        assert.isTrue(puzzle?.locked);
        assert.equal(puzzle?.lockedSummary, "Behind a door");

        await registerPuzzleInterest.callPromise({
          puzzleId,
          score: 1,
          comment: " Ornithology ",
        });
        // Voting again updates the vote in place; a blank comment clears it
        await registerPuzzleInterest.callPromise({
          puzzleId,
          score: 1,
          comment: "",
        });
        const ownVotes = await PuzzleInterests.find({
          puzzle: puzzleId,
        }).fetchAsync();
        assert.lengthOf(ownVotes, 1, "Members only see their own vote");
        assert.equal(ownVotes[0]!.createdBy, hunterId);
        assert.notProperty(ownVotes[0]!, "comment");
        await registerPuzzleInterest.callPromise({
          puzzleId,
          score: 1,
          comment: "Birds",
        });
        assert.equal(
          (await PuzzleInterests.findOneAsync({ puzzle: puzzleId }))?.comment,
          "Birds",
        );
        // Votes can't be weighted: the count operators see is a sum of scores
        await assert.isRejected(
          registerPuzzleInterest.callPromise({ puzzleId, score: 0 }),
          /score of 1/,
        );
        await assert.isRejected(
          registerPuzzleInterest.callPromise({ puzzleId, score: 2 }),
          /score of 1/,
        );
        assert.equal(
          (await PuzzleInterests.findOneAsync({ puzzle: puzzleId }))?.score,
          1,
        );
        await assert.isRejected(
          unlockPuzzle.callPromise({ puzzleId }),
          /may not unlock/,
        );
        stopSubscriptions();

        await promisify(Meteor.logout)();
        await login(USER_EMAIL, USER_PASSWORD);
        await subscribeToHunt(huntId);
        assert.sameMembers(
          (await PuzzleInterests.find({ puzzle: puzzleId }).fetchAsync()).map(
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
          registerPuzzleInterest.callPromise({ puzzleId, score: 1 }),
          /not locked/,
        );

        // Stale votes can still be withdrawn, one's own only
        await withdrawPuzzleInterest.callPromise({ puzzleId });
        assert.sameMembers(
          (await PuzzleInterests.find({ puzzle: puzzleId }).fetchAsync()).map(
            (vote) => vote.createdBy,
          ),
          [hunterId],
        );
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
        await subscribeToHunt(huntId);

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

        const plainHuntId = await createHunt.callPromise({
          ...huntFields,
          allowUnlockablePuzzles: false,
          initialTags: [],
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
        await subscribeToHunt(huntId);
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
      });
    });

    describe("updatePuzzle", function () {
      it("clears the URL when completedWithNoAnswer is left unset too", async function () {
        const huntId = await setUpHunt("puzzles update clears url");
        const puzzleId = await createPuzzle.callPromise({
          huntId,
          title: "Linked",
          url: "https://example.com/linked",
          tags: [],
          expectedAnswerCount: 1,
          docType: "spreadsheet",
        });
        await subscribeToHunt(huntId);
        assert.equal(
          (await Puzzles.findOneAsync(puzzleId))?.url,
          "https://example.com/linked",
        );

        await updatePuzzle.callPromise({
          puzzleId,
          title: "Linked",
          tags: [],
          expectedAnswerCount: 1,
        });
        const updated = await Puzzles.findOneAsync(puzzleId);
        assert.isDefined(updated);
        assert.notProperty(updated, "url");
        assert.notProperty(updated, "completedWithNoAnswer");
      });
    });

    describe("puzzle list", function () {
      afterEach(function () {
        cleanup();
      });

      it("offers Show and Hide for solved puzzles, as for viewers", async function () {
        this.timeout(10000);
        const huntId = await setUpHunt("puzzle list solved toggle");
        render(
          <MemoryRouter initialEntries={[`/hunts/${huntId}/puzzles`]}>
            <Routes />
          </MemoryRouter>,
        );
        await act(async () => {
          await stabilize();
        });
        await screen.findByText("Solved puzzles", {}, { timeout: 5000 });
        const labelFor = (suffix: string) =>
          document
            .querySelector(`label[for$="-${suffix}"]`)
            ?.textContent?.trim();
        assert.equal(labelFor("solved-show-button"), "Show");
        assert.equal(labelFor("solved-hide-button"), "Hide");
        assert.equal(labelFor("viewers-show-button"), "Show");
        assert.equal(labelFor("viewers-hide-button"), "Hide");
      });

      it("shows deleted puzzles to global admins and not to operators", async function () {
        this.timeout(15000);
        const huntId = await setUpHunt("puzzle list deleted puzzles");
        await createPuzzle.callPromise({
          huntId,
          title: "Still here",
          tags: [],
          expectedAnswerCount: 1,
          docType: "spreadsheet",
        });
        const deletedId = await createPuzzle.callPromise({
          huntId,
          title: "Gone now",
          tags: [],
          expectedAnswerCount: 1,
          docType: "spreadsheet",
        });
        await destroyPuzzle.callPromise({
          puzzleId: deletedId,
          copySheetsToReplacement: false,
        });
        const operatorId = await createUser.callPromise({
          email: HUNTER_EMAIL,
          password: HUNTER_PASSWORD,
          displayName: "Operator",
        });
        await addHuntUser.callPromise({ huntId, email: HUNTER_EMAIL });
        await promoteOperator.callPromise({ targetUserId: operatorId, huntId });

        const renderList = async () => {
          render(
            <MemoryRouter initialEntries={[`/hunts/${huntId}/puzzles`]}>
              <Routes />
            </MemoryRouter>,
          );
          await act(async () => {
            await stabilize();
          });
          // The list itself, not the new puzzle notification
          await screen.findByText("Solved puzzles", {}, { timeout: 5000 });
        };

        await renderList();
        assert.exists(screen.queryByText("Deleted puzzles (admin only)"));
        assert.isDefined(await Puzzles.findOneAllowingDeletedAsync(deletedId));
        cleanup();

        await promisify(Meteor.logout)();
        await login(HUNTER_EMAIL, HUNTER_PASSWORD);
        await renderList();
        assert.isNull(screen.queryByText("Deleted puzzles (admin only)"));
        // The page doesn't ask for deleted puzzles as an operator, so ask the
        // publication directly to check the server holds them back
        const directSub = await typedSubscribe.async(puzzlesForPuzzleList, {
          huntId,
          includeDeleted: true,
        });
        subscriptionStops.push(() => directSub.stop());
        assert.isUndefined(
          await Puzzles.findOneAllowingDeletedAsync(deletedId),
          "The operator isn't sent the deleted puzzle, even when asking",
        );
      });

      describe("recent tags in the add puzzle form", function () {
        afterEach(function () {
          localStorage.removeItem("huntRecentTags");
        });

        it("offers the tags last added with, newest first and by canonical name", async function () {
          this.timeout(20000);
          const huntId = await setUpHunt("puzzle list recent tags");
          render(
            <MemoryRouter initialEntries={[`/hunts/${huntId}/puzzles`]}>
              <Routes />
            </MemoryRouter>,
          );
          await act(async () => {
            await stabilize();
          });

          const openForm = async () => {
            fireEvent.click(
              await screen.findByRole(
                "button",
                { name: "Add a puzzle" },
                { timeout: 5000 },
              ),
            );
            return within(
              await screen.findByRole("dialog", {}, { timeout: 5000 }),
            );
          };
          const addTag = (
            form: ReturnType<typeof within>,
            label: string,
            name: string,
          ) => {
            const input = form.getByLabelText(label);
            fireEvent.change(input, { target: { value: name } });
            fireEvent.keyDown(input, {
              key: "Enter",
              code: "Enter",
              keyCode: 13,
            });
          };
          const save = async (
            form: ReturnType<typeof within>,
            title: string,
          ) => {
            fireEvent.change(form.getByLabelText("Title"), {
              target: { value: title },
            });
            fireEvent.click(form.getByRole("button", { name: "Save" }));
            await waitFor(
              () => {
                assert.isNull(screen.queryByRole("dialog"));
              },
              { timeout: 10000 },
            );
          };
          const offered = async (form: ReturnType<typeof within>) =>
            within(
              await form.findByRole(
                "group",
                { name: "Recent:" },
                { timeout: 5000 },
              ),
            )
              .getAllByRole("button")
              .map((button) => button.textContent);

          let form = await openForm();
          assert.isNull(form.queryByRole("group", { name: "Recent:" }));
          // A synonym, which the hunt gets as where:atrium
          addTag(form, "Functional tags", "loc:atrium");
          addTag(form, "Content tags", "cryptic");
          await save(form, "First");
          assert.sameMembers(
            (await Tags.find({ hunt: huntId }).fetchAsync()).map(
              (tag) => tag.name,
            ),
            ["where:atrium", "cryptic"],
          );

          form = await openForm();
          assert.deepEqual(await offered(form), ["+where:atrium", "+cryptic"]);
          fireEvent.click(form.getByRole("button", { name: "+cryptic" }));
          assert.deepEqual(await offered(form), ["+where:atrium"]);
          await save(form, "Second");
          const second = await Puzzles.findOneAsync({ title: "Second" });
          const cryptic = await Tags.findOneAsync({
            hunt: huntId,
            name: "cryptic",
          });
          assert.deepEqual(second?.tags, [cryptic?._id]);

          form = await openForm();
          assert.deepEqual(await offered(form), ["+cryptic", "+where:atrium"]);
        });
      });
    });
  });
}
