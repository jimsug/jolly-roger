import { Accounts } from "meteor/accounts-base";
import { Meteor } from "meteor/meteor";
import { Random } from "meteor/random";
import { assert } from "chai";
import Documents from "../../../../imports/lib/models/Documents";
import FeatureFlags from "../../../../imports/lib/models/FeatureFlags";
import Puzzles from "../../../../imports/lib/models/Puzzles";
import asUser from "../../../lib/asUser";
import resetDatabase from "../../../lib/resetDatabase";

const DOCUMENT_ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz";

const postNote = (huntId: string, documentId: string, body: unknown) =>
  fetch(Meteor.absoluteUrl(`api/updatePuzzleNote/${huntId}/${documentId}`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("updatePuzzleNote API", function () {
  this.timeout(30000);

  const huntId = Random.id();
  let userId: string;
  let puzzleId: string;

  // Each test starts from this note, posted through the API
  const postBaselineNote = async () => {
    assert.equal(
      (await postNote(huntId, DOCUMENT_ID, { flavor: "Hm" })).status,
      200,
    );
  };

  this.beforeEach(async function () {
    await resetDatabase("updatePuzzleNote");
    userId = await Accounts.createUserAsync({
      email: "notes@example.com",
      password: "password",
    });
    await asUser(userId, async () => {
      puzzleId = await Puzzles.insertAsync({
        hunt: huntId,
        title: "Noted",
        tags: [],
        answers: [],
        expectedAnswerCount: 1,
      });
      await Documents.insertAsync({
        hunt: huntId,
        puzzle: puzzleId,
        provider: "google",
        value: { type: "spreadsheet", id: DOCUMENT_ID },
      });
    });
  });

  it("replaces the note of the puzzle behind the document, without a key", async function () {
    const response = await postNote(huntId, DOCUMENT_ID, {
      summary: " It's about birds ",
      flavor: "",
      flavorMeanings: [["a", " "], []],
      theories: "Migration?",
      externalLinkUrl: "https://example.com/notes",
    });
    assert.equal(response.status, 200);

    const puzzle = await Puzzles.findOneAsync(puzzleId);
    assert.deepEqual(puzzle?.noteContent, {
      summary: "It's about birds",
      flavorMeanings: [["a"]],
      theories: "Migration?",
      externalLinkUrl: "https://example.com/notes",
    });
    assert.instanceOf(puzzle?.noteUpdateTs, Date);

    // A later post replaces the whole note
    await postBaselineNote();
    assert.deepEqual((await Puzzles.findOneAsync(puzzleId))?.noteContent, {
      flavor: "Hm",
    });
  });

  it("rejects notes for unknown documents and malformed bodies", async function () {
    await postBaselineNote();

    assert.equal(
      (await postNote(huntId, "nope", { summary: "x" })).status,
      404,
    );
    assert.equal(
      (await postNote(Random.id(), DOCUMENT_ID, { summary: "x" })).status,
      404,
    );
    // A hunt board's id isn't a document with a puzzle behind it, so it
    // mustn't fall through to some puzzle of the hunt
    await asUser(userId, () =>
      Documents.insertAsync({
        hunt: huntId,
        provider: "board",
        value: { id: "board1", url: "https://board.example.com/boards/board1" },
      }),
    );
    assert.equal(
      (await postNote(huntId, "board1", { summary: "x" })).status,
      404,
    );
    assert.equal(
      (await postNote(huntId, DOCUMENT_ID, { summary: 42 })).status,
      400,
    );
    assert.equal(
      (await postNote(huntId, DOCUMENT_ID, { keywords: ["x"] })).status,
      400,
    );
    assert.equal(
      (await postNote(huntId, DOCUMENT_ID, { externalLinkUrl: "not a url" }))
        .status,
      400,
    );
    assert.deepEqual((await Puzzles.findOneAsync(puzzleId))?.noteContent, {
      flavor: "Hm",
    });
  });

  it("caps the size of a note", async function () {
    await postBaselineNote();

    const response = await postNote(huntId, DOCUMENT_ID, {
      summary: "x".repeat(66 * 1024),
    });
    assert.equal(response.status, 413);
    assert.deepEqual((await Puzzles.findOneAsync(puzzleId))?.noteContent, {
      flavor: "Hm",
    });
  });

  it("refuses notes while the disable.puzzle_notes circuit breaker is on", async function () {
    await postBaselineNote();
    await FeatureFlags.insertAsync({
      name: "disable.puzzle_notes",
      type: "on",
      createdBy: userId,
    });

    assert.equal(
      (await postNote(huntId, DOCUMENT_ID, { summary: "x" })).status,
      503,
    );
    assert.deepEqual((await Puzzles.findOneAsync(puzzleId))?.noteContent, {
      flavor: "Hm",
    });
  });
});
