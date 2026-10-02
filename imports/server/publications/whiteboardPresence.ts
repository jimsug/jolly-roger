import { check } from "meteor/check";
import Flags from "../../Flags";
import MeteorUsers from "../../lib/models/MeteorUsers";
import WhiteboardPresence from "../../lib/models/WhiteboardPresence";
import Whiteboards from "../../lib/models/Whiteboards";
import whiteboardPresence from "../../lib/publications/whiteboardPresence";
import { removePresence } from "../whiteboardLive";
import definePublication from "./definePublication";

definePublication(whiteboardPresence, {
  validate(arg) {
    check(arg, { boardId: String });
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
      void removePresence(boardId, connectionId);
    });

    return WhiteboardPresence.find(
      { board: boardId, connection: { $ne: connectionId } },
      { projection: { server: 0 } },
    );
  },
});
