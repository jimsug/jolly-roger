import { Meteor } from "meteor/meteor";
import type { HuntType } from "../lib/models/Hunts";
import Hunts from "../lib/models/Hunts";
import MeteorUsers from "../lib/models/MeteorUsers";
import Puzzles from "../lib/models/Puzzles";

// Checks the hunt and puzzle a notification method was called with: both
// must exist, the puzzle must belong to the hunt, and the caller must be a
// member. Deleted puzzles still count, since their notifications linger.
export default async function checkPuzzleNotificationScope(
  userId: string,
  huntId: string,
  puzzleId: string,
): Promise<{ user: Meteor.User; hunt: HuntType }> {
  const hunt = await Hunts.findOneAsync(huntId);
  if (!hunt) {
    throw new Meteor.Error(404, "Unknown hunt id");
  }

  const puzzle = await Puzzles.findOneAllowingDeletedAsync(puzzleId);
  if (!puzzle || puzzle.hunt !== huntId) {
    throw new Meteor.Error(404, "Unknown puzzle id for hunt");
  }

  const user = await MeteorUsers.findOneAsync(userId);
  if (!user?.hunts?.includes(huntId)) {
    throw new Meteor.Error(
      403,
      `User ${userId} is not a member of hunt ${huntId}`,
    );
  }

  return { user, hunt };
}
