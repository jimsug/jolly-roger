import { ACTIVITY_GRANULARITY } from "../lib/config/activityTracking";
import roundedTime from "../lib/roundedTime";
import ignoringDuplicateKeyErrors from "./ignoringDuplicateKeyErrors";
import CallActivities from "./models/CallActivities";
import recordPuzzleStatus, { refreshPuzzleStatus } from "./recordPuzzleStatus";

// We insert-and-ignore-duplicates rather than upsert so we never clobber a
// speaking record
export default async function recordCallPresence({
  hunt,
  call,
  user,
  ts = roundedTime(ACTIVITY_GRANULARITY),
}: {
  hunt: string;
  call: string;
  user: string;
  ts?: Date;
}): Promise<void> {
  const inserted = await ignoringDuplicateKeyErrors(() =>
    CallActivities.insertAsync({
      hunt,
      call,
      user,
      ts,
      speaking: false,
    }),
  );

  // Being on the call also makes it the puzzle the user is active on. The
  // presence sweep calls this on every server, every few seconds, for every
  // peer, and each presence write is published to everyone with the puzzle
  // or hunter list open, so the row is only stamped when this bucket's
  // activity row was actually created: once per peer per bucket. When the
  // speaking observer created the bucket's row first, the presence row is
  // re-stamped once it is a bucket old instead.
  const status = { hunt, user, puzzle: call, status: "call" as const };
  if (inserted) {
    await recordPuzzleStatus(status);
  } else {
    await refreshPuzzleStatus({ ...status, maxAgeMs: ACTIVITY_GRANULARITY });
  }
}
