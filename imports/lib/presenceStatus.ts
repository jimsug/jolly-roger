import type { PresenceStatus } from "./models/UserStatuses";
import type { UserStatusSummary } from "./summarizeUserStatuses";

// How the hunter list, the chat pane and the puzzle list's viewers column
// decide whether someone is around. They read different records (a hunt's
// UserStatuses rows, a puzzle's subscribers), so each has its own thresholds.

// A hunt status reported this recently still counts as online, so a brief tab
// switch doesn't flicker a hunter's badge
export const RECENTLY_SEEN_MS = 2 * 60 * 1000;
// Puzzle activity newer than this is "now" rather than "N seconds ago"
export const CURRENT_ACTIVITY_MS = 60 * 1000;

// A puzzle viewer whose tabs are all hidden counts as online this long after
// it was last seen, idle for a while after that, then away
export const ACTIVE_SLACK_MS = 60 * 1000;
export const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

// On the puzzle list, a hidden tab or an interaction older than this no longer
// places the user on a puzzle
export const PASSIVE_VIEWER_WINDOW_MS = 5 * 60 * 1000;

export type ViewerStatus = "online" | "idle" | "away";

const isWithin = (at: Date | undefined, ms: number, now: Date) =>
  at !== undefined && now.getTime() - at.getTime() < ms;

// A hunter's status on the hunter list. A connection that says online, or any
// report or puzzle activity in the last couple of minutes, counts as online;
// otherwise away if a connection says so. No reported status counts as
// offline, whatever the puzzle activity.
export function hunterStatus(
  summary: UserStatusSummary | undefined,
  now: Date,
): PresenceStatus {
  const seenAt = summary?.status.at;
  if (!summary || !seenAt) {
    return "offline";
  }
  if (
    summary.status.status === "online" ||
    isWithin(seenAt, RECENTLY_SEEN_MS, now) ||
    isWithin(summary.puzzleStatus.at, RECENTLY_SEEN_MS, now)
  ) {
    return "online";
  }
  return summary.status.status === "away" ? "away" : "offline";
}

// Whether puzzle activity at `at` (if any) is current rather than a while ago
export function isCurrentActivity(at: Date | undefined, now: Date): boolean {
  return isWithin(at, CURRENT_ACTIVITY_MS, now);
}

// A puzzle viewer's dot in the chat pane, from their subscriber record: online
// while any tab is visible (or was until a moment ago), idle once every tab
// has been hidden a while, away after that. An unknown visibility counts as
// visible, and a hidden viewer with no timestamp as long gone.
export function viewerStatus(
  subscriber: { visible?: boolean; updatedAt?: Date },
  now: Date,
): ViewerStatus {
  if (subscriber.visible ?? true) {
    return "online";
  }
  const sinceSeen = now.getTime() - (subscriber.updatedAt?.getTime() ?? 0);
  if (sinceSeen >= IDLE_TIMEOUT_MS) {
    return "away";
  }
  if (sinceSeen >= ACTIVE_SLACK_MS) {
    return "idle";
  }
  return "online";
}
