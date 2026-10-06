import { Accounts } from "meteor/accounts-base";
import { Random } from "meteor/random";
import FixtureHunt from "../../imports/FixtureHunt";
import MeteorUsers from "../../imports/lib/models/MeteorUsers";
import Puzzles from "../../imports/lib/models/Puzzles";
import Settings from "../../imports/lib/models/Settings";
import WhiteboardNodes from "../../imports/lib/models/WhiteboardNodes";
import { MAX_INK_POINTS_PER_BOARD } from "../../imports/lib/whiteboard/limits";
import Locks from "../../imports/server/models/Locks";
import { ensureWhiteboard } from "../../imports/server/whiteboard";
import createTestHunt from "./createTestHunt";

// Fixtures the whiteboard server tests share. The hunt is the fixture hunt.

const huntId = FixtureHunt._id;

// A new account, in the hunt with these roles when any are given
export async function makeUser(email: string, roles?: string[]) {
  const userId = await Accounts.createUserAsync({
    email,
    password: "password",
  });
  if (roles) {
    await MeteorUsers.updateAsync(userId, {
      $set: { hunts: [huntId], roles: { [huntId]: roles } },
    });
  }
  return userId;
}

// An ink stroke of `count` points that zigzags, so simplifying keeps every
// one of them
export const zigzag = (count: number, position?: { x: number; y: number }) => ({
  _id: Random.id(),
  type: "ink" as const,
  position: position ?? { x: 0, y: 0 },
  strokeWidth: "thin" as const,
  stroke: Random.id(),
  points: Array.from({ length: count }, (_, i): [number, number, number] => [
    i * 5,
    (i % 2) * 5,
    0.5,
  ]),
});

// Ink straight into the board, bypassing the budget, leaving `room` points of
// it (or past it, for a negative room). Returns the stroke's id.
export const fillInk = (boardId: string, room: number, createdBy: string) =>
  WhiteboardNodes.insertAsync({
    hunt: huntId,
    board: boardId,
    type: "ink",
    position: { x: 0, y: 0 },
    strokeWidth: "thin",
    points: Array.from(
      { length: MAX_INK_POINTS_PER_BOARD - room },
      (_, i): [number, number, number] => [i % 1000, i % 7, 0.5],
    ),
    createdBy,
  });

// Another hunt the operator runs, with its whiteboard. `puzzles` are titles of
// puzzles put in the hunt before the board is seeded, so they get cards.
export async function otherHuntBoard(operator: string, puzzles: string[] = []) {
  const hunt = await createTestHunt(operator);
  await MeteorUsers.updateAsync(operator, {
    $addToSet: { hunts: hunt },
    $set: { [`roles.${hunt}`]: ["operator"] },
  });
  for (const title of puzzles) {
    await Puzzles.insertAsync({
      hunt,
      title,
      tags: [],
      answers: [],
      expectedAnswerCount: 1,
      createdBy: operator,
    });
  }
  const board = await ensureWhiteboard(operator, hunt);
  return { hunt, board };
}

export const IMAGE_BUCKET = {
  bucketName: "jr-test-images",
  bucketRegion: "ap-southeast-2",
};
// The url of an object in the image bucket
export const inBucket = (key: string) =>
  `https://s3.${IMAGE_BUCKET.bucketRegion}.amazonaws.com/${IMAGE_BUCKET.bucketName}/${key}`;
// Where an upload for a puzzle's chat would be
export const uploadUrl = (hunt: string, puzzle: string) =>
  inBucket(`${hunt}/${puzzle}/${Random.id()}`);
// Points image uploads at the test bucket, as the settings page would
export const withImageBucket = (createdBy: string) =>
  Settings.insertAsync({
    name: "s3.image_bucket",
    value: IMAGE_BUCKET,
    createdBy,
  });

// Another server after the board's lock. steal() takes the lock the first time
// it's called while someone holds it, letGo() hands it back, and `held` is the
// stolen lock while it's held.
export function lockThief(boardId: string) {
  const lockName = `whiteboard:${boardId}`;
  let held: string | undefined;
  return {
    get held() {
      return held;
    },
    steal: async () => {
      const theirs = await Locks.findOneAsync({ name: lockName });
      if (theirs && !held) {
        await Locks.removeAsync(theirs._id);
        held = await Locks.insertAsync({ name: lockName });
      }
    },
    letGo: async () => {
      if (held) await Locks.removeAsync(held);
      held = undefined;
    },
  };
}
