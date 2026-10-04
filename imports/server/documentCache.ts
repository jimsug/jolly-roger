import { setTimeout } from "node:timers/promises";
import i18n from "i18next";
import Flags from "../Flags";
import Logger from "../Logger";
import type { GdriveMimeTypesType } from "../lib/GdriveMimeTypes";
import Hunts from "../lib/models/Hunts";
import Puzzles from "../lib/models/Puzzles";
import {
  createDocument,
  deleteDocument,
  ensureHuntFolder,
  isGoogleAvailable,
} from "./gdrive";
import { serverLanguage } from "./lang";
import CachedDocuments from "./models/CachedDocuments";
import { withRenewedLock } from "./withLock";

// How many cached documents of each type a hunt keeps ready.
export const DOCUMENT_CACHE_TARGETS: ReadonlyMap<GdriveMimeTypesType, number> =
  new Map<GdriveMimeTypesType, number>([
    ["spreadsheet", 15],
    ["document", 1],
  ]);

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
  return i18n.t(
    "gdrive.cachedDocumentName",
    "[CACHED] {{type}} - DO NOT DELETE",
    {
      lng: serverLanguage,
      type:
        type === "spreadsheet"
          ? i18n.t("gdrive.cachedDocumentType.spreadsheet", "SPREADSHEET", {
              lng: serverLanguage,
            })
          : i18n.t("gdrive.cachedDocumentType.document", "DOCUMENT", {
              lng: serverLanguage,
            }),
    },
  );
}

// How often every server sweeps the active hunts' caches (see
// replenishAllDocumentCaches). 13 minutes is a prime, so the sweep doesn't
// keep lining up with other periodic work.
export const DOCUMENT_CACHE_SWEEP_INTERVAL_MS = 13 * 60 * 1000;

// The longest a hunt and document type wait after a failed creation.
const MAX_BACKOFF_MS = 4 * 60 * 60 * 1000;

// How long to leave a hunt and document type alone after this many failed
// creations in a row: one sweep interval, doubling with each failure up to
// MAX_BACKOFF_MS.
export function documentCacheBackoffMs(failures: number): number {
  if (failures < 1) {
    return 0;
  }
  return Math.min(
    DOCUMENT_CACHE_SWEEP_INTERVAL_MS * 2 ** (failures - 1),
    MAX_BACKOFF_MS,
  );
}

// Where the backoff reads the time. Tests move it along.
export const documentCacheClock = { now: () => Date.now() };

// Failed creations per hunt and type in this process, so a hunt whose Drive
// folder or template is broken isn't retried on every pass. A failure to make
// the hunt's folder counts against every type that was due. Cleared by the
// next success, and for a type whose template changes (see
// dropCachedDocumentsOfType).
const backoffs = new Map<string, { failures: number; until: number }>();

function backoffKey(huntId: string, type: GdriveMimeTypesType) {
  return `${huntId}:${type}`;
}

function isBackingOff(huntId: string, type: GdriveMimeTypesType) {
  const backoff = backoffs.get(backoffKey(huntId, type));
  return backoff !== undefined && documentCacheClock.now() < backoff.until;
}

function recordFailure(
  huntId: string,
  type: GdriveMimeTypesType,
  error: unknown,
) {
  const key = backoffKey(huntId, type);
  const failures = (backoffs.get(key)?.failures ?? 0) + 1;
  const retryAfterMs = documentCacheBackoffMs(failures);
  backoffs.set(key, {
    failures,
    until: documentCacheClock.now() + retryAfterMs,
  });
  const details = { huntId, type, failures, retryAfterMs, error };
  if (failures === 1) {
    Logger.error("Failed to replenish document cache", details);
  } else {
    Logger.warn("Failed to replenish document cache again", details);
  }
}

// Forgets every failure, so each test starts without a backoff. For tests.
export function resetDocumentCacheBackoffs() {
  backoffs.clear();
}

function needsRefill(available: number, target: number) {
  return (
    available < target - REFILL_SLACK ||
    (available < REFILL_SLACK && available < target)
  );
}

function lockName(huntId: string) {
  return `hunt:${huntId}:document-cache`;
}

async function replenishOnce(huntId: string) {
  try {
    if (
      !(await isGoogleAvailable()) ||
      (await Flags.activeAsync("disable.gdrive_document_cache"))
    ) {
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

    const due = [...DOCUMENT_CACHE_TARGETS.keys()].filter(
      (type) => !isBackingOff(huntId, type),
    );
    if (due.length === 0) {
      return;
    }

    await withRenewedLock(lockName(huntId), async (preempted) => {
      let folderId: string;
      try {
        folderId = await ensureHuntFolder(hunt);
      } catch (error) {
        for (const type of due) {
          recordFailure(huntId, type, error);
        }
        return;
      }

      for (const [type, target] of DOCUMENT_CACHE_TARGETS) {
        if (isBackingOff(huntId, type)) {
          continue;
        }
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
            });
            backoffs.delete(backoffKey(huntId, type));
          } catch (error) {
            recordFailure(huntId, type, error);
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

// Tops the hunt's document cache up to its targets, if it needs it. Never
// rejects: failures are logged, since callers are hooks and timers with
// nowhere to report them. Does nothing without a configured Drive client,
// with the disable.google or disable.gdrive_document_cache flag set, or for
// archived or deleted hunts, and skips a type that is backing off after a
// failed creation (see documentCacheBackoffMs).
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
// haven't changed in weeks is over, archived or not, and cached documents
// would only clutter its Drive folder. The puzzle hooks refill a hunt as soon
// as it is in use again. The whiteboard's backing puzzle never gets a
// document, so making a board doesn't count as activity.
export async function replenishAllDocumentCaches() {
  if (
    !(await isGoogleAvailable()) ||
    (await Flags.activeAsync("disable.gdrive_document_cache"))
  ) {
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
        kind: { $ne: "whiteboard" },
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

// Deletions of dropped cached documents still running in the background.
const pendingDeletions = new Set<Promise<void>>();

// Resolves once no replenishment pass or background deletion is running in
// this process. For tests.
export async function waitForDocumentCacheIdle() {
  while (inFlight.size > 0 || pendingDeletions.size > 0) {
    await Promise.all([...inFlight.values(), ...pendingDeletions]);
  }
}

// Deletes a hunt's unclaimed cached documents from Drive and removes all of
// its cache rows. Each row is removed before its file is deleted, conditioned
// on the row still being available, so a claim that races with the purge
// keeps its file (at worst a cached document leaks in Drive if the delete then
// fails). A row an earlier version left "claimed" is dropped without touching
// the file, which may by now belong to a puzzle.
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

async function deleteDroppedDocuments(
  type: GdriveMimeTypesType,
  ids: string[],
) {
  if (!(await isGoogleAvailable())) {
    Logger.warn("Dropped cached documents remain in Drive: Google is off", {
      type,
      count: ids.length,
    });
    return;
  }
  for (const fileId of ids) {
    try {
      await deleteDocument(fileId);
    } catch (error) {
      Logger.error("Failed to delete cached document; it remains in Drive", {
        fileId,
        error,
      });
    }
    await setTimeout(documentCacheSettings.deletionDelayMs);
  }
}

// Drops every hunt's unclaimed cached documents of one type, for when the
// Drive template for that type changes: they were copied from the old one,
// and new puzzles should get the new one. Each hunt's rows go under its
// cache lock, so a refill already running on this server finishes (and its
// copies are dropped too) first. This server's backoffs for the type are
// cleared, since a broken template is the likeliest reason for them. The
// files are deleted from Drive in the background; the caches refill from the
// new template on the next sweep or puzzle. Resolves with how many were
// dropped.
export async function dropCachedDocumentsOfType(
  type: GdriveMimeTypesType,
): Promise<number> {
  for (const [key] of backoffs) {
    if (key.endsWith(`:${type}`)) {
      backoffs.delete(key);
    }
  }

  const hunts = new Set<string>(inFlight.keys());
  await CachedDocuments.find(
    { "value.type": type, status: "available" },
    { projection: { hunt: 1 } },
  ).forEachAsync((doc) => {
    hunts.add(doc.hunt);
  });

  const dropped: string[] = [];
  for (const huntId of hunts) {
    await withRenewedLock(lockName(huntId), async () => {
      const cached = await CachedDocuments.find({
        hunt: huntId,
        status: "available",
        "value.type": type,
      }).fetchAsync();
      for (const doc of cached) {
        const removed = await CachedDocuments.removeAsync({
          _id: doc._id,
          status: "available",
        });
        if (removed > 0) {
          dropped.push(doc.value.id);
        }
      }
    });
  }

  Logger.info("Dropped cached documents copied from an old template", {
    type,
    dropped: dropped.length,
  });
  if (dropped.length > 0) {
    const deletion = deleteDroppedDocuments(type, dropped)
      .catch((error) => {
        Logger.error("Failed to delete dropped cached documents", {
          type,
          count: dropped.length,
          error,
        });
      })
      .finally(() => {
        pendingDeletions.delete(deletion);
      });
    pendingDeletions.add(deletion);
  }
  return dropped.length;
}
