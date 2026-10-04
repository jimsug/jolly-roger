import { Meteor } from "meteor/meteor";
import Logger from "../../Logger";
import {
  DOCUMENT_CACHE_SWEEP_INTERVAL_MS,
  replenishAllDocumentCaches,
} from "../documentCache";
import onExit from "../onExit";
import { startupComplete } from "../startupComplete";

function replenish() {
  replenishAllDocumentCaches().catch((error) => {
    Logger.error("Periodic document cache replenishment failed", { error });
  });
}

// Tops up every active hunt's document cache at startup and every
// DOCUMENT_CACHE_SWEEP_INTERVAL_MS thereafter, so the cache recovers from
// failed refills in hunts with recent puzzle activity. Every server runs
// this; the per-hunt lock inside each pass keeps them from doubling up on
// Drive.
if (!Meteor.isTest && !Meteor.isAppTest) {
  Meteor.startup(async () => {
    // Schemas, indexes and migrations first
    await startupComplete;
    replenish();
    const handle = Meteor.setInterval(
      replenish,
      DOCUMENT_CACHE_SWEEP_INTERVAL_MS,
    );
    onExit(() => Meteor.clearInterval(handle));
  });
}
