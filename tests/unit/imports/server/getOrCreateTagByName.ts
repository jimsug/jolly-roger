import { Random } from "meteor/random";
import { assert } from "chai";
import Tags from "../../../../imports/lib/models/Tags";
import { MAX_TAG_NAME_LENGTH } from "../../../../imports/lib/tagNames";
import getOrCreateTagByName from "../../../../imports/server/getOrCreateTagByName";
import asUser from "../../../lib/asUser";
import resetDatabase from "../../../lib/resetDatabase";

// Tags record who created them, which needs a method context.
const userId = Random.id();

describe("getOrCreateTagByName", function () {
  this.timeout(30000);

  let huntId: string;
  this.beforeAll(async function () {
    await resetDatabase("getOrCreateTagByName");
    huntId = Random.id();
  });

  it("creates a tag with a normalised name", async function () {
    const tagId = await asUser(userId, () =>
      getOrCreateTagByName(huntId, "  needs:  love "),
    );
    const tag = await Tags.findOneAsync(tagId);
    assert.equal(tag?.name, "needs: love");
    assert.equal(tag?.createdBy, userId);
  });

  it("rejects blank names", async function () {
    await assert.isRejected(
      asUser(userId, () => getOrCreateTagByName(huntId, "   ")),
      /must not be empty/,
    );
  });

  it("returns the existing tag regardless of case and spacing", async function () {
    const tagId = await asUser(userId, () =>
      getOrCreateTagByName(huntId, "Cryptic"),
    );
    assert.equal(
      await asUser(userId, () => getOrCreateTagByName(huntId, "cryptic")),
      tagId,
    );
    assert.equal(
      await asUser(userId, () => getOrCreateTagByName(huntId, " CRYPTIC  ")),
      tagId,
    );
    assert.equal(
      await Tags.find({ hunt: huntId, name: /cryptic/i }).countAsync(),
      1,
    );
  });

  it("prefers an exact match when tags differ only by case", async function () {
    const lower = await asUser(userId, () =>
      getOrCreateTagByName(huntId, "logic"),
    );
    const upperId = await asUser(userId, () =>
      Tags.insertAsync({ hunt: huntId, name: "Logic" }),
    );
    assert.equal(
      await asUser(userId, () => getOrCreateTagByName(huntId, "Logic")),
      upperId,
    );
    assert.equal(
      await asUser(userId, () => getOrCreateTagByName(huntId, "logic")),
      lower,
    );
  });

  it("resolves aliases", async function () {
    const tagId = await asUser(userId, () =>
      getOrCreateTagByName(huntId, "group:round 1"),
    );
    await Tags.updateAsync(tagId, { $set: { aliases: ["group:r1"] } });
    assert.equal(
      await asUser(userId, () => getOrCreateTagByName(huntId, "Group:R1")),
      tagId,
    );
  });

  it("treats regex metacharacters in names literally", async function () {
    const plainId = await asUser(userId, () =>
      getOrCreateTagByName(huntId, "needs:extraction"),
    );
    const questionId = await asUser(userId, () =>
      getOrCreateTagByName(huntId, "needs:extraction?"),
    );
    assert.notEqual(questionId, plainId);
    assert.equal(
      await asUser(userId, () =>
        getOrCreateTagByName(huntId, "needs:extraction?"),
      ),
      questionId,
    );
    const dottedId = await asUser(userId, () =>
      getOrCreateTagByName(huntId, "a.b"),
    );
    assert.notEqual(
      await asUser(userId, () => getOrCreateTagByName(huntId, "axb")),
      dottedId,
    );
  });

  it("is scoped to the hunt", async function () {
    const tagId = await asUser(userId, () =>
      getOrCreateTagByName(huntId, "shared"),
    );
    const otherHuntTagId = await asUser(userId, () =>
      getOrCreateTagByName(Random.id(), "shared"),
    );
    assert.notEqual(otherHuntTagId, tagId);
  });

  it("caps the length of new names but still resolves long existing ones", async function () {
    const longName = `where:${"x".repeat(MAX_TAG_NAME_LENGTH)}`;
    await assert.isRejected(
      asUser(userId, () => getOrCreateTagByName(huntId, longName)),
      /at most/,
    );
    assert.isUndefined(
      await Tags.findOneAsync({ hunt: huntId, name: longName }),
    );

    // A tag written before the cap existed is still found by name
    const legacyId = await asUser(userId, () =>
      Tags.insertAsync({ hunt: huntId, name: longName }),
    );
    assert.equal(
      await asUser(userId, () => getOrCreateTagByName(huntId, longName)),
      legacyId,
    );
    assert.equal(
      await asUser(userId, () =>
        getOrCreateTagByName(huntId, longName.toUpperCase()),
      ),
      legacyId,
    );
  });

  it("refuses a group tag whose meta-for twin would be too long, making neither", async function () {
    // group: is six characters and meta-for: nine
    const value = "r".repeat(MAX_TAG_NAME_LENGTH - "group:".length);
    await assert.isRejected(
      asUser(userId, () => getOrCreateTagByName(huntId, `group:${value}`)),
      /at most/,
    );
    assert.equal(
      await Tags.find({ hunt: huntId, name: { $regex: value } }).countAsync(),
      0,
    );
    // One whose twin fits is fine
    const fits = "f".repeat(MAX_TAG_NAME_LENGTH - "meta-for:".length);
    await asUser(userId, () => getOrCreateTagByName(huntId, `group:${fits}`));
    assert.ok(
      await Tags.findOneAsync({ hunt: huntId, name: `meta-for:${fits}` }),
    );
  });

  it("creates the meta-for twin of a group tag", async function () {
    await asUser(userId, () => getOrCreateTagByName(huntId, "group:Events"));
    const twin = await Tags.findOneAsync({
      hunt: huntId,
      name: "meta-for:Events",
    });
    assert.isDefined(twin);
  });

  it("creates a tag named by a synonym under its canonical name", async function () {
    const tagId = await asUser(userId, () =>
      getOrCreateTagByName(huntId, "loc:atrium"),
    );
    assert.equal((await Tags.findOneAsync(tagId))?.name, "where:atrium");
    assert.isUndefined(
      await Tags.findOneAsync({ hunt: huntId, name: "loc:atrium" }),
    );

    const stuckId = await asUser(userId, () =>
      getOrCreateTagByName(huntId, " stuck "),
    );
    assert.equal((await Tags.findOneAsync(stuckId))?.name, "is:stuck");
  });

  it("matches an existing canonical tag by a synonym", async function () {
    const hunt = huntId;
    const whereId = await asUser(userId, () =>
      getOrCreateTagByName(hunt, "where:library"),
    );
    for (const name of ["loc:library", "location:library", "loc:Library"]) {
      assert.equal(
        await asUser(userId, () => getOrCreateTagByName(hunt, name)),
        whereId,
        name,
      );
    }
    assert.equal(
      await Tags.find({ hunt: huntId, name: /library/i }).countAsync(),
      1,
    );
  });

  it("matches an existing tag still named by a synonym", async function () {
    const hunt = huntId;
    const legacyId = await asUser(userId, () =>
      Tags.insertAsync({ hunt, name: "loc:basement" }),
    );
    for (const name of [
      "loc:basement",
      "where:basement",
      "location:basement",
    ]) {
      assert.equal(
        await asUser(userId, () => getOrCreateTagByName(hunt, name)),
        legacyId,
        name,
      );
    }
    assert.isUndefined(
      await Tags.findOneAsync({ hunt: huntId, name: "where:basement" }),
    );
  });
});
