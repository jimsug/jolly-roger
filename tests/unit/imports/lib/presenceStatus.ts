import { assert } from "chai";
import {
  ACTIVE_SLACK_MS,
  CURRENT_ACTIVITY_MS,
  hunterStatus,
  IDLE_TIMEOUT_MS,
  isCurrentActivity,
  RECENTLY_SEEN_MS,
  viewerStatus,
} from "../../../../imports/lib/presenceStatus";
import type { UserStatusSummary } from "../../../../imports/lib/summarizeUserStatuses";

const now = new Date(Date.UTC(2026, 0, 1, 12, 0));
const ago = (ms: number) => new Date(now.getTime() - ms);
const longAgo = ago(60 * 60 * 1000);

const summary = (
  status: UserStatusSummary["status"],
  puzzleStatus: UserStatusSummary["puzzleStatus"] = {},
): UserStatusSummary => ({ status, puzzleStatus });

describe("presenceStatus", function () {
  describe("hunterStatus", function () {
    it("is offline without a reported status", function () {
      assert.equal(hunterStatus(undefined, now), "offline");
      assert.equal(hunterStatus(summary({ status: "online" }), now), "offline");
      assert.equal(
        hunterStatus(summary({ status: "offline" }, { at: now }), now),
        "offline",
        "Puzzle activity on its own doesn't count",
      );
    });

    it("is online while a connection says so, however long ago", function () {
      assert.equal(
        hunterStatus(summary({ status: "online", at: longAgo }), now),
        "online",
      );
    });

    it("counts a recent report of any status as online", function () {
      for (const status of ["away", "offline"] as const) {
        assert.equal(
          hunterStatus(summary({ status, at: ago(RECENTLY_SEEN_MS - 1) }), now),
          "online",
          status,
        );
        assert.equal(
          hunterStatus(summary({ status, at: ago(RECENTLY_SEEN_MS) }), now),
          status,
        );
      }
    });

    it("counts recent puzzle activity as online", function () {
      assert.equal(
        hunterStatus(
          summary(
            { status: "away", at: longAgo },
            { at: ago(RECENTLY_SEEN_MS - 1) },
          ),
          now,
        ),
        "online",
      );
      assert.equal(
        hunterStatus(
          summary(
            { status: "away", at: longAgo },
            { at: ago(RECENTLY_SEEN_MS) },
          ),
          now,
        ),
        "away",
      );
    });
  });

  describe("isCurrentActivity", function () {
    it("is current for CURRENT_ACTIVITY_MS", function () {
      assert.isTrue(isCurrentActivity(now, now));
      assert.isTrue(isCurrentActivity(ago(CURRENT_ACTIVITY_MS - 1), now));
      assert.isFalse(isCurrentActivity(ago(CURRENT_ACTIVITY_MS), now));
      assert.isFalse(isCurrentActivity(undefined, now));
    });
  });

  describe("viewerStatus", function () {
    it("is online while a tab is visible, or when it isn't known", function () {
      assert.equal(
        viewerStatus({ visible: true, updatedAt: longAgo }, now),
        "online",
      );
      assert.equal(viewerStatus({}, now), "online");
    });

    it("goes idle, then away, once every tab is hidden", function () {
      const hidden = (sinceSeen: number) =>
        viewerStatus({ visible: false, updatedAt: ago(sinceSeen) }, now);
      assert.equal(hidden(ACTIVE_SLACK_MS - 1), "online");
      assert.equal(hidden(ACTIVE_SLACK_MS), "idle");
      assert.equal(hidden(IDLE_TIMEOUT_MS - 1), "idle");
      assert.equal(hidden(IDLE_TIMEOUT_MS), "away");
      assert.equal(viewerStatus({ visible: false }, now), "away");
    });
  });
});
