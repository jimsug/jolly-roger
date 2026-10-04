import Bugsnag from "@bugsnag/js";
import { assert } from "chai";
import sinon from "sinon";
import { createLogger } from "winston";
import Transport from "winston-transport";
import { BugsnagTransport } from "../../../imports/Logger";

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

describe("BugsnagTransport", function () {
  afterEach(function () {
    sinon.restore();
  });

  it("finishes the write when Bugsnag isn't started", function () {
    sinon.stub(Bugsnag, "isStarted").returns(false);
    const next = sinon.fake();
    new BugsnagTransport({ level: "warn" }).log(
      { level: "error", message: "failed", error: new Error("failed") },
      next,
    );
    assert.isTrue(next.calledOnce);
  });

  it("finishes the write when there's no error to report", function () {
    sinon.stub(Bugsnag, "isStarted").returns(true);
    const notify = sinon.stub(Bugsnag, "notify");
    const next = sinon.fake();
    new BugsnagTransport({ level: "warn" }).log(
      { level: "warn", message: "careful" },
      next,
    );
    assert.isTrue(notify.notCalled);
    assert.isTrue(next.calledOnce);
  });

  it("finishes the write without an error when a report fails to send", function () {
    sinon.stub(Bugsnag, "isStarted").returns(true);
    sinon
      .stub(Bugsnag, "notify")
      .callsArgWith(2, new Error("Event failed to send"));
    const next = sinon.fake();
    new BugsnagTransport({ level: "warn" }).log(
      { level: "error", message: "failed", error: new Error("failed") },
      next,
    );
    assert.isTrue(next.calledOnceWithExactly());
  });

  it("doesn't hold up the logger's other transports", async function () {
    sinon.stub(Bugsnag, "isStarted").returns(false);
    const seen: string[] = [];
    const logger = createLogger({
      transports: [
        new BugsnagTransport({ level: "warn" }),
        new Transport({
          log(info: { message: string }, next: () => void) {
            seen.push(info.message);
            next();
          },
        }),
      ],
    });

    // Well past a transport's buffer of 16 writes
    for (let i = 0; i < 40; i += 1) {
      logger.warn(`warning ${i}`);
    }
    logger.info("still logging");
    await wait(50);
    assert.include(seen, "still logging");
  });
});
