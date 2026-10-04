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
    sendDefaultPii: false,
    integrations: [
      // A request body can be anything a page sent. Over SockJS's polling
      // fallback that's whole DDP messages, logins and resume tokens included.
      Sentry.httpIntegration({ maxIncomingRequestBodySize: "none" }),
      // Headers carry API keys (Authorization) and cookies
      Sentry.requestDataIntegration({
        include: { cookies: false, data: false, headers: false },
      }),
    ],
    // Request spans carry the full path, query string, Referer and client
    // address of every request
    beforeSend: scrubTelemetry,
    beforeSendTransaction: scrubTelemetry,
  });

  addRuntimeConfig(() => {
    return { sentryDsn: dsn };
  });
}
