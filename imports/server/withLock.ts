import { Meteor } from "meteor/meteor";
import Logger from "../Logger";
import ignoringDuplicateKeyErrors from "./ignoringDuplicateKeyErrors";
import type { LockType } from "./models/Locks";
import Locks from "./models/Locks";

// 10 seconds
export const PREEMPT_TIMEOUT = 10000;

function tryAcquire(name: string) {
  return ignoringDuplicateKeyErrors(() => {
    // Because the Mongo.Collection doesn't know about SimpleSchema
    // autovalues, it doesn't know which fields are actually required. Cast to
    // any since this is known safe
    return Locks.insertAsync(<any>{ name });
  });
}

async function release(lock: string) {
  await Locks.removeAsync(lock);
}

// Counts a critical section's writes, renewing its lock after every n of
// them. Returns the counter to call after each write.
export function renewEvery(renew: () => Promise<void>, n: number) {
  let writes = 0;
  return async () => {
    writes += 1;
    if (writes % n === 0) await renew();
  };
}

// What renew() throws once another holder has taken the lock.
export class LockPreemptedError extends Error {
  constructor(id: string) {
    super(`Lock was preempted: id=${id}`);
    this.name = "LockPreemptedError";
  }
}

async function renew(id: string) {
  const updated = await Locks.updateAsync(id, {
    $set: { renewedAt: new Date() },
  });
  if (updated === 0) {
    // we've already been preempted
    throw new LockPreemptedError(id);
  }
}

export default async function withLock<T>(
  name: string,
  critSection: (renew: () => Promise<void>) => Promise<T>,
) {
  while (true) {
    let handle: Meteor.LiveQueryHandle | undefined;
    let lock: string | undefined;
    let timeoutHandle: number | undefined;

    const cleanupWatches = () => {
      if (handle) {
        handle.stop();
        handle = undefined;
      }
      if (timeoutHandle) {
        Meteor.clearTimeout(timeoutHandle);
        timeoutHandle = undefined;
      }
    };
    try {
      const cursor = Locks.find({ name });

      // Setup the watch now so we don't race between when we check
      // for the lock and when we wait for preemption
      const removed = new Promise<undefined>((resolve, reject) => {
        cursor
          .observeChangesAsync({
            removed() {
              resolve(undefined);
            },
          })
          .then((handleThunk) => {
            handle = handleThunk;
          })
          .catch(reject);
      });

      lock = await tryAcquire(name);
      if (lock) {
        const lockId = lock;
        return await critSection(() => renew(lockId));
      }

      // Lock is held, so wait until we can preempt
      const timedOut = new Promise<LockType | undefined>((resolve) => {
        const waitForDeadline = async () => {
          const otherLock = (await cursor.fetchAsync())[0];
          if (!otherLock) {
            // Lock was deleted, so removed promise will resolve
            resolve(undefined);
            return;
          }

          const deadline =
            (otherLock.renewedAt || otherLock.createdAt).getTime() +
            PREEMPT_TIMEOUT;
          const timeout = deadline - Date.now();

          if (timeout <= 0) {
            // Lock is expired, so we can preempt it
            resolve(otherLock);
            return;
          }

          // Otherwise wait until expiration and then check again
          timeoutHandle = Meteor.setTimeout(waitForDeadline, timeout);
        };
        waitForDeadline().catch((error) => {
          Logger.error("withLock waitForDeadline() threw", { name, error });
        });
      });

      // If we time out, then preempt
      const preemptableLock = await Promise.race([removed, timedOut]);
      cleanupWatches();
      if (preemptableLock) {
        Logger.warn("Preempting lock", { id: preemptableLock._id, name });
        await Locks.removeAsync({
          _id: preemptableLock._id,
          renewedAt: preemptableLock.renewedAt,
        });
      }
    } finally {
      cleanupWatches();

      if (lock) {
        await release(lock);
      }
    }
  }
}

// withLock only learns that the lock is still wanted when renew() is called,
// and a single slow call (a Drive request with gaxios's retries, say) can
// outlast the preemption timeout, which would let another server take the
// lock. This renews on a timer for the whole critical section, as the Discord
// daemon does. A failed renewal aborts the signal, which the critical section
// checks between steps.
export function withRenewedLock<T>(
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
