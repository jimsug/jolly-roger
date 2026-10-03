import { DDP } from "meteor/ddp";
import { Random } from "meteor/random";
import { assert } from "chai";
import Tags from "../../../../imports/lib/models/Tags";
import { MAX_TAG_NAME_LENGTH } from "../../../../imports/lib/tagNames";
import getOrCreateTagByName from "../../../../imports/server/getOrCreateTagByName";
import resetDatabase from "../../../lib/resetDatabase";

// Tags record who created them, which needs a method context.
const userId = Random.id();
const asUser = <T>(fn: () => Promise<T>) =>
  DDP._CurrentMethodInvocation.withValue({ userId }, fn);

describe("getOrCreateTagByName", function () {
  this.timeout(30000);

  let huntId: string;
  this.beforeAll(async function () {
    await resetDatabase("getOrCreateTagByName");
    huntId = Random.id();
  });

  it("creates a tag with a normalised name", async function () {
    const tagId = await asUser(() =>
      getOrCreateTagByName(huntId, "  needs:  love "),
    );
    const tag = await Tags.findOneAsync(tagId);
    assert.equal(tag?.name, "needs: love");
    assert.equal(tag?.createdBy, userId);
  });

  it("rejects blank names", async function () {
    await assert.isRejected(
      asUser(() => getOrCreateTagByName(huntId, "   ")),
      /must not be empty/,
    );
  });

  it("returns the existing tag regardless of case and spacing", async function () {
    const tagId = await asUser(() => getOrCreateTagByName(huntId, "Cryptic"));
    assert.equal(
      await asUser(() => getOrCreateTagByName(huntId, "cryptic")),
      tagId,
    );
    assert.equal(
      await asUser(() => getOrCreateTagByName(huntId, " CRYPTIC  ")),
      tagId,
    );
    assert.equal(
      await Tags.find({ hunt: huntId, name: /cryptic/i }).countAsync(),
      1,
    );
  });

  it("prefers an exact match when tags differ only by case", async function () {
    const lower = await asUser(() => getOrCreateTagByName(huntId, "logic"));
    const upperId = await asUser(() =>
      Tags.insertAsync({ hunt: huntId, name: "Logic" }),
    );
    assert.equal(
      await asUser(() => getOrCreateTagByName(huntId, "Logic")),
      upperId,
    );
    assert.equal(
      await asUser(() => getOrCreateTagByName(huntId, "logic")),
      lower,
    );
  });

  it("resolves aliases", async function () {
    const tagId = await asUser(() =>
      getOrCreateTagByName(huntId, "group:round 1"),
    );
    await Tags.updateAsync(tagId, { $set: { aliases: ["group:r1"] } });
    assert.equal(
      await asUser(() => getOrCreateTagByName(huntId, "Group:R1")),
      tagId,
    );
  });

  it("treats regex metacharacters in names literally", async function () {
    const plainId = await asUser(() =>
      getOrCreateTagByName(huntId, "needs:extraction"),
    );
    const questionId = await asUser(() =>
      getOrCreateTagByName(huntId, "needs:extraction?"),
    );
    assert.notEqual(questionId, plainId);
    assert.equal(
      await asUser(() => getOrCreateTagByName(huntId, "needs:extraction?")),
      questionId,
    );
    const dottedId = await asUser(() => getOrCreateTagByName(huntId, "a.b"));
    assert.notEqual(
      await asUser(() => getOrCreateTagByName(huntId, "axb")),
      dottedId,
    );
  });

  it("is scoped to the hunt", async function () {
    const tagId = await asUser(() => getOrCreateTagByName(huntId, "shared"));
    const otherHuntTagId = await asUser(() =>
      getOrCreateTagByName(Random.id(), "shared"),
    );
    assert.notEqual(otherHuntTagId, tagId);
  });

  it("caps the length of new names but still resolves long existing ones", async function () {
    const longName = `where:${"x".repeat(MAX_TAG_NAME_LENGTH)}`;
    await assert.isRejected(
      asUser(() => getOrCreateTagByName(huntId, longName)),
      /at most/,
    );
    assert.isUndefined(
      await Tags.findOneAsync({ hunt: huntId, name: longName }),
    );

    // A tag written before the cap existed is still found by name
    const legacyId = await asUser(() =>
      Tags.insertAsync({ hunt: huntId, name: longName }),
    );
    assert.equal(
      await asUser(() => getOrCreateTagByName(huntId, longName)),
      legacyId,
    );
    assert.equal(
      await asUser(() => getOrCreateTagByName(huntId, longName.toUpperCase())),
      legacyId,
    );
  });

  it("creates the meta-for twin of a group tag", async function () {
    await asUser(() => getOrCreateTagByName(huntId, "group:Events"));
    const twin = await Tags.findOneAsync({
      hunt: huntId,
      name: "meta-for:Events",
    });
    assert.isDefined(twin);
  });
});
