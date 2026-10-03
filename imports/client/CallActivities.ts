import { Mongo } from "meteor/mongo";

// Mirrors the server-only CallActivities model for the rows that
// puzzleHistoryForUser publishes. The server keeps the model itself.
export type CallActivityType = {
  _id: string;
  ts: Date;
  hunt: string;
  call: string;
  user: string;
  speaking: boolean;
};

export default new Mongo.Collection<CallActivityType>("jr_call_activities");
