import Bugsnag from "@bugsnag/js";
import { createLogger } from "winston";
import Transport from "winston-transport";

export class BugsnagTransport extends Transport {
  public declare levels: Record<string, number>;

  public log(
    {
      level,
      message,
      userId: _userId,
      error,
      ...rest
    }: {
      level: string;
      message: string;
      userId?: string;
      error?: unknown;
      [key: string]: any;
    },
    next: () => void = () => {
      /* noop */
    },
  ) {
    // Every write has to call next: once this transport has a buffer's worth
    // of writes outstanding, winston stops writing to all of its transports
    if (!Bugsnag.isStarted() || !(error instanceof Error)) {
      next();
      return;
    }

    Bugsnag.notify(
      error,
      (event) => {
        event.context = message;

        if (this.levels[level]! <= this.levels.error!) {
          event.severity = "error";
        } else if (this.levels[level]! <= this.levels.warn!) {
          event.severity = "warning";
        } else {
          event.severity = "info";
        }

        event.addMetadata("extra", rest);
      },
      // Not next itself: a report that fails to send comes back as an error,
      // which would fail the log write and take the logger down with it
      () => next(),
    );
  }
}

const logger = createLogger({
  level: "verbose",
  transports: [new BugsnagTransport({ level: "warn" })],
});

export { logger };

const log = function (
  level: string,
  message: string,
  opts: {
    error?: unknown /* allow error to be unknown since that's what gets caught */;
    [key: string]: any;
  } = {},
) {
  logger.log(level, message, opts);
};

export default {
  log,
  error: log.bind(null, "error"),
  warn: log.bind(null, "warn"),
  info: log.bind(null, "info"),
  verbose: log.bind(null, "verbose"),
  debug: log.bind(null, "debug"),
};
