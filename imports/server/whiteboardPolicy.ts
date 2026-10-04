import { Meteor } from "meteor/meteor";
import Logger from "../Logger";
import MeteorUsers from "../lib/models/MeteorUsers";
import type { WhiteboardEditPolicy } from "../lib/models/Whiteboards";
import Whiteboards from "../lib/models/Whiteboards";
import {
  userMayMakeOperatorForHunt,
  whiteboardAccess,
} from "../lib/permission_stubs";
import { Id } from "../lib/typedModel/regexes";
import { MAX_WHITEBOARD_EDITORS } from "../lib/whiteboard/limits";
import WhiteboardPresence from "./models/WhiteboardPresence";
import { forgetBoardAccess } from "./whiteboardLive";
import { loadBoardAccess } from "./whiteboardShared";

// Sets who may edit a board. Only the hunt's assigned operators and admins
// may: on a hunt that makes every member an operator, any member could
// otherwise lock everyone else out.
export async function setEditPolicy(
  userId: string,
  boardId: string,
  editPolicy: WhiteboardEditPolicy,
  editors: string[],
) {
  const { board, hunt, user } = await loadBoardAccess(userId, boardId);
  if (!userMayMakeOperatorForHunt(user, hunt)) {
    throw new Meteor.Error(
      403,
      "Only the hunt's assigned operators can change who edits the whiteboard",
    );
  }
  if (hunt.isArchived) {
    throw new Meteor.Error(403, "This hunt is archived");
  }

  const listed = [...new Set(editors)];
  if (!listed.every((id) => Id.test(id))) {
    throw new Meteor.Error(400, "Invalid user id");
  }
  if (listed.length > MAX_WHITEBOARD_EDITORS) {
    throw new Meteor.Error(400, "Too many people on the list");
  }
  // People who have left the hunt are dropped rather than refused, so a list
  // that still names one can be saved under any policy.
  const members = new Set(
    await MeteorUsers.find(
      { _id: { $in: listed }, hunts: hunt._id },
      { projection: { _id: 1 } },
    ).mapAsync((u) => u._id),
  );
  const kept = listed.filter((id) => members.has(id));

  await Whiteboards.updateAsync(board._id, {
    $set: { editPolicy, editors: kept },
  });
  Logger.info("Whiteboard edit policy changed", {
    board: board._id,
    editPolicy,
    editors: kept.length,
  });
  forgetBoardAccess(board._id);

  // Whatever someone who can no longer edit was dragging or drawing goes
  // now, rather than when they next move.
  const updated = { ...board, editPolicy, editors: kept };
  const present = await WhiteboardPresence.find(
    { board: board._id },
    { projection: { user: 1 } },
  ).mapAsync((p) => p.user);
  const people = await MeteorUsers.find(
    { _id: { $in: [...new Set(present)] } },
    { projection: { roles: 1, hunts: 1 } },
  ).fetchAsync();
  for (const person of people) {
    if (whiteboardAccess(person, hunt, updated).access === "edit") continue;
    await WhiteboardPresence.updateAsync(
      { board: board._id, user: person._id },
      { $set: { drag: null, stroke: null } },
      { multi: true },
    );
  }
}
