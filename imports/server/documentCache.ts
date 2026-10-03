import { setTimeout } from "node:timers/promises";
import Flags from "../Flags";
import Logger from "../Logger";
import type { GdriveMimeTypesType } from "../lib/GdriveMimeTypes";
import CachedDocuments from "../lib/models/CachedDocuments";
import Hunts from "../lib/models/Hunts";
import MeteorUsers from "../lib/models/MeteorUsers";
import Puzzles from "../lib/models/Puzzles";
import { createDocument, deleteDocument, ensureHuntFolder } from "./gdrive";
import GoogleClient from "./googleClientRefresher";
import withLock, { PREEMPT_TIMEOUT } from "./withLock";

// How many placeholder files of each type a hunt keeps ready.
export const DOCUMENT_CACHE_TARGETS = {
  spreadsheet: 15,
  document: 1,
} as const satisfies Partial<Record<GdriveMimeTypesType, number>>;

// A type is only topped up once it has fallen this far below its target (or
// is nearly empty), so a trickle of puzzle creations doesn't cost a Drive
// round trip each.
const REFILL_SLACK = 3;

// Pauses between Drive calls, to stay under Google's rate limits. Tests turn
// them down.
export const documentCacheSettings = {
  creationDelayMs: 1500,
  deletionDelayMs: 500,
};

export function cachedDocumentName(type: GdriveMimeTypesType) {
  return `[CACHED] ${type.toUpperCase()} - DO NOT DELETE`;
}

export function needsRefill(available: number, target: number) {
  return (
    available < target - REFILL_SLACK ||
    (available < REFILL_SLACK && available < target)
  );
}

export async function isGoogleAvailable() {
  return GoogleClient.ready() && !(await Flags.activeAsync("disable.google"));
}

function lockName(huntId: string) {
  return `hunt:${huntId}:document-cache`;
}

// withLock only learns that the lock is still wanted when renew() is called,
// and a single Drive call (with gaxios's retries) can outlast the preemption
// timeout, which would let another server start on the same hunt. So renew
// on a timer for the whole critical section, as the Discord daemon does. A
// failed renewal aborts the signal, which the loops check between Drive
// calls.
function withRenewedLock<T>(
  name: string,
  critSection: (preempted: AbortSignal) => Promise<T>,
) {
  return withLock(name, async (renew) => {
    using cleanup = new DisposableStack();
    const preempted = new AbortController();
    cleanup.use(
      setInterval(() => {
        renew().catch((error: unknown) => preempted.abort(error));
      }, PREEMPT_TIMEOUT / 2),
    );
    return await critSection(preempted.signal);
  });
}

// Cache rows are written outside any method invocation, so createdBy can't be
// auto-populated; the longest-standing admin stands in as the system user.
async function systemUserId() {
  const admin = await MeteorUsers.findOneAsync(
    { "roles.__GLOBAL__": "admin" },
    { sort: { createdAt: 1 }, projection: { _id: 1 } },
  );
  return admin?._id;
}

async function replenishOnce(huntId: string) {
  try {
    if (!(await isGoogleAvailable())) {
      return;
    }

    const hunt = await Hunts.findOneAsync(huntId);
    if (!hunt) {
      Logger.warn("Document cache replenishment skipped: no such hunt", {
        huntId,
      });
      return;
    }
    if (hunt.isArchived) {
      return;
    }

    const createdBy = await systemUserId();
    if (!createdBy) {
      Logger.warn("Document cache replenishment skipped: no admin user", {
        huntId,
      });
      return;
    }

    await withRenewedLock(lockName(huntId), async (preempted) => {
      const folderId = await ensureHuntFolder(hunt);

      for (const [type, target] of Object.entries(DOCUMENT_CACHE_TARGETS) as [
        keyof typeof DOCUMENT_CACHE_TARGETS,
        number,
      ][]) {
        const available = await CachedDocuments.find({
          hunt: huntId,
          status: "available",
          "value.type": type,
        }).countAsync();
        if (!needsRefill(available, target)) {
          continue;
        }

        const needed = target - available;
        Logger.info("Replenishing document cache", {
          huntId,
          type,
          available,
          needed,
        });
        for (let i = 0; i < needed; i++) {
          preempted.throwIfAborted();
          try {
            const id = await createDocument(
              cachedDocumentName(type),
              type,
              folderId,
            );
            await CachedDocuments.insertAsync({
              hunt: huntId,
              status: "available",
              provider: "google",
              value: { type, id, folder: folderId },
              createdBy,
            });
          } catch (error) {
            Logger.error("Failed to replenish document cache", {
              huntId,
              type,
              error,
            });
            break;
          }
          await setTimeout(documentCacheSettings.creationDelayMs);
        }
      }
    });
  } catch (error) {
    Logger.error("Document cache replenishment failed", { huntId, error });
  }
}

// Passes in flight in this process, and the hunts asked for again meanwhile,
// so a burst of triggers for one hunt (bulk puzzle creation, say) runs one
// pass and then one more, rather than queueing up on the lock.
const inFlight = new Map<string, Promise<void>>();
const rerunRequested = new Set<string>();

// Tops the hunt's cache up to its targets, if it needs it. Never rejects:
// failures are logged, since callers are hooks and timers with nowhere to
// report them. Does nothing without a configured Drive client, with the
// disable.google flag set, or for archived or deleted hunts.
export function replenishDocumentCache(huntId: string): Promise<void> {
  const current = inFlight.get(huntId);
  if (current) {
    rerunRequested.add(huntId);
    return current;
  }

  const pass = (async () => {
    do {
      rerunRequested.delete(huntId);
      await replenishOnce(huntId);
    } while (rerunRequested.has(huntId));
    inFlight.delete(huntId);
  })();
  inFlight.set(huntId, pass);
  return pass;
}

// Hunts whose puzzles saw no change for this long are left to the hooks.
export const DOCUMENT_CACHE_SWEEP_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

// The periodic sweep. It only tops up hunts with recent puzzle activity: a
// hunt with no puzzles is either brand new (createHunt pre-fills it) or has
// been purged, and the sweep shouldn't undo a purge; a hunt whose puzzles
// haven't changed in weeks is over, archived or not, and placeholders would
// only clutter its Drive folder. The puzzle hooks refill a hunt as soon as it
// is in use again.
export async function replenishAllDocumentCaches() {
  if (!(await isGoogleAvailable())) {
    return;
  }
  const hunts = await Hunts.find(
    { isArchived: { $ne: true } },
    { projection: { _id: 1 } },
  ).fetchAsync();
  const since = new Date(Date.now() - DOCUMENT_CACHE_SWEEP_WINDOW_MS);
  // One hunt at a time: Drive's rate limit is per account, not per hunt.
  for (const hunt of hunts) {
    const active = await Puzzles.findOneAsync(
      {
        hunt: hunt._id,
        $or: [{ createdAt: { $gte: since } }, { updatedAt: { $gte: since } }],
      },
      { projection: { _id: 1 } },
    );
    if (!active) {
      continue;
    }
    await replenishDocumentCache(hunt._id);
  }
}

// Resolves once no replenishment pass is running in this process. For tests.
export async function waitForDocumentCacheIdle() {
  while (inFlight.size > 0) {
    await Promise.all(inFlight.values());
  }
}

// Deletes a hunt's unclaimed placeholder files from Drive and removes all of
// its cache rows. Each row is removed before its file is deleted, conditioned
// on the row still being available, so a claim that races with the purge
// keeps its file (at worst a placeholder leaks in Drive if the delete then
// fails). Claimed rows are dropped without touching the file, which may by
// now belong to a puzzle.
export async function purgeDocumentCache(
  huntId: string,
  {
    signal,
    onProgress,
  }: {
    signal?: AbortSignal;
    onProgress?: (completed: number, total: number) => Promise<void>;
  } = {},
) {
  await withRenewedLock(lockName(huntId), async (preempted) => {
    const cached = await CachedDocuments.find({ hunt: huntId }).fetchAsync();
    let completed = 0;
    for (const doc of cached) {
      signal?.throwIfAborted();
      preempted.throwIfAborted();

      const removed = await CachedDocuments.removeAsync({
        _id: doc._id,
        status: "available",
      });
      if (removed > 0) {
        Logger.info("Removing cached Google Drive document", {
          huntId,
          fileId: doc.value.id,
        });
        try {
          await deleteDocument(doc.value.id);
        } catch (error) {
          // The row is already gone, so nothing will retry this file
          Logger.error(
            "Failed to delete cached document; it remains in Drive",
            {
              huntId,
              fileId: doc.value.id,
              error,
            },
          );
          throw error;
        }
        await setTimeout(documentCacheSettings.deletionDelayMs);
      } else {
        await CachedDocuments.removeAsync(doc._id);
      }

      completed += 1;
      await onProgress?.(completed, cached.length);
    }
  });
}
