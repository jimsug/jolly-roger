import { Meteor } from "meteor/meteor";
import Logger from "../../Logger";
import onExit from "../onExit";
import { startupComplete } from "../startupComplete";
import { pruneWhiteboardVersions } from "../whiteboardVersions";

// Thins every board's history (see versionsToPrune) once an hour. Every
// server runs this; the board's lock keeps passes from overlapping.
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;
const SIZE_LOG_INTERVAL_MS = 24 * 60 * 60 * 1000;

let sizesLoggedAt: number | undefined;

function prune() {
  const now = new Date();
  pruneWhiteboardVersions(now)
    .then((sizes) => {
      // Once a day, so a board that's filling up with ink shows up before
      // it reaches the cap.
      if (
        sizesLoggedAt !== undefined &&
        now.getTime() - sizesLoggedAt < SIZE_LOG_INTERVAL_MS
      ) {
        return;
      }
      sizesLoggedAt = now.getTime();
      sizes.forEach((bytes, board) => {
        Logger.info("Whiteboard history size", { board, bytes });
      });
    })
    .catch((error: unknown) => {
      Logger.error("Pruning whiteboard history failed", { error });
    });
}

if (!Meteor.isTest && !Meteor.isAppTest) {
  Meteor.startup(async () => {
    // Schemas, indexes and migrations first
    await startupComplete;
    prune();
    const handle = Meteor.setInterval(prune, PRUNE_INTERVAL_MS);
    onExit(() => Meteor.clearInterval(handle));
  });
}
