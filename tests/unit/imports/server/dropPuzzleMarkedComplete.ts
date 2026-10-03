import { Random } from "meteor/random";
import { assert } from "chai";
import Puzzles from "../../../../imports/lib/models/Puzzles";
import { computeSolvedness } from "../../../../imports/lib/solvedness";
import { dropPuzzleMarkedComplete } from "../../../../imports/server/migrations/56-drop-puzzle-marked-complete";
import resetDatabase from "../../../lib/resetDatabase";

// Inserts a puzzle shaped like one the fork wrote. Document validation is
// bypassed because that is the point.
async function insertLegacyPuzzle(extra: Record<string, unknown> = {}) {
  const _id = Random.id();
  await Puzzles.collection.rawCollection().insertOne(
    {
      _id,
      hunt: Random.id(),
      title: "Legacy puzzle",
      tags: [],
      answers: [],
      expectedAnswerCount: 1,
      deleted: false,
      createdAt: new Date(),
      createdBy: Random.id(),
      updatedAt: new Date(),
      ...extra,
    } as any,
    { bypassDocumentValidation: true },
  );
  return _id;
}

async function solvednessOf(puzzleId: string) {
  const puzzle = await Puzzles.findOneAsync(puzzleId);
  assert.isDefined(puzzle);
  assert.notProperty(puzzle, "markedComplete");
  return computeSolvedness(puzzle);
}

describe("dropPuzzleMarkedComplete migration", function () {
  it("makes puzzles that carry markedComplete writable again", async function () {
    await resetDatabase("dropPuzzleMarkedComplete legacy");
    const puzzleId = await insertLegacyPuzzle({ markedComplete: false });

    // Without the migration, the schema validator rejects any update
    await assert.isRejected(
      Puzzles.destroyAsync(puzzleId),
      /Document failed validation/,
    );

    await dropPuzzleMarkedComplete();

    const puzzle = await Puzzles.findOneAsync(puzzleId);
    assert.notProperty(puzzle ?? {}, "markedComplete");
    assert.equal(puzzle?.expectedAnswerCount, 1);
    assert.notProperty(puzzle ?? {}, "completedWithNoAnswer");

    await Puzzles.destroyAsync(puzzleId);
    assert.isUndefined(await Puzzles.findOneAsync(puzzleId));
  });

  it("keeps puzzles that were marked complete by hand solved", async function () {
    await resetDatabase("dropPuzzleMarkedComplete solved");
    const unknownCountWithAnswers = await insertLegacyPuzzle({
      markedComplete: true,
      expectedAnswerCount: -1,
      answers: ["FOO", "BAR"],
    });
    const unknownCountNoAnswers = await insertLegacyPuzzle({
      markedComplete: true,
      expectedAnswerCount: -1,
    });
    const shortOfCount = await insertLegacyPuzzle({
      markedComplete: true,
      expectedAnswerCount: 2,
      answers: ["FOO"],
    });
    const completedItem = await insertLegacyPuzzle({
      markedComplete: true,
      expectedAnswerCount: 0,
      completedWithNoAnswer: true,
    });
    const alreadySolved = await insertLegacyPuzzle({
      markedComplete: true,
      expectedAnswerCount: 1,
      answers: ["FOO"],
    });

    await dropPuzzleMarkedComplete();

    for (const puzzleId of [
      unknownCountWithAnswers,
      unknownCountNoAnswers,
      shortOfCount,
      completedItem,
      alreadySolved,
    ]) {
      assert.equal(await solvednessOf(puzzleId), "solved");
    }
    assert.equal(
      (await Puzzles.findOneAsync(unknownCountWithAnswers))
        ?.expectedAnswerCount,
      2,
      "An unknown count becomes the number of answers found",
    );
    const noAnswers = await Puzzles.findOneAsync(unknownCountNoAnswers);
    assert.equal(noAnswers?.expectedAnswerCount, 0);
    assert.isTrue(noAnswers?.completedWithNoAnswer);
    assert.equal(
      (await Puzzles.findOneAsync(shortOfCount))?.expectedAnswerCount,
      1,
    );
    assert.equal(
      (await Puzzles.findOneAsync(alreadySolved))?.expectedAnswerCount,
      1,
    );
  });

  it("keeps puzzles the fork considered unsolved from turning solved", async function () {
    await resetDatabase("dropPuzzleMarkedComplete unsolved");
    const pendingItem = await insertLegacyPuzzle({
      markedComplete: false,
      expectedAnswerCount: 0,
      completedWithNoAnswer: true,
    });
    const neverMarkedItem = await insertLegacyPuzzle({
      expectedAnswerCount: 0,
      completedWithNoAnswer: true,
    });
    const unknownCount = await insertLegacyPuzzle({
      markedComplete: false,
      expectedAnswerCount: -1,
      answers: ["FOO"],
    });
    const unsolved = await insertLegacyPuzzle({
      markedComplete: false,
      expectedAnswerCount: 2,
      answers: ["FOO"],
    });
    const administrivia = await insertLegacyPuzzle({
      markedComplete: true,
      expectedAnswerCount: 0,
    });

    await dropPuzzleMarkedComplete();

    assert.equal(await solvednessOf(pendingItem), "noAnswers");
    assert.notProperty(
      (await Puzzles.findOneAsync(pendingItem)) ?? {},
      "completedWithNoAnswer",
    );
    assert.equal(await solvednessOf(neverMarkedItem), "noAnswers");
    assert.equal(await solvednessOf(unknownCount), "unsolved");
    assert.equal(
      (await Puzzles.findOneAsync(unknownCount))?.expectedAnswerCount,
      -1,
    );
    assert.equal(await solvednessOf(unsolved), "unsolved");
    assert.equal(await solvednessOf(administrivia), "noAnswers");
    assert.notProperty(
      (await Puzzles.findOneAsync(administrivia)) ?? {},
      "completedWithNoAnswer",
    );
  });

  it("fixes deleted puzzles too", async function () {
    await resetDatabase("dropPuzzleMarkedComplete deleted");
    const puzzleId = await insertLegacyPuzzle({
      markedComplete: true,
      expectedAnswerCount: -1,
      deleted: true,
    });

    await dropPuzzleMarkedComplete();

    const puzzle = await Puzzles.findOneDeletedAsync(puzzleId);
    assert.notProperty(puzzle ?? {}, "markedComplete");
    assert.equal(puzzle?.expectedAnswerCount, 0);
    assert.isTrue(puzzle?.completedWithNoAnswer);
    await Puzzles.undestroyAsync(puzzleId);
    assert.isDefined(await Puzzles.findOneAsync(puzzleId));
  });
});
