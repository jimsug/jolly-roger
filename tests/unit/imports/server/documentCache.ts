import { Accounts } from "meteor/accounts-base";
import { Random } from "meteor/random";
import { assert } from "chai";
import { GaxiosError } from "gaxios";
import sinon from "sinon";
import Logger from "../../../../imports/Logger";
import type { GdriveMimeTypesType } from "../../../../imports/lib/GdriveMimeTypes";
import { GLOBAL_SCOPE } from "../../../../imports/lib/isAdmin";
import purgeHuntJob from "../../../../imports/lib/jobs/purgeHunt";
import purgeHuntDocumentCacheJob from "../../../../imports/lib/jobs/purgeHuntDocumentCache";
import Documents from "../../../../imports/lib/models/Documents";
import FeatureFlags from "../../../../imports/lib/models/FeatureFlags";
import Hunts from "../../../../imports/lib/models/Hunts";
import Jobs from "../../../../imports/lib/models/Jobs";
import MeteorUsers from "../../../../imports/lib/models/MeteorUsers";
import Puzzles from "../../../../imports/lib/models/Puzzles";
import Settings from "../../../../imports/lib/models/Settings";
import { addUserToRole } from "../../../../imports/lib/permission_stubs";
import configureGdriveTemplates from "../../../../imports/methods/configureGdriveTemplates";
import purgeHuntDocumentCache from "../../../../imports/methods/purgeHuntDocumentCache";
import updatePuzzle from "../../../../imports/methods/updatePuzzle";
import addPuzzle from "../../../../imports/server/addPuzzle";
import {
  cachedDocumentName,
  DOCUMENT_CACHE_SWEEP_INTERVAL_MS,
  DOCUMENT_CACHE_SWEEP_WINDOW_MS,
  DOCUMENT_CACHE_TARGETS,
  documentCacheBackoffMs,
  documentCacheClock,
  documentCacheSettings,
  replenishAllDocumentCaches,
  replenishDocumentCache,
  resetDocumentCacheBackoffs,
  waitForDocumentCacheIdle,
} from "../../../../imports/server/documentCache";
import {
  ensureDocument,
  ensureHuntFolder,
} from "../../../../imports/server/gdrive";
import CachedDocuments from "../../../../imports/server/models/CachedDocuments";
import asUser from "../../../lib/asUser";
import createTestHunt from "../../../lib/createTestHunt";
import installFakeGoogleClient from "../../../lib/fakeGoogleClient";
import resetDatabase from "../../../lib/resetDatabase";
import runJob from "../../../lib/runJob";
import waitForAssertion from "../../../lib/waitForAssertion";

const SHEET_MIME = "application/vnd.google-apps.spreadsheet";
const DOC_MIME = "application/vnd.google-apps.document";
const FOLDER_MIME = "application/vnd.google-apps.folder";

const SHEET_TARGET = DOCUMENT_CACHE_TARGETS.get("spreadsheet")!;
const DOC_TARGET = DOCUMENT_CACHE_TARGETS.get("document")!;

// What Drive's API client rejects with for a file that doesn't exist
function notFoundError(fileId: string) {
  const config = {
    url: new URL(`https://www.googleapis.com/drive/v3/files/${fileId}`),
    headers: new Headers(),
  };
  const response = Object.assign(new Response(null, { status: 404 }), {
    config,
    data: undefined,
  });
  return new GaxiosError("File not found", config, response);
}

describe("documentCacheBackoffMs", function () {
  const minutes = (n: number) => n * 60 * 1000;

  it("waits a sweep interval after the first failure, doubling after that", function () {
    assert.equal(DOCUMENT_CACHE_SWEEP_INTERVAL_MS, minutes(13));
    assert.equal(documentCacheBackoffMs(1), minutes(13));
    assert.equal(documentCacheBackoffMs(2), minutes(26));
    assert.equal(documentCacheBackoffMs(3), minutes(52));
    assert.equal(documentCacheBackoffMs(5), minutes(208));
  });

  it("stops doubling at four hours", function () {
    assert.equal(documentCacheBackoffMs(6), minutes(240));
    assert.equal(documentCacheBackoffMs(100), minutes(240));
  });

  it("doesn't wait without a failure", function () {
    assert.equal(documentCacheBackoffMs(0), 0);
    assert.equal(documentCacheBackoffMs(-1), 0);
  });
});

describe("document cache", function () {
  this.timeout(30000);

  let huntId: string;
  let folderId: string;
  let adminId: string;
  let fake: ReturnType<typeof installFakeGoogleClient>;
  const savedDelays = { ...documentCacheSettings };

  const asAdmin = <T>(fn: () => Promise<T>) => asUser(adminId, fn);

  const availableCount = (type: GdriveMimeTypesType) =>
    CachedDocuments.find({
      hunt: huntId,
      status: "available",
      "value.type": type,
    }).countAsync();

  const insertCached = (
    type: GdriveMimeTypesType,
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
      createdAt,
    });

  const insertHunt = (name: string, isArchived = false) =>
    createTestHunt(adminId, { name, isArchived });

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

  const setFlag = (name: "disable.google" | "disable.gdrive_document_cache") =>
    FeatureFlags.upsertAsync(
      { name },
      { $set: { type: "on", createdBy: adminId } },
    );

  const createdFiles = (mimeType: string) =>
    fake.drive.files.create
      .getCalls()
      .filter((call) => call.args[0].requestBody.mimeType === mimeType);

  const createPuzzle = (
    title: string,
    docType: GdriveMimeTypesType = "spreadsheet",
  ) =>
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
      assert.equal(await availableCount("spreadsheet"), SHEET_TARGET);
      assert.equal(await availableCount("document"), DOC_TARGET);
    }, 5000);

  this.beforeAll(async function () {
    await resetDatabase("document cache");
    adminId = await Accounts.createUserAsync({
      email: "admin@example.com",
      password: "password",
    });
    await addUserToRole(adminId, GLOBAL_SCOPE, "admin");
    huntId = await insertHunt("Cached hunt");
    await MeteorUsers.updateAsync(adminId, { $set: { hunts: [huntId] } });

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
    await Jobs.removeAsync({});
    await Settings.removeAsync({
      name: {
        $in: ["gdrive.template.spreadsheet", "gdrive.template.document"],
      },
    });
    await Hunts.updateAsync(huntId, { $set: { isArchived: false } });
    resetDocumentCacheBackoffs();
    // Fresh stubs for each test
    fake.uninstall();
    fake = installFakeGoogleClient();
  });

  it("names cached documents so they stand out in Drive", function () {
    assert.equal(
      cachedDocumentName("spreadsheet"),
      "[CACHED] SPREADSHEET - DO NOT DELETE",
    );
    assert.equal(
      cachedDocumentName("document"),
      "[CACHED] DOCUMENT - DO NOT DELETE",
    );
  });

  it("fills an empty cache to its targets with cached documents in the hunt folder", async function () {
    await replenishDocumentCache(huntId);

    assert.equal(await availableCount("spreadsheet"), SHEET_TARGET);
    assert.equal(await availableCount("document"), DOC_TARGET);
    for (const cached of await CachedDocuments.find({
      hunt: huntId,
    }).fetchAsync()) {
      assert.equal(cached.value.folder, folderId);
    }

    const sheets = createdFiles(SHEET_MIME);
    assert.lengthOf(sheets, SHEET_TARGET);
    assert.isTrue(
      sheets.every(
        (call) =>
          call.args[0].requestBody.name === cachedDocumentName("spreadsheet"),
      ),
    );
    const docs = createdFiles(DOC_MIME);
    assert.lengthOf(docs, DOC_TARGET);
    assert.equal(
      docs[0]!.args[0].requestBody.name,
      cachedDocumentName("document"),
    );
    // Cached documents are set up like any other document
    assert.equal(
      fake.sheets.spreadsheets.batchUpdate.callCount,
      SHEET_TARGET,
      "external URL access is enabled on each sheet",
    );
    assert.equal(
      fake.drive.permissions.create.callCount,
      SHEET_TARGET + DOC_TARGET,
      "each cached document is shared",
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

    await setFlag("disable.google");
    await replenishDocumentCache(huntId);
    assert.equal(await CachedDocuments.find({ hunt: huntId }).countAsync(), 0);
    await FeatureFlags.removeAsync({});

    fake.uninstall();
    await replenishDocumentCache(huntId);
    assert.equal(await CachedDocuments.find({ hunt: huntId }).countAsync(), 0);
    fake = installFakeGoogleClient();
    assert.equal(fake.drive.files.create.callCount, 0);
  });

  it("leaves the cache alone while disable.gdrive_document_cache is on, but still purges it", async function () {
    await insertCached("spreadsheet", "sheet-kept");
    // Recent puzzle activity, so the sweep would otherwise refill the hunt
    await insertPuzzle(huntId);
    await setFlag("disable.gdrive_document_cache");

    await replenishDocumentCache(huntId);
    await replenishAllDocumentCaches();
    assert.equal(fake.drive.files.create.callCount, 0, "nothing is refilled");

    const doc = await asAdmin(() =>
      ensureDocument({
        _id: Random.id(),
        title: "Uncached puzzle",
        hunt: huntId,
      }),
    );
    assert.notEqual(doc.value.id, "sheet-kept");
    assert.isTrue(
      fake.drive.files.create.calledWithMatch({
        requestBody: { name: "↔️ Uncached puzzle" },
      }),
      "the puzzle's file is created on the spot",
    );
    assert.isDefined(
      await CachedDocuments.findOneAsync({ "value.id": "sheet-kept" }),
      "the cached document isn't claimed",
    );

    await runJob(purgeHuntDocumentCacheJob, { huntId }, { userId: adminId });
    assert.isTrue(
      fake.drive.files.delete.calledWithMatch({ fileId: "sheet-kept" }),
    );
    assert.equal(await CachedDocuments.find({ hunt: huntId }).countAsync(), 0);
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

  it("refuses an empty title before claiming or creating a document", async function () {
    await insertCached("spreadsheet", "sheet-unused");

    await assert.isRejected(createPuzzle(""), /Puzzle title is required/);
    assert.equal(fake.drive.files.create.callCount, 0);
    assert.equal(
      fake.drive.files.update.callCount,
      0,
      "nothing is claimed and renamed",
    );
    assert.isDefined(
      await CachedDocuments.findOneAsync({ "value.id": "sheet-unused" }),
    );
  });

  it("deletes the document again when the puzzle fails to save", async function () {
    await insertCached("spreadsheet", "sheet-doomed");

    const insert = sinon
      .stub(Puzzles, "insertAsync")
      .rejects(new Error("Insert failed"));
    try {
      await assert.isRejected(createPuzzle("Doomed puzzle"), /Insert failed/);
    } finally {
      insert.restore();
    }
    assert.isTrue(
      fake.drive.files.delete.calledWithMatch({ fileId: "sheet-doomed" }),
    );
    assert.equal(await Documents.find({ hunt: huntId }).countAsync(), 0);
    // The claim removed the row, and no hooks ran to refill it
    assert.equal(await CachedDocuments.find({ hunt: huntId }).countAsync(), 0);
  });

  it("deletes a cached document whose setup fails rather than stranding it", async function () {
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
      DOC_TARGET,
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

      assert.equal(await availableCount("spreadsheet"), SHEET_TARGET);
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

  it("creates a fresh file when the claimed cached document is gone from Drive", async function () {
    await insertCached("spreadsheet", "sheet-gone");
    fake.drive.files.update
      .withArgs(sinon.match({ fileId: "sheet-gone" }))
      .rejects(notFoundError("sheet-gone"));

    const puzzleId = await createPuzzle("Lost cached document");

    const doc = await Documents.findOneAsync({ puzzle: puzzleId });
    assert.isDefined(doc);
    assert.notEqual(doc.value.id, "sheet-gone");
    assert.isTrue(
      fake.drive.files.create
        .getCalls()
        .some(
          (call) => call.args[0].requestBody.name === "↔️ Lost cached document",
        ),
    );
    assert.isUndefined(
      await CachedDocuments.findOneAsync({ "value.id": "sheet-gone" }),
      "the dead cached document is flushed from the cache",
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
    await setFlag("disable.google");

    await runJob(purgeHuntJob, { huntId }, { userId: adminId });

    assert.equal(fake.drive.files.delete.callCount, 0);
    assert.equal(await CachedDocuments.find({ hunt: huntId }).countAsync(), 0);
  });

  it("lets admins purge the cache by hand, through a job", async function () {
    await insertCached("spreadsheet", "sheet-a");

    await asAdmin(() => purgeHuntDocumentCache.callPromise({ huntId }));
    const job = await Jobs.findOneAsync({
      type: purgeHuntDocumentCacheJob.name,
    });
    assert.isDefined(job);
    assert.deepEqual(job.args, { huntId });
    assert.equal(fake.drive.files.delete.callCount, 0, "the job does the work");

    await runJob(
      purgeHuntDocumentCacheJob,
      { huntId },
      { userId: adminId, jobId: job._id },
    );
    assert.isTrue(
      fake.drive.files.delete.calledWithMatch({ fileId: "sheet-a" }),
    );
    assert.equal(await CachedDocuments.find({ hunt: huntId }).countAsync(), 0);
  });

  it("tells admins why a purge can't be queued without Google", async function () {
    await insertCached("spreadsheet", "sheet-a");

    await setFlag("disable.google");
    await assert.isRejected(
      asAdmin(() => purgeHuntDocumentCache.callPromise({ huntId })),
      /Google integration is disabled\./,
    );
    await FeatureFlags.removeAsync({});

    fake.uninstall();
    try {
      await assert.isRejected(
        asAdmin(() => purgeHuntDocumentCache.callPromise({ huntId })),
        /Google Drive client is not configured\./,
      );
    } finally {
      fake = installFakeGoogleClient();
    }

    assert.equal(await Jobs.find({}).countAsync(), 0);
    assert.equal(await CachedDocuments.find({ hunt: huntId }).countAsync(), 1);
  });

  it("leaves a hunt and type alone after a failed creation until its backoff ends", async function () {
    const realNow = documentCacheClock.now;
    let now = Date.now();
    documentCacheClock.now = () => now;
    const sheetRequest = sinon.match({
      requestBody: sinon.match({ mimeType: SHEET_MIME }),
    });
    fake.drive.files.create
      .withArgs(sheetRequest)
      .rejects(new Error("Drive is down"));
    await insertPuzzle(huntId);
    const error = sinon.stub(Logger, "error");
    const warn = sinon.stub(Logger, "warn");
    const failureLogs = (stub: sinon.SinonStub) =>
      stub
        .getCalls()
        .filter((call) =>
          String(call.args[0]).startsWith("Failed to replenish document cache"),
        );

    try {
      await replenishAllDocumentCaches();
      assert.lengthOf(createdFiles(SHEET_MIME), 1);
      assert.equal(await availableCount("document"), DOC_TARGET);
      assert.lengthOf(failureLogs(error), 1);
      sinon.assert.match(failureLogs(error)[0]!.args[1], {
        huntId,
        type: "spreadsheet",
        failures: 1,
      });
      assert.lengthOf(failureLogs(warn), 0);

      // Still backing off just before a sweep interval has passed
      now += DOCUMENT_CACHE_SWEEP_INTERVAL_MS - 1000;
      await replenishAllDocumentCaches();
      await replenishDocumentCache(huntId);
      assert.lengthOf(createdFiles(SHEET_MIME), 1);

      // Retried once it has, and failing again doubles the wait and is
      // logged as a warning
      now += 1000;
      await replenishAllDocumentCaches();
      assert.lengthOf(createdFiles(SHEET_MIME), 2);
      assert.lengthOf(failureLogs(error), 1);
      assert.lengthOf(failureLogs(warn), 1);
      sinon.assert.match(failureLogs(warn)[0]!.args[1], {
        type: "spreadsheet",
        failures: 2,
        retryAfterMs: 2 * DOCUMENT_CACHE_SWEEP_INTERVAL_MS,
      });
      now += DOCUMENT_CACHE_SWEEP_INTERVAL_MS;
      await replenishAllDocumentCaches();
      assert.lengthOf(createdFiles(SHEET_MIME), 2);

      // A success fills the cache and starts the next backoff afresh
      fake.drive.files.create
        .withArgs(sheetRequest)
        .callsFake(() => Promise.resolve({ data: { id: Random.id() } }));
      now += DOCUMENT_CACHE_SWEEP_INTERVAL_MS;
      await replenishAllDocumentCaches();
      assert.equal(await availableCount("spreadsheet"), SHEET_TARGET);

      fake.drive.files.create
        .withArgs(sheetRequest)
        .rejects(new Error("Drive is down"));
      await CachedDocuments.removeAsync({ "value.type": "spreadsheet" });
      const before = createdFiles(SHEET_MIME).length;
      await replenishAllDocumentCaches();
      assert.lengthOf(createdFiles(SHEET_MIME), before + 1);
      now += DOCUMENT_CACHE_SWEEP_INTERVAL_MS;
      await replenishAllDocumentCaches();
      assert.lengthOf(createdFiles(SHEET_MIME), before + 2);
      assert.lengthOf(failureLogs(error), 2, "a fresh run of failures");
    } finally {
      error.restore();
      warn.restore();
      documentCacheClock.now = realNow;
    }
  });

  it("backs off every type due when the hunt folder can't be made", async function () {
    const realNow = documentCacheClock.now;
    let now = Date.now();
    documentCacheClock.now = () => now;
    const folderRequest = sinon.match({
      requestBody: sinon.match({ mimeType: FOLDER_MIME }),
    });
    fake.drive.files.create
      .withArgs(folderRequest)
      .rejects(new Error("Drive is down"));
    const folderlessHuntId = await insertHunt("Folderless hunt");
    const error = sinon.stub(Logger, "error");
    const failureLogs = () =>
      error
        .getCalls()
        .filter(
          (call) => call.args[0] === "Failed to replenish document cache",
        );

    try {
      await replenishDocumentCache(folderlessHuntId);
      assert.lengthOf(createdFiles(FOLDER_MIME), 1);
      assert.lengthOf(createdFiles(SHEET_MIME), 0);
      assert.lengthOf(createdFiles(DOC_MIME), 0);
      assert.sameMembers(
        failureLogs().map((call) => call.args[1]?.type),
        ["spreadsheet", "document"],
      );

      // Not even the folder is tried again until the backoff ends
      await replenishDocumentCache(folderlessHuntId);
      assert.lengthOf(createdFiles(FOLDER_MIME), 1);

      fake.drive.files.create
        .withArgs(folderRequest)
        .callsFake(() => Promise.resolve({ data: { id: Random.id() } }));
      now += DOCUMENT_CACHE_SWEEP_INTERVAL_MS;
      await replenishDocumentCache(folderlessHuntId);
      assert.lengthOf(createdFiles(FOLDER_MIME), 2);
      assert.equal(
        await CachedDocuments.find({
          hunt: folderlessHuntId,
          status: "available",
        }).countAsync(),
        SHEET_TARGET + DOC_TARGET,
      );
    } finally {
      error.restore();
      documentCacheClock.now = realNow;
      await Hunts.removeAsync(folderlessHuntId);
    }
  });

  it("drops cached copies of a type whose template changes", async function () {
    const otherHuntId = await insertHunt("Other cached hunt");
    try {
      await insertCached("spreadsheet", "sheet-a");
      await insertCached("spreadsheet", "sheet-claimed", { status: "claimed" });
      await insertCached("document", "doc-a");
      await CachedDocuments.insertAsync({
        hunt: otherHuntId,
        status: "available",
        provider: "google",
        value: { type: "spreadsheet", id: "sheet-other", folder: folderId },
      });

      const info = sinon.spy(Logger, "info");
      try {
        await asAdmin(() =>
          configureGdriveTemplates.callPromise({
            spreadsheetTemplate: "new-sheet-template",
          }),
        );
      } finally {
        info.restore();
      }
      await waitForDocumentCacheIdle();
      sinon.assert.calledWithMatch(
        info,
        "Dropped cached documents copied from an old template",
        { type: "spreadsheet", dropped: 2 },
      );

      assert.sameMembers(
        (await CachedDocuments.find({}).fetchAsync()).map(
          (doc) => doc.value.id,
        ),
        ["sheet-claimed", "doc-a"],
        "available spreadsheets go from every hunt; documents stay",
      );
      for (const fileId of ["sheet-a", "sheet-other"]) {
        assert.isTrue(
          fake.drive.files.delete.calledWithMatch({ fileId }),
          fileId,
        );
      }
      assert.equal(fake.drive.files.delete.callCount, 2);

      // Saving the same templates again drops nothing
      await insertCached("spreadsheet", "sheet-b");
      await asAdmin(() =>
        configureGdriveTemplates.callPromise({
          spreadsheetTemplate: "new-sheet-template",
        }),
      );
      await waitForDocumentCacheIdle();
      assert.equal(await availableCount("spreadsheet"), 1);
      assert.equal(await availableCount("document"), 1);

      // Clearing a template counts as a change
      await asAdmin(() => configureGdriveTemplates.callPromise({}));
      await waitForDocumentCacheIdle();
      assert.equal(await availableCount("spreadsheet"), 0);
      assert.equal(await availableCount("document"), 1);
    } finally {
      await Hunts.removeAsync(otherHuntId);
    }
  });

  it("refills a type straight away once its template changes, despite a backoff", async function () {
    const realNow = documentCacheClock.now;
    const now = Date.now();
    documentCacheClock.now = () => now;
    const error = sinon.stub(Logger, "error");
    const sheetRequest = sinon.match({
      requestBody: sinon.match({ mimeType: SHEET_MIME }),
    });
    fake.drive.files.create
      .withArgs(sheetRequest)
      .rejects(new Error("Template is broken"));
    await insertPuzzle(huntId);

    try {
      await replenishAllDocumentCaches();
      assert.lengthOf(createdFiles(SHEET_MIME), 1);
      await replenishAllDocumentCaches();
      assert.lengthOf(createdFiles(SHEET_MIME), 1, "backing off");

      await asAdmin(() =>
        configureGdriveTemplates.callPromise({
          spreadsheetTemplate: "fixed-sheet-template",
        }),
      );
      await waitForDocumentCacheIdle();

      // Same moment as the failure: the template change cleared the backoff
      await replenishAllDocumentCaches();
      assert.isTrue(
        fake.drive.files.copy.calledWithMatch({
          fileId: "fixed-sheet-template",
        }),
      );
      assert.equal(await availableCount("spreadsheet"), SHEET_TARGET);
    } finally {
      error.restore();
      documentCacheClock.now = realNow;
    }
  });

  it("refuses a template change from anyone but an admin before dropping anything", async function () {
    await asAdmin(() =>
      configureGdriveTemplates.callPromise({
        spreadsheetTemplate: "old-sheet-template",
      }),
    );
    await insertCached("spreadsheet", "sheet-a");
    const memberId = await Accounts.createUserAsync({
      email: `member-${Random.id()}@example.com`,
      password: "password",
    });
    await MeteorUsers.updateAsync(memberId, { $set: { hunts: [huntId] } });

    await assert.isRejected(
      asUser(memberId, () =>
        configureGdriveTemplates.callPromise({
          spreadsheetTemplate: "new-sheet-template",
        }),
      ),
      /Must be admin to configure gdrive \[401\]/,
    );
    await waitForDocumentCacheIdle();

    const setting = await Settings.findOneAsync({
      name: "gdrive.template.spreadsheet",
    });
    assert.deepEqual(setting?.value, { id: "old-sheet-template" });
    assert.equal(await availableCount("spreadsheet"), 1);
    assert.equal(fake.drive.files.delete.callCount, 0);
  });
});
