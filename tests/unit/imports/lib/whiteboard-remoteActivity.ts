import { assert } from "chai";
import {
  othersEditing,
  othersSelecting,
  REMOTE_EDITING_TIMEOUT_MS,
} from "../../../../imports/lib/whiteboard/remoteActivity";

describe("whiteboard remote activity", function () {
  const now = 1_000_000;

  describe("othersEditing", function () {
    it("names someone else typing in a node, until they've been quiet too long", function () {
      const presence = [{ user: "ada", editing: "note", changedAt: now }];
      assert.deepEqual(othersEditing(presence, "me", now), {
        editing: new Map([["note", "ada"]]),
        staleAt: now + REMOTE_EDITING_TIMEOUT_MS,
      });
      assert.equal(
        othersEditing(presence, "me", now + REMOTE_EDITING_TIMEOUT_MS - 1)
          .editing.size,
        1,
      );
      assert.deepEqual(
        othersEditing(presence, "me", now + REMOTE_EDITING_TIMEOUT_MS),
        { editing: new Map(), staleAt: undefined },
      );
    });

    it("leaves out the viewer's own tabs, and tabs typing in nothing", function () {
      assert.deepEqual(
        othersEditing(
          [
            { user: "me", editing: "note", changedAt: now },
            { user: "ada", editing: null, changedAt: now },
            { user: "bea", changedAt: now },
          ],
          "me",
          now,
        ),
        { editing: new Map(), staleAt: undefined },
      );
    });

    it("names the first of two people typing in one thing, and goes stale with the first to", function () {
      const { editing, staleAt } = othersEditing(
        [
          { user: "ada", editing: "note", changedAt: now },
          { user: "bea", editing: "note", changedAt: now - 1000 },
          { user: "cat", editing: "line", changedAt: now - 2000 },
        ],
        undefined,
        now,
      );
      assert.deepEqual(
        editing,
        new Map([
          ["note", "ada"],
          ["line", "cat"],
        ]),
      );
      assert.equal(staleAt, now - 2000 + REMOTE_EDITING_TIMEOUT_MS);
    });

    it("has nothing for no one", function () {
      assert.deepEqual(othersEditing([], "me", now), {
        editing: new Map(),
        staleAt: undefined,
      });
    });
  });

  describe("othersSelecting", function () {
    it("lists who has each node selected, once each and in order, leaving out the viewer", function () {
      assert.deepEqual(
        othersSelecting(
          [
            { user: "cat", selection: ["a", "b"] },
            { user: "ada", selection: ["a"] },
            { user: "cat", selection: ["a"] },
            { user: "me", selection: ["c"] },
            { user: "bea", selection: null },
            { user: "dot" },
          ],
          "me",
        ),
        new Map([
          ["a", ["ada", "cat"]],
          ["b", ["cat"]],
        ]),
      );
      assert.deepEqual(othersSelecting([], "me"), new Map());
    });
  });
});
