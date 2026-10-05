import { Accounts } from "meteor/accounts-base";
import type { Mongo } from "meteor/mongo";
import { assert } from "chai";
import { GLOBAL_SCOPE } from "../../../../imports/lib/isAdmin";
import MeteorUsers from "../../../../imports/lib/models/MeteorUsers";
import Puzzles from "../../../../imports/lib/models/Puzzles";
import asUser from "../../../lib/asUser";
import createTestHunt from "../../../lib/createTestHunt";
import resetDatabase from "../../../lib/resetDatabase";
import StubSubscription, {
  publishHandler,
} from "../../../lib/StubSubscription";

describe("deleted puzzles in the puzzle publications", function () {
  this.timeout(30000);

  let huntId: string;
  let adminId: string;
  let operatorId: string;
  let liveId: string;
  let deletedId: string;

  before(async function () {
    await resetDatabase("deleted puzzles in the puzzle publications");
    adminId = await Accounts.createUserAsync({
      email: "admin@example.com",
      password: "password",
    });
    operatorId = await Accounts.createUserAsync({
      email: "operator@example.com",
      password: "password",
    });
    huntId = await createTestHunt(adminId);
    await MeteorUsers.updateAsync(adminId, {
      $set: { hunts: [huntId], roles: { [GLOBAL_SCOPE]: ["admin"] } },
    });
    await MeteorUsers.updateAsync(operatorId, {
      $set: { hunts: [huntId], roles: { [huntId]: ["operator"] } },
    });
    const puzzle = (title: string) =>
      asUser(adminId, () =>
        Puzzles.insertAsync({
          hunt: huntId,
          title,
          tags: [],
          answers: [],
          expectedAnswerCount: 1,
        }),
      );
    liveId = await puzzle("Live");
    deletedId = await puzzle("Deleted");
    await Puzzles.destroyAsync(deletedId);
  });

  type PuzzleCursor = Mongo.Cursor<{ _id: string }>;

  // The ids of the puzzles a publication sends userId when asked for deleted
  // puzzles
  const publishedPuzzles = async (
    name: string,
    userId: string,
    puzzleCursor: (result: unknown) => PuzzleCursor,
  ) => {
    const sub = new StubSubscription(userId);
    try {
      const result = await publishHandler(name).call(sub, {
        huntId,
        includeDeleted: true,
      });
      const puzzles = await puzzleCursor(result).fetchAsync();
      return puzzles.map((p) => p._id);
    } finally {
      sub.stop();
    }
  };

  const forPuzzleList = (userId: string) =>
    publishedPuzzles(
      "Puzzles.publications.forPuzzleList",
      userId,
      (result) => (result as PuzzleCursor[])[0]!,
    );

  const forHunt = (userId: string) =>
    publishedPuzzles(
      "Puzzles.publications.forHunt",
      userId,
      (result) => result as PuzzleCursor,
    );

  describe("puzzlesForPuzzleList", function () {
    it("sends deleted puzzles to a global admin who asks for them", async function () {
      assert.sameMembers(await forPuzzleList(adminId), [liveId, deletedId]);
    });

    it("leaves deleted puzzles out for an operator, even when asked", async function () {
      assert.sameMembers(await forPuzzleList(operatorId), [liveId]);
    });
  });

  describe("puzzlesForHunt", function () {
    it("sends deleted puzzles to a global admin who asks for them", async function () {
      assert.sameMembers(await forHunt(adminId), [liveId, deletedId]);
    });

    it("leaves deleted puzzles out for an operator, even when asked", async function () {
      assert.sameMembers(await forHunt(operatorId), [liveId]);
    });
  });
});
