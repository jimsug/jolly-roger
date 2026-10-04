import { Random } from "meteor/random";
import { assert } from "chai";
import sinon from "sinon";
import Logger from "../../../../imports/Logger";
import Hunts from "../../../../imports/lib/models/Hunts";
import Puzzles from "../../../../imports/lib/models/Puzzles";
import repairLegacyUrls, {
  repairUrl,
} from "../../../../imports/server/repairLegacyUrls";
import createTestHunt from "../../../lib/createTestHunt";
import resetDatabase from "../../../lib/resetDatabase";

type RawDoc = { _id: string; [field: string]: unknown };

// Inserts a puzzle as the fork could have written it. Document validation is
// bypassed because that is the point.
async function insertLegacyPuzzle(extra: Record<string, unknown>) {
  const _id = Random.id();
  await Puzzles.collection
    .rawDatabase()
    .collection<RawDoc>("jr_puzzles")
    .insertOne(
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
      },
      { bypassDocumentValidation: true },
    );
  return _id;
}

describe("repairUrl", function () {
  it("trims, then lets the URL parser encode what it can", function () {
    assert.equal(
      repairUrl(" https://example.com/puzzle \n"),
      "https://example.com/puzzle",
    );
    assert.equal(repairUrl("https://example.com "), "https://example.com");
    assert.equal(
      repairUrl("https://user name@example.com/p"),
      "https://user%20name@example.com/p",
    );
    assert.equal(
      repairUrl("https://bücher.example/p"),
      "https://xn--bcher-kva.example/p",
    );
  });

  it("gives up on anything that isn't an http(s) URL to begin with", function () {
    for (const value of [
      "Jamboard: https://jamboard.google.com/d/x",
      "javascript:alert(1)//https://a.bc",
      "https://example.com)",
      "https://exa mple.com/p",
      "",
      null,
    ]) {
      assert.isUndefined(repairUrl(value), String(value));
    }
  });
});

describe("repairLegacyUrls migration", function () {
  it("repairs puzzle URLs it can and clears the ones it can't", async function () {
    await resetDatabase("repairLegacyUrls puzzles");
    const spaced = await insertLegacyPuzzle({
      url: " https://example.com/puzzle ",
    });
    const unfixable = await insertLegacyPuzzle({
      url: "Jamboard: https://jamboard.google.com/d/x",
      noteContent: {
        summary: "Kept",
        externalLinkUrl: "https://bücher.example/notes",
      },
    });
    const valid = await insertLegacyPuzzle({
      url: "https://example.com/has a space",
    });

    // Without the migration, the schema validator rejects any update
    await assert.isRejected(
      Puzzles.updateAsync(spaced, { $addToSet: { answers: "FOO" } }),
      /Document failed validation/,
    );

    const warn = sinon.spy(Logger, "warn");
    try {
      await repairLegacyUrls();
      // Only what had to be cleared is logged, with enough to find it again
      const clearings = warn
        .getCalls()
        .filter((c) => c.args[0] === "Clearing a URL that can't be made valid");
      assert.lengthOf(clearings, 1);
      assert.deepEqual(clearings[0]?.args[1], {
        puzzle: unfixable,
        field: "url",
        url: "Jamboard: https://jamboard.google.com/d/x",
      });
    } finally {
      warn.restore();
    }

    assert.equal(
      (await Puzzles.findOneAsync(spaced))?.url,
      "https://example.com/puzzle",
    );
    const cleared = await Puzzles.findOneAsync(unfixable);
    assert.notProperty(cleared ?? {}, "url");
    assert.deepEqual(cleared?.noteContent, {
      summary: "Kept",
      externalLinkUrl: "https://xn--bcher-kva.example/notes",
    });
    assert.equal(
      (await Puzzles.findOneAsync(valid))?.url,
      "https://example.com/has a space",
    );

    for (const puzzleId of [spaced, unfixable]) {
      await Puzzles.updateAsync(puzzleId, { $addToSet: { answers: "FOO" } });
      assert.deepEqual((await Puzzles.findOneAsync(puzzleId))?.answers, [
        "FOO",
      ]);
    }
  });

  it("does the same for a hunt's links", async function () {
    await resetDatabase("repairLegacyUrls hunts");
    const huntId = await createTestHunt(Random.id());
    await Hunts.collection.rawCollection().updateOne(
      { _id: huntId },
      {
        $set: {
          homepageUrl: "https://hunt.example\t",
          archivedHuntUrl: "see https://archive.example",
          customLinkUrl: "https://links.example/a b",
        },
      },
      { bypassDocumentValidation: true },
    );
    await assert.isRejected(
      Hunts.updateAsync(huntId, { $set: { name: "Renamed" } }),
      /Document failed validation/,
    );

    await repairLegacyUrls();

    const hunt = await Hunts.findOneAsync(huntId);
    assert.equal(hunt?.homepageUrl, "https://hunt.example");
    assert.notProperty(hunt ?? {}, "archivedHuntUrl");
    assert.equal(hunt?.customLinkUrl, "https://links.example/a b");
    await Hunts.updateAsync(huntId, { $set: { name: "Renamed" } });
    assert.equal((await Hunts.findOneAsync(huntId))?.name, "Renamed");
  });
});
