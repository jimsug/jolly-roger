import { Meteor } from "meteor/meteor";
import Logger from "../../Logger";
import { replenishAllDocumentCaches } from "../documentCache";
import onExit from "../onExit";
import { startupComplete } from "../runIfLatestBuild";

// Tops up every active hunt's document cache at startup and periodically
// thereafter, so the cache recovers from failed refills and hunts that saw
// no puzzle activity. Every server runs this; the per-hunt lock inside each
// pass keeps them from doubling up on Drive.
const REPLENISH_INTERVAL_MS = 13 * 60 * 1000;

function replenish() {
  replenishAllDocumentCaches().catch((error) => {
    Logger.error("Periodic document cache replenishment failed", { error });
  });
}

if (!Meteor.isTest && !Meteor.isAppTest) {
  Meteor.startup(async () => {
    // Schemas, indexes and migrations first
    await startupComplete;
    replenish();
    const handle = Meteor.setInterval(replenish, REPLENISH_INTERVAL_MS);
    onExit(() => Meteor.clearInterval(handle));
  });
}
