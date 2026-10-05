import { check } from "meteor/check";
import Flags from "../../Flags";
import Logger from "../../Logger";
import MeteorUsers from "../../lib/models/MeteorUsers";
import Whiteboards from "../../lib/models/Whiteboards";
import whiteboardPresence from "../../lib/publications/whiteboardPresence";
import WhiteboardPresence from "../models/WhiteboardPresence";
import { removePresence } from "../whiteboardLive";
import { IdPattern } from "../whiteboardShared";
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
    if (!this.userId || !this.connection) {
      return [];
    }

    const board = await Whiteboards.findOneAsync(boardId);
    const user = await MeteorUsers.findOneAsync(this.userId);
    if (!board || !user?.hunts?.includes(board.hunt)) {
      return [];
    }

    if (
      (await Flags.activeAsync("disable.whiteboard")) ||
      (await Flags.activeAsync("disable.whiteboard_live"))
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
