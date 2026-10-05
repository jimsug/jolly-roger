import { Mongo } from "meteor/mongo";
import type { WhiteboardLiveState } from "../methods/setWhiteboardLive";

// Other people's cursors, drags, strokes, selections and editing on a board,
// as the whiteboardPresence publication sends them. The model itself (with
// the server and connection each document belongs to) stays on the server.
type WhiteboardPresenceType = {
  _id: string;
  board: string;
  user: string;
} & Partial<WhiteboardLiveState>;

export default new Mongo.Collection<WhiteboardPresenceType>(
  "jr_whiteboard_presence",
);
