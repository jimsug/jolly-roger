import { Accounts } from "meteor/accounts-base";
import { DDP } from "meteor/ddp";
import { assert } from "chai";
import sinon from "sinon";
import purgeHuntJob from "../../../../imports/lib/jobs/purgeHunt";
import CachedDocuments from "../../../../imports/lib/models/CachedDocuments";
import Documents from "../../../../imports/lib/models/Documents";
import FeatureFlags from "../../../../imports/lib/models/FeatureFlags";
import Hunts from "../../../../imports/lib/models/Hunts";
import MeteorUsers from "../../../../imports/lib/models/MeteorUsers";
import Puzzles from "../../../../imports/lib/models/Puzzles";
import { addUserToRole } from "../../../../imports/lib/permission_stubs";
import purgeHuntDocumentCache from "../../../../imports/methods/purgeHuntDocumentCache";
import updatePuzzle from "../../../../imports/methods/updatePuzzle";
import addPuzzle from "../../../../imports/server/addPuzzle";
import {
  cachedDocumentName,
  DOCUMENT_CACHE_SWEEP_WINDOW_MS,
  DOCUMENT_CACHE_TARGETS,
  documentCacheSettings,
  replenishAllDocumentCaches,
  replenishDocumentCache,
  waitForDocumentCacheIdle,
} from "../../../../imports/server/documentCache";
import { ensureHuntFolder } from "../../../../imports/server/gdrive";
import installFakeGoogleClient from "../../../lib/fakeGoogleClient";
import resetDatabase from "../../../lib/resetDatabase";
import runJob from "../../../lib/runJob";
import waitForAssertion from "../../../lib/waitForAssertion";

const SHEET_MIME = "application/vnd.google-apps.spreadsheet";
const DOC_MIME = "application/vnd.google-apps.document";

type CachedType = keyof typeof DOCUMENT_CACHE_TARGETS;

describe("document cache", function () {
  this.timeout(30000);

  let huntId: string;
  let folderId: string;
  let adminId: string;
  let memberId: string;
  let fake: ReturnType<typeof installFakeGoogleClient>;
  const savedDelays = { ...documentCacheSettings };

  const asUser = <T>(userId: string, fn: () => Promise<T>) =>
    DDP._CurrentMethodInvocation.withValue({ userId }, fn);
  const asAdmin = <T>(fn: () => Promise<T>) => asUser(adminId, fn);

  const availableCount = (type: CachedType) =>
    CachedDocuments.find({
      hunt: huntId,
      status: "available",
      "value.type": type,
    }).countAsync();

  const insertCached = (
    type: CachedType,
    id: string,
    {
      createdAt = new Date(),
      status = "available",
    }: { createdAt?: Date; status?: "available" | "claimed" } = {},
  ) =>
    CachedDocuments.insertAsync({
      hunt: huntId,
      status,
      provider: "google",
      value: { type, id, folder: folderId },
      createdBy: adminId,
      createdAt,
    });

  const insertHunt = (name: string, isArchived = false) =>
    asAdmin(() =>
      Hunts.insertAsync({
        name,
        mailingLists: [],
        openSignups: false,
        hasGuessQueue: true,
        defaultRoles: [],
        allowUnlockablePuzzles: false,
        isArchived,
        customLinkEmbed: false,
      }),
    );

  const insertPuzzle = (hunt: string, createdAt = new Date()) =>
    asAdmin(() =>
      Puzzles.insertAsync({
        hunt,
        title: "A puzzle",
        tags: [],
        answers: [],
        expectedAnswerCount: 1,
        createdAt,
        updatedAt: createdAt,
      }),
    );

  const createdFiles = (mimeType: string) =>
    fake.drive.files.create
      .getCalls()
      .filter((call) => call.args[0].requestBody.mimeType === mimeType);

  const createPuzzle = (title: string, docType: CachedType = "spreadsheet") =>
    asAdmin(() =>
      addPuzzle({
        huntId,
        title,
        tags: [],
        expectedAnswerCount: 1,
        docType,
      }),
    );

  // Creating a puzzle refills the cache in the background; a test that does
  // so waits for that to land so it can't spill into the next test.
  const awaitRefill = () =>
    waitForAssertion(async () => {
      assert.equal(
        await availableCount("spreadsheet"),
        DOCUMENT_CACHE_TARGETS.spreadsheet,
      );
      assert.equal(
        await availableCount("document"),
        DOCUMENT_CACHE_TARGETS.document,
      );
    }, 5000);

  this.beforeAll(async function () {
    await resetDatabase("document cache");
    adminId = await Accounts.createUserAsync({
      email: "admin@example.com",
      password: "password",
    });
    await addUserToRole(adminId, "__GLOBAL__", "admin");
    memberId = await Accounts.createUserAsync({
      email: "member@example.com",
      password: "password",
    });
    huntId = await insertHunt("Cached hunt");
    await MeteorUsers.updateAsync(
      { _id: { $in: [adminId, memberId] } },
      { $set: { hunts: [huntId] } },
      { multi: true },
    );

    documentCacheSettings.creationDelayMs = 0;
    documentCacheSettings.deletionDelayMs = 0;
    fake = installFakeGoogleClient();
    folderId = await ensureHuntFolder({ _id: huntId, name: "Cached hunt" });
  });

  this.afterAll(async function () {
    await waitForDocumentCacheIdle();
    fake.uninstall();
    Object.assign(documentCacheSettings, savedDelays);
  });

  this.beforeEach(async function () {
    await waitForDocumentCacheIdle();
    await CachedDocuments.removeAsync({});
    await Documents.removeAsync({});
    await Puzzles.removeAsync({});
    await FeatureFlags.removeAsync({});
    await Hunts.updateAsync(huntId, { $set: { isArchived: false } });
    // Fresh stubs for each test
    fake.uninstall();
    fake = installFakeGoogleClient();
  });

  it("fills an empty cache to its targets with placeholders in the hunt folder", async function () {
    await replenishDocumentCache(huntId);

    assert.equal(
      await availableCount("spreadsheet"),
      DOCUMENT_CACHE_TARGETS.spreadsheet,
    );
    assert.equal(
      await availableCount("document"),
      DOCUMENT_CACHE_TARGETS.document,
    );
    for (const cached of await CachedDocuments.find({
      hunt: huntId,
    }).fetchAsync()) {
      assert.equal(
        cached.createdBy,
        adminId,
        "the oldest admin is the creator",
      );
      assert.equal(cached.value.folder, folderId);
    }

    const sheets = createdFiles(SHEET_MIME);
    assert.lengthOf(sheets, DOCUMENT_CACHE_TARGETS.spreadsheet);
    assert.isTrue(
      sheets.every(
        (call) =>
          call.args[0].requestBody.name === cachedDocumentName("spreadsheet"),
      ),
    );
    const docs = createdFiles(DOC_MIME);
    assert.lengthOf(docs, DOCUMENT_CACHE_TARGETS.document);
    assert.equal(
      docs[0]!.args[0].requestBody.name,
      cachedDocumentName("document"),
    );
    // Placeholders are set up like any other document
    assert.equal(
      fake.sheets.spreadsheets.batchUpdate.callCount,
      DOCUMENT_CACHE_TARGETS.spreadsheet,
      "external URL access is enabled on each sheet",
    );
    assert.equal(
      fake.drive.permissions.create.callCount,
      DOCUMENT_CACHE_TARGETS.spreadsheet + DOCUMENT_CACHE_TARGETS.document,
      "each placeholder is shared",
    );

    // A full cache is left alone
    const created = fake.drive.files.create.callCount;
    await replenishDocumentCache(huntId);
    assert.equal(fake.drive.files.create.callCount, created);
  });

  it("tops a type up only once it has fallen well below its target", async function () {
    for (let i = 0; i < 12; i++) {
      await insertCached("spreadsheet", `sheet-${i}`);
    }
    await insertCached("document", "doc-0");
    await replenishDocumentCache(huntId);
    assert.equal(fake.drive.files.create.callCount, 0, "12 of 15 will do");

    await CachedDocuments.removeAsync({ "value.id": "sheet-0" });
    await replenishDocumentCache(huntId);
    assert.lengthOf(createdFiles(SHEET_MIME), 4);
    assert.lengthOf(createdFiles(DOC_MIME), 0);
    assert.equal(await availableCount("spreadsheet"), 15);

    // The single document is replaced as soon as it is used
    await CachedDocuments.removeAsync({ "value.id": "doc-0" });
    await replenishDocumentCache(huntId);
    assert.lengthOf(createdFiles(DOC_MIME), 1);
    assert.equal(await availableCount("document"), 1);
  });

  it("does nothing for an archived hunt or without Google", async function () {
    await Hunts.updateAsync(huntId, { $set: { isArchived: true } });
    await replenishDocumentCache(huntId);
    assert.equal(await CachedDocuments.find({ hunt: huntId }).countAsync(), 0);
    await Hunts.updateAsync(huntId, { $set: { isArchived: false } });

    await FeatureFlags.upsertAsync(
      { name: "disable.google" },
      { $set: { type: "on", createdBy: adminId } },
    );
    await replenishDocumentCache(huntId);
    assert.equal(await CachedDocuments.find({ hunt: huntId }).countAsync(), 0);
    await FeatureFlags.removeAsync({});

    fake.uninstall();
    await replenishDocumentCache(huntId);
    assert.equal(await CachedDocuments.find({ hunt: huntId }).countAsync(), 0);
    fake = installFakeGoogleClient();
    assert.equal(fake.drive.files.create.callCount, 0);
  });

  it("claims the oldest cached file for a new puzzle, renames it and refills", async function () {
    const now = Date.now();
    await insertCached("spreadsheet", "sheet-newest", {
      createdAt: new Date(now - 1000),
    });
    await insertCached("spreadsheet", "sheet-oldest", {
      createdAt: new Date(now - 3000),
    });
    await insertCached("spreadsheet", "sheet-middle", {
      createdAt: new Date(now - 2000),
    });

    const puzzleId = await createPuzzle("Claimed puzzle");

    const doc = await Documents.findOneAsync({ puzzle: puzzleId });
    assert.equal(doc?.value.id, "sheet-oldest");
    assert.equal(doc?.value.type, "spreadsheet");
    assert.equal(doc?.value.folder, folderId);
    assert.isUndefined(
      await CachedDocuments.findOneAsync({ "value.id": "sheet-oldest" }),
    );
    assert.isFalse(
      fake.drive.files.create
        .getCalls()
        .some((call) => call.args[0].requestBody.name === "↔️ Claimed puzzle"),
      "no file is created when one can be claimed",
    );
    await waitForAssertion(() => {
      assert.isTrue(
        fake.drive.files.update.calledWithMatch({
          fileId: "sheet-oldest",
          requestBody: { name: "↔️ Claimed puzzle" },
        }),
      );
    });

    // Creating the puzzle triggers a refill around the two that are left
    await awaitRefill();
    assert.isDefined(
      await CachedDocuments.findOneAsync({ "value.id": "sheet-middle" }),
    );
    assert.isDefined(
      await CachedDocuments.findOneAsync({ "value.id": "sheet-newest" }),
    );
  });

  it("creates a file on the spot when the cache has none of that type", async function () {
    const puzzleId = await createPuzzle("Doc puzzle", "document");

    const call = fake.drive.files.create
      .getCalls()
      .find((c) => c.args[0].requestBody.name === "↔️ Doc puzzle");
    assert.isDefined(call);
    assert.equal(call.args[0].requestBody.mimeType, DOC_MIME);
    const { data } = await call.returnValue;
    const doc = await Documents.findOneAsync({ puzzle: puzzleId });
    assert.equal(doc?.value.id, data.id);
    assert.equal(doc?.value.type, "document");

    await awaitRefill();
  });

  it("renames the file under the same scheme when the puzzle is renamed", async function () {
    const puzzleId = await createPuzzle("Before");
    const doc = (await Documents.findOneAsync({ puzzle: puzzleId }))!;

    await asAdmin(() =>
      updatePuzzle.callPromise({
        puzzleId,
        title: "After",
        tags: [],
        expectedAnswerCount: 1,
      }),
    );
    await waitForAssertion(() => {
      assert.isTrue(
        fake.drive.files.update.calledWithMatch({
          fileId: doc.value.id,
          requestBody: { name: "↔️ After" },
        }),
      );
    });

    await awaitRefill();
  });

  it("deletes the document again when the puzzle fails to save", async function () {
    await insertCached("spreadsheet", "sheet-doomed");

    await assert.isRejected(
      createPuzzle(""),
      /Document failed validation/,
      "an empty title fails the schema",
    );
    assert.isTrue(
      fake.drive.files.delete.calledWithMatch({ fileId: "sheet-doomed" }),
    );
    assert.equal(await Documents.find({ hunt: huntId }).countAsync(), 0);
    // The claim removed the row, and no hooks ran to refill it
    assert.equal(await CachedDocuments.find({ hunt: huntId }).countAsync(), 0);
  });

  it("deletes a placeholder whose setup fails rather than stranding it", async function () {
    fake.sheets.spreadsheets.batchUpdate.rejects(
      new Error("Request had insufficient authentication scopes"),
    );

    await replenishDocumentCache(huntId);

    assert.equal(await availableCount("spreadsheet"), 0);
    const sheets = createdFiles(SHEET_MIME);
    assert.lengthOf(sheets, 1, "the first failure ends the pass for that type");
    const { data } = await sheets[0]!.returnValue;
    assert.isTrue(
      fake.drive.files.delete.calledWithMatch({ fileId: data.id }),
      "the file is deleted again",
    );
    assert.equal(
      await availableCount("document"),
      DOCUMENT_CACHE_TARGETS.document,
      "the other type is unaffected",
    );
  });

  it("the periodic sweep only tops up hunts with recent puzzle activity", async function () {
    const emptyHuntId = await insertHunt("Empty hunt");
    const archivedHuntId = await insertHunt("Archived hunt", true);
    const staleHuntId = await insertHunt("Stale hunt");
    const boardOnlyHuntId = await insertHunt("Stale hunt with a new board");
    const longAgo = new Date(
      Date.now() - DOCUMENT_CACHE_SWEEP_WINDOW_MS - 60 * 1000,
    );
    await insertPuzzle(huntId);
    await insertPuzzle(archivedHuntId);
    await insertPuzzle(staleHuntId, longAgo);
    await insertPuzzle(boardOnlyHuntId, longAgo);
    await asAdmin(() =>
      Puzzles.insertAsync({
        hunt: boardOnlyHuntId,
        title: "Whiteboard",
        tags: [],
        answers: [],
        expectedAnswerCount: 0,
        kind: "whiteboard",
      }),
    );

    try {
      await replenishAllDocumentCaches();

      assert.equal(
        await availableCount("spreadsheet"),
        DOCUMENT_CACHE_TARGETS.spreadsheet,
      );
      assert.equal(
        await CachedDocuments.find({ hunt: emptyHuntId }).countAsync(),
        0,
        "a hunt without puzzles is new or purged, and either way left alone",
      );
      assert.equal(
        await CachedDocuments.find({ hunt: archivedHuntId }).countAsync(),
        0,
      );
      assert.equal(
        await CachedDocuments.find({ hunt: staleHuntId }).countAsync(),
        0,
        "a hunt whose puzzles haven't changed in weeks is left alone",
      );
      assert.equal(
        await CachedDocuments.find({ hunt: boardOnlyHuntId }).countAsync(),
        0,
        "a new whiteboard isn't puzzle activity",
      );
    } finally {
      await Hunts.removeAsync({
        _id: {
          $in: [emptyHuntId, archivedHuntId, staleHuntId, boardOnlyHuntId],
        },
      });
    }
  });

  it("creates a fresh file when the claimed placeholder is gone from Drive", async function () {
    await insertCached("spreadsheet", "sheet-gone");
    fake.drive.files.update
      .withArgs(sinon.match({ fileId: "sheet-gone" }))
      .rejects(Object.assign(new Error("File not found"), { status: 404 }));

    const puzzleId = await createPuzzle("Lost placeholder");

    const doc = await Documents.findOneAsync({ puzzle: puzzleId });
    assert.isDefined(doc);
    assert.notEqual(doc.value.id, "sheet-gone");
    assert.isTrue(
      fake.drive.files.create
        .getCalls()
        .some((call) => call.args[0].requestBody.name === "↔️ Lost placeholder"),
    );
    assert.isUndefined(
      await CachedDocuments.findOneAsync({ "value.id": "sheet-gone" }),
      "the dead placeholder is flushed from the cache",
    );

    await awaitRefill();
  });

  it("purging a hunt deletes its cached files along with the rows", async function () {
    await insertCached("spreadsheet", "sheet-a");
    await insertCached("spreadsheet", "sheet-b");
    await insertCached("document", "doc-claimed", { status: "claimed" });

    await runJob(purgeHuntJob, { huntId }, { userId: adminId });

    assert.isTrue(
      fake.drive.files.delete.calledWithMatch({ fileId: "sheet-a" }),
    );
    assert.isTrue(
      fake.drive.files.delete.calledWithMatch({ fileId: "sheet-b" }),
    );
    assert.isFalse(
      fake.drive.files.delete.calledWithMatch({ fileId: "doc-claimed" }),
      "a claimed file may belong to a puzzle by now",
    );
    assert.equal(await CachedDocuments.find({ hunt: huntId }).countAsync(), 0);
    assert.isDefined(await Hunts.findOneAsync(huntId));
  });

  it("purging a hunt with Google disabled still drops the cache rows", async function () {
    await insertCached("spreadsheet", "sheet-a");
    await FeatureFlags.upsertAsync(
      { name: "disable.google" },
      { $set: { type: "on", createdBy: adminId } },
    );

    await runJob(purgeHuntJob, { huntId }, { userId: adminId });

    assert.equal(fake.drive.files.delete.callCount, 0);
    assert.equal(await CachedDocuments.find({ hunt: huntId }).countAsync(), 0);
  });

  it("lets admins, and only admins, purge the cache by hand", async function () {
    await insertCached("spreadsheet", "sheet-a");

    await assert.isRejected(
      asUser(memberId, () => purgeHuntDocumentCache.callPromise({ huntId })),
      /Must be admin/,
    );
    assert.equal(await CachedDocuments.find({ hunt: huntId }).countAsync(), 1);
    assert.equal(fake.drive.files.delete.callCount, 0);

    await asAdmin(() => purgeHuntDocumentCache.callPromise({ huntId }));
    assert.isTrue(
      fake.drive.files.delete.calledWithMatch({ fileId: "sheet-a" }),
    );
    assert.equal(await CachedDocuments.find({ hunt: huntId }).countAsync(), 0);

    await assert.isRejected(
      asAdmin(() =>
        purgeHuntDocumentCache.callPromise({ huntId: "nonexistent" }),
      ),
      /Unknown hunt/,
    );
  });
});
