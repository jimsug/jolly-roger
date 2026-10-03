import UserStatuses, {
  type PuzzleStatusSource,
} from "../lib/models/UserStatuses";

type PuzzleStatus = {
  hunt: string;
  user: string;
  puzzle: string;
  status: PuzzleStatusSource;
};

// Notes the puzzle a user just interacted with (chat, sheet edit, call), one
// row per user per hunt. These rows have no owning server, so they only go
// away through the collection's TTL index.
export default async function recordPuzzleStatus({
  hunt,
  user,
  puzzle,
  status,
}: PuzzleStatus): Promise<void> {
  await UserStatuses.upsertAsync(
    { hunt, user, type: "puzzleStatus" },
    { $set: { status, puzzle } },
  );
}

// Re-stamps the user's row only if it is older than maxAgeMs. No row is
// created and a fresh one is left alone, so a caller who is swept every few
// seconds gets at most one write per bucket.
export async function refreshPuzzleStatus({
  hunt,
  user,
  puzzle,
  status,
  maxAgeMs,
}: PuzzleStatus & { maxAgeMs: number }): Promise<void> {
  await UserStatuses.updateAsync(
    {
      hunt,
      user,
      type: "puzzleStatus",
      updatedAt: { $lt: new Date(Date.now() - maxAgeMs) },
    },
    { $set: { status, puzzle } },
  );
}
