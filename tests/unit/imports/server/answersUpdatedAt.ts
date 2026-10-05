import { Accounts } from "meteor/accounts-base";
import { assert } from "chai";
import Guesses from "../../../../imports/lib/models/Guesses";
import MeteorUsers from "../../../../imports/lib/models/MeteorUsers";
import Puzzles from "../../../../imports/lib/models/Puzzles";
import addPuzzleAnswer from "../../../../imports/methods/addPuzzleAnswer";
import addPuzzleTag from "../../../../imports/methods/addPuzzleTag";
import removePuzzleAnswer from "../../../../imports/methods/removePuzzleAnswer";
import setGuessState from "../../../../imports/methods/setGuessState";
import updatePuzzle from "../../../../imports/methods/updatePuzzle";
import asUser from "../../../lib/asUser";
import createTestHunt from "../../../lib/createTestHunt";
import resetDatabase from "../../../lib/resetDatabase";

describe("answersUpdatedAt", function () {
  this.timeout(30000);

  let userId: string;

  beforeEach(async function () {
    await resetDatabase("answersUpdatedAt");
    userId = await Accounts.createUserAsync({
      email: "answers@example.com",
      password: "password",
    });
  });

  // A hunt the user operates, with one puzzle in it.
  const huntWithPuzzle = async (hasGuessQueue: boolean) => {
    const huntId = await createTestHunt(userId, { hasGuessQueue });
    await MeteorUsers.updateAsync(userId, {
      $set: { hunts: [huntId], roles: { [huntId]: ["operator"] } },
    });
    const puzzleId = await asUser(userId, () =>
      Puzzles.insertAsync({
        hunt: huntId,
        title: "Answered",
        tags: [],
        answers: [],
        expectedAnswerCount: 1,
      }),
    );
    return { huntId, puzzleId };
  };
  const answersUpdatedAt = async (puzzleId: string) =>
    (await Puzzles.findOneAsync(puzzleId))?.answersUpdatedAt;
  // Sets answersUpdatedAt well into the past, so a write can be told from
  // none without waiting for the clock.
  const LONG_AGO = new Date(0);
  const backdate = (puzzleId: string) =>
    Puzzles.updateAsync(puzzleId, { $set: { answersUpdatedAt: LONG_AGO } });
  const assertMoved = async (puzzleId: string) =>
    assert.isAbove(
      (await answersUpdatedAt(puzzleId))?.getTime() ?? 0,
      LONG_AGO.getTime(),
    );
  const assertKept = async (puzzleId: string) =>
    assert.equal(
      (await answersUpdatedAt(puzzleId))?.getTime(),
      LONG_AGO.getTime(),
    );

  it("is set by adding and removing an answer, and not by other edits", async function () {
    const { puzzleId } = await huntWithPuzzle(false);
    assert.isUndefined(await answersUpdatedAt(puzzleId));

    await asUser(userId, () =>
      addPuzzleAnswer.callPromise({ puzzleId, answer: "FIRST" }),
    );
    assert.instanceOf(await answersUpdatedAt(puzzleId), Date);

    await backdate(puzzleId);
    await asUser(userId, () =>
      addPuzzleTag.callPromise({ puzzleId, tagName: "group:later" }),
    );
    await assertKept(puzzleId);

    const guess = await Guesses.findOneAsync({ puzzle: puzzleId });
    assert.isDefined(guess);
    await asUser(userId, () =>
      removePuzzleAnswer.callPromise({ puzzleId, guessId: guess._id }),
    );
    assert.deepEqual((await Puzzles.findOneAsync(puzzleId))?.answers, []);
    await assertMoved(puzzleId);
  });

  it("is set by marking a puzzle complete with no answer and by taking that back", async function () {
    const { puzzleId } = await huntWithPuzzle(false);
    // The title stays put, so no document is renamed
    const update = (completedWithNoAnswer: boolean, expectedAnswerCount = 1) =>
      asUser(userId, () =>
        updatePuzzle.callPromise({
          puzzleId,
          title: "Answered",
          tags: [],
          expectedAnswerCount,
          completedWithNoAnswer,
        }),
      );

    await update(false, 2);
    assert.isUndefined(await answersUpdatedAt(puzzleId));

    await update(true);
    assert.instanceOf(await answersUpdatedAt(puzzleId), Date);

    await backdate(puzzleId);
    await update(true, 2);
    await assertKept(puzzleId);

    await update(false);
    await assertMoved(puzzleId);
  });

  describe("through guesses", function () {
    let huntId: string;
    let puzzleId: string;

    beforeEach(async function () {
      ({ huntId, puzzleId } = await huntWithPuzzle(true));
    });

    const guessFor = (guess: string) =>
      asUser(userId, () =>
        Guesses.insertAsync({
          hunt: huntId,
          puzzle: puzzleId,
          guess,
          state: "pending",
        }),
      );
    const setState = (
      guessId: string,
      state: "correct" | "incorrect" | "intermediate",
    ) => asUser(userId, () => setGuessState.callPromise({ guessId, state }));
    const answers = async () => (await Puzzles.findOneAsync(puzzleId))?.answers;

    it("is set when a guess is marked correct or stops being correct, and not otherwise", async function () {
      const wrong = await guessFor("WRONG");
      await setState(wrong, "incorrect");
      assert.isUndefined(await answersUpdatedAt(puzzleId));

      const right = await guessFor("RIGHT");
      await setState(right, "correct");
      assert.instanceOf(await answersUpdatedAt(puzzleId), Date);

      await backdate(puzzleId);
      await setState(right, "intermediate");
      assert.deepEqual(await answers(), []);
      await assertMoved(puzzleId);
    });

    it("is left alone when a guess for an answer the puzzle has is marked correct", async function () {
      const first = await guessFor("RIGHT");
      await setState(first, "correct");
      await backdate(puzzleId);

      const second = await guessFor("RIGHT");
      await setState(second, "correct");
      assert.deepEqual(await answers(), ["RIGHT"]);
      await assertKept(puzzleId);
    });

    it("is left alone, as is the answer, when another correct guess for it remains", async function () {
      const first = await guessFor("RIGHT");
      const second = await guessFor("RIGHT");
      await setState(first, "correct");
      await setState(second, "correct");
      await backdate(puzzleId);

      await setState(first, "incorrect");
      assert.deepEqual(await answers(), ["RIGHT"]);
      await assertKept(puzzleId);

      await setState(second, "incorrect");
      assert.deepEqual(await answers(), []);
      await assertMoved(puzzleId);
    });
  });
});
