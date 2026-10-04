import { Accounts } from "meteor/accounts-base";
import { Random } from "meteor/random";
import { assert } from "chai";
import FixtureHunt from "../../../../imports/FixtureHunt";
import MeteorUsers from "../../../../imports/lib/models/MeteorUsers";
import Puzzles from "../../../../imports/lib/models/Puzzles";
import Tags from "../../../../imports/lib/models/Tags";
import addPuzzleTag from "../../../../imports/methods/addPuzzleTag";
import removeTagAlias from "../../../../imports/methods/removeTagAlias";
import makeFixtureHunt from "../../../../imports/server/makeFixtureHunt";
import asUser from "../../../lib/asUser";
import resetDatabase from "../../../lib/resetDatabase";

const huntId = FixtureHunt._id;

describe("removeTagAlias", function () {
  this.timeout(30000);

  let member: string;
  let hunter: string;
  let outsider: string;
  let puzzleId: string;
  let tagId: string;

  before(async function () {
    await resetDatabase("removeTagAlias");
    member = await Accounts.createUserAsync({
      email: "member@example.com",
      password: "password",
    });
    hunter = await Accounts.createUserAsync({
      email: "hunter@example.com",
      password: "password",
    });
    outsider = await Accounts.createUserAsync({
      email: "outsider@example.com",
      password: "password",
    });
    await MeteorUsers.updateAsync(member, {
      $set: { hunts: [huntId], roles: { [huntId]: ["operator"] } },
    });
    await MeteorUsers.updateAsync(hunter, { $set: { hunts: [huntId] } });
    await makeFixtureHunt(member);
    puzzleId = (await Puzzles.findOneAsync({
      hunt: huntId,
      kind: { $ne: "whiteboard" },
    }))!._id;
  });

  beforeEach(async function () {
    tagId = await asUser(member, () =>
      Tags.insertAsync({
        hunt: huntId,
        name: `needs:extraction ${Random.id()}`,
        aliases: ["needs: extraction", "extract me", "needs extraction"],
      }),
    );
  });

  afterEach(async function () {
    await Tags.removeAsync({ hunt: huntId, name: /extract/ });
    await Puzzles.updateAsync(puzzleId, { $set: { tags: [] } });
  });

  it("removes just that alias", async function () {
    await asUser(member, () =>
      removeTagAlias.callPromise({ tagId, alias: "extract me" }),
    );
    assert.deepEqual((await Tags.findOneAsync(tagId))?.aliases, [
      "needs: extraction",
      "needs extraction",
    ]);
  });

  it("stops the removed alias resolving to the tag, but not the others", async function () {
    await asUser(member, () =>
      removeTagAlias.callPromise({ tagId, alias: "extract me" }),
    );

    await asUser(member, () =>
      addPuzzleTag.callPromise({ puzzleId, tagName: "Needs: Extraction" }),
    );
    assert.deepEqual((await Puzzles.findOneAsync(puzzleId))?.tags, [tagId]);

    await asUser(member, () =>
      addPuzzleTag.callPromise({ puzzleId, tagName: "extract me" }),
    );
    const fresh = await Tags.findOneAsync({ hunt: huntId, name: "extract me" });
    assert.ok(fresh, "Adding the removed alias makes a tag of its own");
    assert.notEqual(fresh._id, tagId);
    assert.sameMembers((await Puzzles.findOneAsync(puzzleId))?.tags ?? [], [
      tagId,
      fresh._id,
    ]);
  });

  it("lets a hunt member without a role remove an alias", async function () {
    await asUser(hunter, () =>
      removeTagAlias.callPromise({ tagId, alias: "extract me" }),
    );
    assert.notInclude(
      (await Tags.findOneAsync(tagId))?.aliases ?? [],
      "extract me",
    );
  });

  it("refuses a call with no user", async function () {
    await assert.isRejected(
      removeTagAlias.callPromise({ tagId, alias: "extract me" }),
      /Match/,
    );
    assert.lengthOf((await Tags.findOneAsync(tagId))?.aliases ?? [], 3);
  });

  it("refuses someone outside the hunt", async function () {
    await assert.isRejected(
      asUser(outsider, () =>
        removeTagAlias.callPromise({ tagId, alias: "extract me" }),
      ),
      /not a member/,
    );
    assert.include(
      (await Tags.findOneAsync(tagId))?.aliases ?? [],
      "extract me",
    );
  });

  it("refuses an unknown tag", async function () {
    await assert.isRejected(
      asUser(member, () =>
        removeTagAlias.callPromise({ tagId: Random.id(), alias: "extract me" }),
      ),
      /No tag known/,
    );
  });

  it("refuses an alias the tag doesn't have, matching exactly", async function () {
    await assert.isRejected(
      asUser(member, () =>
        removeTagAlias.callPromise({ tagId, alias: "Extract Me" }),
      ),
      /has no alias/,
    );
    assert.lengthOf((await Tags.findOneAsync(tagId))?.aliases ?? [], 3);
  });

  it("refuses arguments of the wrong shape", async function () {
    await assert.isRejected(
      asUser(member, () =>
        removeTagAlias.callPromise({
          tagId,
          alias: ["extract me"],
        } as unknown as { tagId: string; alias: string }),
      ),
      /Match/,
    );
  });
});
