import type { Solvedness } from "./solvedness";

// Pseudo-collections published to the puzzle history page

export const PUZZLE_HISTORY_SUMMARIES = "puzzleHistorySummaries";

export type PuzzleHistoryItem = {
  _id: string; // the puzzle id
  puzzleId: string;
  name: string;
  huntId: string;
  huntName: string;
  firstInteraction?: Date;
  lastInteraction?: Date;
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

// What a user can do on a puzzle that the history page counts. The page maps
// each kind to its label.
export const ACTIVITY_KINDS = [
  "bookmark",
  "call",
  "chat",
  "document",
  "guess",
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

// The kinds the contribution graph buckets by hour
export const GRAPHED_ACTIVITY_KINDS = [
  "call",
  "chat",
  "document",
] as const satisfies readonly ActivityKind[];
export type GraphedActivityKind = (typeof GRAPHED_ACTIVITY_KINDS)[number];

export type ActivityHistorySummary = {
  _id: string; // "<hunt>-<day of week>-<hour>-<type>"
  huntId: string;
  dayOfWeek: number; // 0 (Sun) - 6 (Sat), UTC
  hour: number; // 0 - 23, UTC
  type: GraphedActivityKind;
  count: number;
};
