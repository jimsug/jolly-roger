import { Accounts } from "meteor/accounts-base";
import { DDP } from "meteor/ddp";
import { Meteor } from "meteor/meteor";
import { Random } from "meteor/random";
import { assert } from "chai";
import Documents from "../../../../imports/lib/models/Documents";
import Puzzles from "../../../../imports/lib/models/Puzzles";
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
  let puzzleId: string;

  this.beforeAll(async function () {
    await resetDatabase("updatePuzzleNote");
    const userId = await Accounts.createUserAsync({
      email: "notes@example.com",
      password: "password",
    });
    await DDP._CurrentMethodInvocation.withValue({ userId }, async () => {
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
    assert.equal(
      (await postNote(huntId, DOCUMENT_ID, { flavor: "Hm" })).status,
      200,
    );
    assert.deepEqual((await Puzzles.findOneAsync(puzzleId))?.noteContent, {
      flavor: "Hm",
    });
  });

  it("rejects notes for unknown documents and malformed bodies", async function () {
    assert.equal(
      (await postNote(huntId, "nope", { summary: "x" })).status,
      404,
    );
    assert.equal(
      (await postNote(Random.id(), DOCUMENT_ID, { summary: "x" })).status,
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
    const response = await postNote(huntId, DOCUMENT_ID, {
      summary: "x".repeat(66 * 1024),
    });
    assert.equal(response.status, 413);
    assert.deepEqual((await Puzzles.findOneAsync(puzzleId))?.noteContent, {
      flavor: "Hm",
    });
  });
});
