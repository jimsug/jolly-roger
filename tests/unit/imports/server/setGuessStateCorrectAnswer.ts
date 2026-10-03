import { Accounts } from "meteor/accounts-base";
import { DDP } from "meteor/ddp";
import { assert } from "chai";
import ChatMessages from "../../../../imports/lib/models/ChatMessages";
import Guesses from "../../../../imports/lib/models/Guesses";
import Hunts from "../../../../imports/lib/models/Hunts";
import MeteorUsers from "../../../../imports/lib/models/MeteorUsers";
import Puzzles from "../../../../imports/lib/models/Puzzles";
import nodeIsText from "../../../../imports/lib/nodeIsText";
import { addUserToRole } from "../../../../imports/lib/permission_stubs";
import setGuessState from "../../../../imports/methods/setGuessState";
import resetDatabase from "../../../lib/resetDatabase";

describe("setGuessState with a corrected answer", function () {
  this.timeout(30000);

  let huntId: string;
  let operatorId: string;
  let memberId: string;
  let puzzleId: string;

  const asUser = <T>(userId: string, fn: () => Promise<T>) =>
    DDP._CurrentMethodInvocation.withValue({ userId }, fn);
  const asOperator = <T>(fn: () => Promise<T>) => asUser(operatorId, fn);

  const newGuess = (guess: string) =>
    asOperator(() =>
      Guesses.insertAsync({
        hunt: huntId,
        puzzle: puzzleId,
        guess,
        direction: 0,
        confidence: 50,
        state: "pending",
      }),
    );

  const latestSystemMessage = async () => {
    const messages = await ChatMessages.find(
      { puzzle: puzzleId, sender: undefined },
      { sort: { timestamp: -1 } },
    ).fetchAsync();
    const content = messages[0]?.content.children[0];
    return content && nodeIsText(content) ? content.text : undefined;
  };

  this.beforeAll(async function () {
    await resetDatabase("setGuessState corrected answer");
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
        name: "Guess hunt",
        mailingLists: [],
        openSignups: false,
        hasGuessQueue: true,
        defaultRoles: [],
        allowUnlockablePuzzles: false,
        isArchived: false,
        customLinkEmbed: false,
      }),
    );
    for (const userId of [operatorId, memberId]) {
      await MeteorUsers.updateAsync(userId, {
        $set: { displayName: userId, hunts: [huntId] },
      });
    }
    await addUserToRole(operatorId, huntId, "operator");
  });

  this.beforeEach(async function () {
    puzzleId = await asOperator(() =>
      Puzzles.insertAsync({
        hunt: huntId,
        title: "Guessable",
        tags: [],
        answers: [],
        expectedAnswerCount: 1,
      }),
    );
  });

  it("records the corrected answer on the guess and the puzzle", async function () {
    const guessId = await newGuess("ANSWER");

    await asOperator(() =>
      setGuessState.callPromise({
        guessId,
        state: "correct",
        correctAnswer: " answer two ",
      }),
    );

    const guess = await Guesses.findOneAsync(guessId);
    assert.equal(guess?.state, "correct");
    assert.equal(guess?.guess, "ANSWER TWO");
    const puzzle = await Puzzles.findOneAsync(puzzleId);
    assert.deepEqual(puzzle?.answers, ["ANSWER TWO"]);
    const message = await latestSystemMessage();
    assert.include(message, "`ANSWER TWO`");
    assert.include(message, "with changes");
    assert.include(message, "submitted as `ANSWER`");
  });

  it("treats a correction that only differs by case or spacing as the same answer", async function () {
    const guessId = await newGuess("ANSWER");

    await asOperator(() =>
      setGuessState.callPromise({
        guessId,
        state: "correct",
        correctAnswer: "answer",
      }),
    );

    assert.equal((await Guesses.findOneAsync(guessId))?.guess, "ANSWER");
    assert.deepEqual((await Puzzles.findOneAsync(puzzleId))?.answers, [
      "ANSWER",
    ]);
    assert.notInclude(await latestSystemMessage(), "with changes");
  });

  it("renders the submitted answer the same way as the guess", async function () {
    // The system message escapes the guess once; the submitted text used to
    // go through that escaping twice
    const plainId = await newGuess("AT&T <B>");
    await asOperator(() =>
      setGuessState.callPromise({ guessId: plainId, state: "correct" }),
    );
    const rendered = /^Guess `(.*)` was marked/.exec(
      (await latestSystemMessage()) ?? "",
    )?.[1];
    assert.isString(rendered);

    const correctedId = await newGuess("AT&T <B>");
    await asOperator(() =>
      setGuessState.callPromise({
        guessId: correctedId,
        state: "correct",
        correctAnswer: "ATT B",
      }),
    );
    assert.include(
      await latestSystemMessage(),
      `(submitted as \`${rendered}\`)`,
    );
  });

  it("unwinds the corrected answer when the guess stops being correct", async function () {
    const guessId = await newGuess("ANSWER");
    await asOperator(() =>
      setGuessState.callPromise({
        guessId,
        state: "correct",
        correctAnswer: "better",
      }),
    );
    assert.deepEqual((await Puzzles.findOneAsync(puzzleId))?.answers, [
      "BETTER",
    ]);

    await asOperator(() =>
      setGuessState.callPromise({ guessId, state: "incorrect" }),
    );

    assert.deepEqual((await Puzzles.findOneAsync(puzzleId))?.answers, []);
    assert.equal((await Guesses.findOneAsync(guessId))?.guess, "BETTER");
  });

  it("is only for operators", async function () {
    const guessId = await newGuess("ANSWER");
    await assert.isRejected(
      asUser(memberId, () =>
        setGuessState.callPromise({
          guessId,
          state: "correct",
          correctAnswer: "other",
        }),
      ),
      /permitted/,
    );
    assert.equal((await Guesses.findOneAsync(guessId))?.state, "pending");
    assert.deepEqual((await Puzzles.findOneAsync(puzzleId))?.answers, []);
  });

  it("rejects a correction for any other state, and a blank one", async function () {
    const guessId = await newGuess("ANSWER");
    await assert.isRejected(
      asOperator(() =>
        setGuessState.callPromise({
          guessId,
          state: "incorrect",
          correctAnswer: "other",
        }),
      ),
      /only goes with/,
    );
    await assert.isRejected(
      asOperator(() =>
        setGuessState.callPromise({
          guessId,
          state: "correct",
          correctAnswer: "   ",
        }),
      ),
      /blank/,
    );
    assert.equal((await Guesses.findOneAsync(guessId))?.state, "pending");
  });
});
