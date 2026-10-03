import { Mongo } from "meteor/mongo";
import {
  PUZZLE_HISTORY_SUMMARIES,
  type PuzzleHistoryItem,
} from "../lib/puzzleHistory";

// Pseudo-collection fed by puzzleHistorySummaryForUser
export default new Mongo.Collection<PuzzleHistoryItem>(
  PUZZLE_HISTORY_SUMMARIES,
);
