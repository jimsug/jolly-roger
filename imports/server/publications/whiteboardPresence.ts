import { check } from "meteor/check";
import Logger from "../../Logger";
import whiteboardPresence from "../../lib/publications/whiteboardPresence";
import WhiteboardPresence from "../models/WhiteboardPresence";
import { removePresence } from "../whiteboardLive";
import { boardForMember, IdPattern } from "../whiteboardShared";
import definePublication from "./definePublication";

// Everyone else's cursors, drags, strokes, selections, what they're typing
// in, what they're looking at and who they're following on a board. The
// subscriber's own connection is left out, and its document goes when the
// subscription stops. Server and connection ids stay on the server, as for
// user statuses.
definePublication(whiteboardPresence, {
  validate(arg) {
    check(arg, { boardId: IdPattern });
    return arg;
  },

  async run({ boardId }) {
    if (
      !this.connection ||
      !(await boardForMember(this.userId, boardId, "disable.whiteboard_live"))
    ) {
      return [];
    }

    const connectionId = this.connection.id;
    this.onStop(() => {
      removePresence(boardId, connectionId).catch((error: unknown) => {
        Logger.error("Failed to remove whiteboard presence", {
          board: boardId,
          connection: connectionId,
          error,
        });
      });
    });

    return WhiteboardPresence.find(
      { board: boardId, connection: { $ne: connectionId } },
      { projection: { server: 0, connection: 0 } },
    );
  },
});
