import { Accounts } from "meteor/accounts-base";
import { Random } from "meteor/random";
import { assert } from "chai";
import Documents from "../../../../imports/lib/models/Documents";
import asUser from "../../../lib/asUser";
import createTestHunt from "../../../lib/createTestHunt";
import resetDatabase from "../../../lib/resetDatabase";

describe("Documents with a board provider", function () {
  this.timeout(30000);

  let userId: string;
  let huntId: string;
  const puzzleId = Random.id();

  before(async function () {
    await resetDatabase("board documents");
    userId = await Accounts.createUserAsync({
      email: "member@example.com",
      password: "password",
    });
    huntId = await createTestHunt(userId);
  });

  it("accepts a board that belongs to the hunt as a whole", async function () {
    const id = await asUser(userId, () =>
      Documents.insertAsync({
        hunt: huntId,
        provider: "board",
        value: { id: "board1", url: "https://board.example.com/boards/board1" },
      }),
    );
    const doc = await Documents.findOneAsync(id);
    assert.equal(doc?.provider, "board");
    assert.isUndefined(doc?.puzzle);
  });

  it("accepts a board for one puzzle", async function () {
    const id = await asUser(userId, () =>
      Documents.insertAsync({
        hunt: huntId,
        puzzle: puzzleId,
        provider: "board",
        value: { id: "board2", url: "https://board.example.com/boards/board2" },
      }),
    );
    const doc = await Documents.findOneAsync(id);
    assert.equal(doc?.puzzle, puzzleId);
  });

  it("still takes a Google document", async function () {
    const id = await asUser(userId, () =>
      Documents.insertAsync({
        hunt: huntId,
        puzzle: puzzleId,
        provider: "google",
        value: { type: "spreadsheet", id: "sheet" },
      }),
    );
    assert.isDefined(await Documents.findOneAsync(id));
  });

  it("refuses a board without a URL, or with one that isn't http(s)", async function () {
    await assert.isRejected(
      asUser(userId, () =>
        Documents.insertAsync({
          hunt: huntId,
          provider: "board",
          value: { id: "board3" },
        } as any),
      ),
    );
    await assert.isRejected(
      asUser(userId, () =>
        Documents.insertAsync({
          hunt: huntId,
          provider: "board",
          value: { id: "board3", url: "javascript:alert(1)" },
        }),
      ),
    );
  });

  it("refuses a board carrying Google's fields, and an unknown provider", async function () {
    await assert.isRejected(
      asUser(userId, () =>
        Documents.insertAsync({
          hunt: huntId,
          provider: "board",
          value: { type: "spreadsheet", id: "board4" },
        } as any),
      ),
    );
    await assert.isRejected(
      asUser(userId, () =>
        Documents.insertAsync({
          hunt: huntId,
          provider: "etherpad",
          value: { id: "pad" },
        } as any),
      ),
    );
  });
});
