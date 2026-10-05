import { Accounts } from "meteor/accounts-base";
import { assert } from "chai";
import { GLOBAL_SCOPE } from "../../../../imports/lib/isAdmin";
import applyTagSynonymsJob from "../../../../imports/lib/jobs/applyTagSynonyms";
import Jobs from "../../../../imports/lib/models/Jobs";
import Puzzles from "../../../../imports/lib/models/Puzzles";
import Settings from "../../../../imports/lib/models/Settings";
import Tags from "../../../../imports/lib/models/Tags";
import { addUserToRole } from "../../../../imports/lib/permission_stubs";
import tagSynonymsForHuntApp from "../../../../imports/lib/publications/tagSynonymsForHuntApp";
import {
  canonicalTagName,
  TAG_SYNONYMS,
  type TagSynonymRule,
} from "../../../../imports/lib/tagNames";
import applyTagSynonyms from "../../../../imports/methods/applyTagSynonyms";
import configureTagSynonyms from "../../../../imports/methods/configureTagSynonyms";
import previewTagSynonyms from "../../../../imports/methods/previewTagSynonyms";
import getOrCreateTagByName from "../../../../imports/server/getOrCreateTagByName";
import renameOrMergeTag from "../../../../imports/server/renameOrMergeTag";
import currentTagSynonyms from "../../../../imports/server/tagSynonyms";
import asUser from "../../../lib/asUser";
import createTestHunt from "../../../lib/createTestHunt";
import resetDatabase from "../../../lib/resetDatabase";
import runJob from "../../../lib/runJob";
import StubSubscription, {
  publishHandler,
} from "../../../lib/StubSubscription";
import waitForAssertion from "../../../lib/waitForAssertion";

const ROOMS: TagSynonymRule[] = [
  { kind: "prefix", match: "room:", to: "where:" },
  { kind: "tag", match: "wedged", to: "needs:help" },
];

describe("tag synonyms", function () {
  this.timeout(30000);

  let adminId: string;
  let hunterId: string;

  const asAdmin = <T>(fn: () => Promise<T>) => asUser(adminId, fn);
  const configure = (rules: TagSynonymRule[]) =>
    asAdmin(() => configureTagSynonyms.callPromise({ rules }));
  const waitForTable = (expected: readonly TagSynonymRule[]) =>
    waitForAssertion(() => {
      assert.deepEqual(currentTagSynonyms(), expected);
    });
  const tagNames = async (huntId: string) =>
    (await Tags.find({ hunt: huntId }).fetchAsync()).map((tag) => tag.name);

  beforeEach(async function () {
    await resetDatabase("tag synonyms");
    await waitForTable(TAG_SYNONYMS);
    adminId = await Accounts.createUserAsync({
      email: "admin@example.com",
      password: "password",
    });
    await addUserToRole(adminId, GLOBAL_SCOPE, "admin");
    hunterId = await Accounts.createUserAsync({
      email: "hunter@example.com",
      password: "password",
    });
  });

  after(async function () {
    await Settings.removeAsync({ name: "tag.synonyms" });
    await waitForTable(TAG_SYNONYMS);
  });

  describe("the effective table", function () {
    it("follows the setting as it's saved, changed and removed", async function () {
      await configure(ROOMS);
      await waitForTable(ROOMS);
      assert.equal(
        canonicalTagName("room:atrium", currentTagSynonyms()),
        "where:atrium",
      );
      assert.equal(
        canonicalTagName("loc:atrium", currentTagSynonyms()),
        "loc:atrium",
      );

      await configure([]);
      await waitForTable([]);
      assert.equal(canonicalTagName("stuck", currentTagSynonyms()), "stuck");

      await Settings.removeAsync({ name: "tag.synonyms" });
      await waitForTable(TAG_SYNONYMS);
      assert.equal(
        canonicalTagName("loc:atrium", currentTagSynonyms()),
        "where:atrium",
      );
    });

    it("is what getOrCreateTagByName files new tags under", async function () {
      const huntId = await createTestHunt(adminId);
      await configure(ROOMS);
      await waitForTable(ROOMS);

      const roomId = await asAdmin(() =>
        getOrCreateTagByName(huntId, "room:atrium"),
      );
      assert.equal((await Tags.findOneAsync(roomId))?.name, "where:atrium");
      assert.equal(
        await asAdmin(() => getOrCreateTagByName(huntId, "where:atrium")),
        roomId,
      );
      const wedgedId = await asAdmin(() =>
        getOrCreateTagByName(huntId, "wedged"),
      );
      assert.equal((await Tags.findOneAsync(wedgedId))?.name, "needs:help");
      // The built-in rules are gone with a table of its own
      const locId = await asAdmin(() =>
        getOrCreateTagByName(huntId, "loc:foyer"),
      );
      assert.equal((await Tags.findOneAsync(locId))?.name, "loc:foyer");
    });
  });

  describe("configureTagSynonyms", function () {
    it("saves the table with its names normalised", async function () {
      await configure([{ kind: "prefix", match: " room: ", to: "where:" }]);
      const setting = await Settings.findOneAsync({ name: "tag.synonyms" });
      assert.deepEqual(setting?.value, {
        rules: [{ kind: "prefix", match: "room:", to: "where:" }],
      });
    });

    it("refuses non-admins", async function () {
      await assert.isRejected(
        asUser(hunterId, () =>
          configureTagSynonyms.callPromise({ rules: ROOMS }),
        ),
        /Must be admin/,
      );
      assert.isUndefined(await Settings.findOneAsync({ name: "tag.synonyms" }));
    });

    it("refuses an invalid table and leaves the setting alone", async function () {
      await configure(ROOMS);
      const invalid: [TagSynonymRule[], RegExp][] = [
        [[{ kind: "tag", match: " ", to: "x" }], /Rule 1 needs both/],
        [[{ kind: "prefix", match: "room", to: "where:" }], /end in ':'/],
        [[{ kind: "tag", match: "x", to: "x" }], /to itself/],
        [
          [{ kind: "prefix", match: "round:", to: "group:" }],
          /Rule 1 rewrites into or out of group:, meta-for: or is:/,
        ],
        [
          [
            { kind: "prefix", match: "room:", to: "where:" },
            { kind: "tag", match: "is:meta", to: "meta" },
          ],
          /Rule 2 rewrites into or out of/,
        ],
        [
          [
            { kind: "prefix", match: "room:", to: "where:" },
            { kind: "prefix", match: "where:", to: "place:" },
          ],
          /Rule 1 has a canonical name that another rule rewrites/,
        ],
        [
          [
            { kind: "prefix", match: "room:", to: "where:" },
            { kind: "tag", match: "where:x", to: "x" },
          ],
          /Rule 1 has a canonical name that another rule rewrites/,
        ],
        [
          [
            { kind: "tag", match: "x", to: "y" },
            { kind: "tag", match: "x", to: "z" },
          ],
          /Rule 2 repeats/,
        ],
      ];
      for (const [rules, message] of invalid) {
        await assert.isRejected(configure(rules), message);
      }
      assert.deepEqual(
        (await Settings.findOneAsync({ name: "tag.synonyms" }))?.value,
        { rules: ROOMS },
      );
    });
  });

  describe("resetting to the built-in rules", function () {
    it("removes the saved table, so the built-in one applies", async function () {
      await configure([]);
      await waitForTable([]);

      await assert.isRejected(
        asUser(hunterId, () =>
          configureTagSynonyms.callPromise({ rules: [], reset: true }),
        ),
        /Must be admin/,
      );
      assert.ok(await Settings.findOneAsync({ name: "tag.synonyms" }));

      await asAdmin(() =>
        configureTagSynonyms.callPromise({ rules: ROOMS, reset: true }),
      );
      assert.isUndefined(await Settings.findOneAsync({ name: "tag.synonyms" }));
      await waitForTable(TAG_SYNONYMS);
      assert.equal(
        canonicalTagName("loc:atrium", currentTagSynonyms()),
        "where:atrium",
      );
    });
  });

  describe("applying the table to existing tags", function () {
    let huntId: string;
    let otherHuntId: string;

    // Tags written straight to the database, as they would be before a rule
    // existed
    const insertTag = (hunt: string, name: string, aliases?: string[]) =>
      asAdmin(() =>
        Tags.insertAsync({ hunt, name, ...(aliases ? { aliases } : {}) }),
      );
    const insertPuzzle = (hunt: string, tags: string[]) =>
      asAdmin(() =>
        Puzzles.insertAsync({
          hunt,
          title: "Puzzle",
          tags,
          answers: [],
          expectedAnswerCount: 1,
        }),
      );

    beforeEach(async function () {
      huntId = await createTestHunt(adminId, { name: "First hunt" });
      otherHuntId = await createTestHunt(adminId, { name: "Second hunt" });
    });

    it("previews what would change, per hunt", async function () {
      await insertTag(huntId, "loc:atrium");
      await insertTag(huntId, "where:atrium");
      await insertTag(huntId, "location:foyer");
      await insertTag(huntId, "cryptic");
      await insertTag(otherHuntId, "stuck");
      const untouched = await createTestHunt(adminId, { name: "Tidy hunt" });
      await insertTag(untouched, "where:cellar");

      const preview = await asAdmin(() => previewTagSynonyms.callPromise());
      assert.sameDeepMembers(preview, [
        { huntId, huntName: "First hunt", renamed: 1, merged: 1 },
        { huntId: otherHuntId, huntName: "Second hunt", renamed: 1, merged: 0 },
      ]);
      assert.sameMembers(await tagNames(huntId), [
        "loc:atrium",
        "where:atrium",
        "location:foyer",
        "cryptic",
      ]);
    });

    it("renames and merges, keeping old names as aliases", async function () {
      const loc = await insertTag(huntId, "loc:atrium", ["atrium"]);
      const where = await insertTag(huntId, "where:atrium");
      const foyer = await insertTag(huntId, "location:foyer");
      const cryptic = await insertTag(huntId, "cryptic");
      const stuck = await insertTag(otherHuntId, "stuck");
      const locPuzzle = await insertPuzzle(huntId, [loc, cryptic]);
      const wherePuzzle = await insertPuzzle(huntId, [where]);

      await runJob(applyTagSynonymsJob, {}, { userId: adminId });

      assert.isUndefined(await Tags.findOneAsync(loc), "merged away");
      const merged = await Tags.findOneAsync(where);
      assert.equal(merged?.name, "where:atrium");
      assert.sameMembers(merged?.aliases ?? [], ["atrium", "loc:atrium"]);
      const renamed = await Tags.findOneAsync(foyer);
      assert.equal(renamed?.name, "where:foyer");
      assert.deepEqual(renamed?.aliases, ["location:foyer"]);
      assert.equal((await Tags.findOneAsync(stuck))?.name, "is:stuck");

      const unrelated = await Tags.findOneAsync(cryptic);
      assert.equal(unrelated?.name, "cryptic");
      assert.isUndefined(unrelated?.aliases);
      assert.sameMembers((await Puzzles.findOneAsync(locPuzzle))?.tags ?? [], [
        where,
        cryptic,
      ]);
      assert.sameMembers(
        (await Puzzles.findOneAsync(wherePuzzle))?.tags ?? [],
        [where],
      );

      // The old name now resolves to the merged tag
      assert.equal(
        await asAdmin(() => getOrCreateTagByName(huntId, "loc:atrium")),
        where,
      );
      assert.deepEqual(
        await asAdmin(() => previewTagSynonyms.callPromise()),
        [],
        "nothing is left to change",
      );
    });

    it("leaves no puzzle on a tag destroyed by merges made at the same time", async function () {
      const alpha = await insertTag(huntId, "alpha");
      const beta = await insertTag(huntId, "beta");
      await insertTag(huntId, "gamma");
      const puzzles = [
        await insertPuzzle(huntId, [alpha]),
        await insertPuzzle(huntId, [beta]),
      ];
      // alpha into beta while beta goes into gamma
      await Promise.all([
        renameOrMergeTag((await Tags.findOneAsync(alpha))!, "beta", false),
        renameOrMergeTag((await Tags.findOneAsync(beta))!, "gamma", false),
      ]);

      const live = new Set(
        (await Tags.find({ hunt: huntId }).fetchAsync()).map((t) => t._id),
      );
      for (const id of puzzles) {
        const tags = (await Puzzles.findOneAsync(id))?.tags ?? [];
        assert.isNotEmpty(tags);
        tags.forEach((tag) => assert.isTrue(live.has(tag), tag));
      }
    });

    it("applies the saved table rather than the built-in one", async function () {
      await configure(ROOMS);
      await waitForTable(ROOMS);
      const room = await insertTag(huntId, "room:atrium");
      const loc = await insertTag(huntId, "loc:foyer");

      await runJob(applyTagSynonymsJob, {}, { userId: adminId });

      assert.equal((await Tags.findOneAsync(room))?.name, "where:atrium");
      assert.equal((await Tags.findOneAsync(loc))?.name, "loc:foyer");
    });

    it("queues one job at a time, for admins only", async function () {
      await assert.isRejected(
        asUser(hunterId, () => applyTagSynonyms.callPromise()),
        /Must be admin/,
      );
      await assert.isRejected(
        asUser(hunterId, () => previewTagSynonyms.callPromise()),
        /Must be admin/,
      );

      await asAdmin(() => applyTagSynonyms.callPromise());
      const job = await Jobs.findOneAsync({ type: applyTagSynonymsJob.name });
      assert.equal(job?.status, "pending");
      assert.equal(job?.createdBy, adminId);
      await assert.isRejected(
        asAdmin(() => applyTagSynonyms.callPromise()),
        /already being applied/,
      );

      await Jobs.updateAsync(job!._id, { $set: { status: "running" } });
      await assert.isRejected(
        asAdmin(() => applyTagSynonyms.callPromise()),
        /already being applied/,
      );

      await Jobs.updateAsync(job!._id, { $set: { status: "completed" } });
      await asAdmin(() => applyTagSynonyms.callPromise());
      assert.equal(
        await Jobs.find({ type: applyTagSynonymsJob.name }).countAsync(),
        2,
      );
    });

    it("queues only one job for calls made at the same time", async function () {
      const results = await asAdmin(() =>
        Promise.allSettled([
          applyTagSynonyms.callPromise(),
          applyTagSynonyms.callPromise(),
        ]),
      );
      assert.sameMembers(
        results.map((r) => r.status),
        ["fulfilled", "rejected"],
      );
      assert.equal(
        await Jobs.find({ type: applyTagSynonymsJob.name }).countAsync(),
        1,
      );
    });
  });

  describe("tagSynonymsForHuntApp", function () {
    const handler = () => publishHandler(tagSynonymsForHuntApp.name);

    it("sends the setting to anyone logged in", async function () {
      await configure(ROOMS);
      const cursor = await handler().call(new StubSubscription(hunterId));
      const docs = await cursor.fetchAsync();
      assert.lengthOf(docs, 1);
      assert.deepEqual(docs[0].value, { rules: ROOMS });
      assert.isUndefined(docs[0].createdBy);
    });

    it("sends nothing to someone logged out", async function () {
      await configure(ROOMS);
      assert.deepEqual(await handler().call(new StubSubscription(null)), []);
    });
  });
});
