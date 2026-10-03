import { Meteor } from "meteor/meteor";
import * as Sentry from "@sentry/node";
import { scrubTelemetry } from "../lib/scrubTelemetry";
import addRuntimeConfig from "./addRuntimeConfig";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 1,
    release: Meteor.gitCommitHash,
    environment: Meteor.isDevelopment ? "development" : "production",
    // Request spans carry the full path, query string, Referer and client
    // address of every request
    beforeSend: scrubTelemetry,
    beforeSendTransaction: scrubTelemetry,
  });

  addRuntimeConfig(() => {
    return { sentryDsn: dsn };
  });
}
