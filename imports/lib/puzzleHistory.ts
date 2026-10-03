import type { Solvedness } from "./solvedness";

// Pseudo-collections published to the puzzle history page

export const PUZZLE_HISTORY_SUMMARIES = "puzzleHistorySummaries";

export type PuzzleHistoryItem = {
  _id: string; // the puzzle id
  userId: string;
  puzzleId: string;
  name: string;
  huntId: string;
  huntName: string;
  firstInteraction: Date | null;
  lastInteraction: Date | null;
  interactionCount: number;
  bookmarkCounter: number;
  callCounter: number;
  chatCounter: number;
  documentCounter: number;
  guessCounter: number;
  correctGuessCounter: number;
  solvedness: Solvedness;
  answers: string[];
  tags: string[];
  // Set on the row for a hunt's whiteboard (its hidden puzzle), which isn't a
  // puzzle and lives at the hunt's whiteboard page
  whiteboard?: boolean;
};

export const ACTIVITY_HISTORY_SUMMARIES = "activityHistorySummaries";

export const ACTIVITY_HISTORY_TYPES = ["Call", "Chat", "Document"] as const;
export type ActivityHistoryType = (typeof ACTIVITY_HISTORY_TYPES)[number];

export type ActivityHistorySummary = {
  _id: string; // "<hunt>-<day of week>-<hour>-<type>"
  huntId: string;
  dayOfWeek: number; // 0 (Sun) - 6 (Sat), UTC
  hour: number; // 0 - 23, UTC
  type: ActivityHistoryType;
  count: number;
};
