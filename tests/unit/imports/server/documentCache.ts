import { Accounts } from "meteor/accounts-base";
import { Random } from "meteor/random";
import { assert } from "chai";
import { GaxiosError } from "gaxios";
import sinon from "sinon";
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
    await Hunts.updateAsync(huntId, { $set: { isArchived: false } });
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
});
