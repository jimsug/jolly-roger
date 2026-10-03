import type { PresenceStatus } from "./models/UserStatuses";

export type UserStatusRow = {
  user: string;
  type: string;
  status: string;
  updatedAt: Date;
  puzzle?: string | undefined;
};

export type UserStatusSummary = {
  // The best presence across the user's connections and when it was last
  // reported
  status: { status: PresenceStatus; at?: Date };
  // The puzzle the user last interacted with, how ("chat", "document",
  // "call") and when
  puzzleStatus: {
    source?: string;
    at?: Date;
    puzzle?: string;
  };
};

const PRESENCE_RANK: Record<PresenceStatus, number> = {
  offline: 0,
  away: 1,
  online: 2,
};

function isPresenceStatus(status: string): status is PresenceStatus {
  return Object.hasOwn(PRESENCE_RANK, status);
}

function emptySummary(): UserStatusSummary {
  return { status: { status: "offline" }, puzzleStatus: {} };
}

// Reduces a hunt's UserStatuses rows to one summary per user. A user with any
// online connection is online, otherwise away if any connection is away,
// otherwise offline; the timestamp is the newest row with the winning
// status. The puzzle status is simply the newest puzzleStatus row.
export default function summarizeUserStatuses(
  rows: UserStatusRow[],
): Record<string, UserStatusSummary> {
  const summaries: Record<string, UserStatusSummary> = {};
  for (const row of rows) {
    let summary = summaries[row.user];
    if (!summary) {
      summary = emptySummary();
      summaries[row.user] = summary;
    }

    if (row.type === "puzzleStatus") {
      if (!summary.puzzleStatus.at || row.updatedAt > summary.puzzleStatus.at) {
        summary.puzzleStatus = {
          source: row.status,
          at: row.updatedAt,
          puzzle: row.puzzle,
        };
      }
      continue;
    }

    if (row.type !== "status" || !isPresenceStatus(row.status)) {
      continue;
    }
    const current = summary.status;
    if (PRESENCE_RANK[row.status] > PRESENCE_RANK[current.status]) {
      summary.status = { status: row.status, at: row.updatedAt };
    } else if (
      row.status === current.status &&
      (!current.at || row.updatedAt > current.at)
    ) {
      current.at = row.updatedAt;
    }
  }
  return summaries;
}
