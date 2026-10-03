import { Meteor } from "meteor/meteor";
import * as Sentry from "@sentry/react";
import { useEffect } from "react";
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from "react-router";
import { scrubTelemetry } from "../lib/scrubTelemetry";

if (__meteor_runtime_config__.sentryDsn) {
  Sentry.init({
    dsn: __meteor_runtime_config__.sentryDsn,
    integrations: [
      Sentry.reactRouterBrowserTracingIntegration({
        useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      }),
    ],
    tracesSampleRate: 1,
    release: Meteor.gitCommitHash,
    environment: Meteor.isDevelopment ? "development" : "production",
    // Page loads are named after the raw path, which for account and
    // invitation links includes the token
    beforeSend: scrubTelemetry,
    beforeSendTransaction: scrubTelemetry,
  });
}
