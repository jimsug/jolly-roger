import { Mongo } from "meteor/mongo";
import {
  ACTIVITY_HISTORY_SUMMARIES,
  type ActivityHistorySummary,
} from "../lib/puzzleHistory";

// Pseudo-collection fed by activitySummaryForUser
export default new Mongo.Collection<ActivityHistorySummary>(
  ACTIVITY_HISTORY_SUMMARIES,
);
