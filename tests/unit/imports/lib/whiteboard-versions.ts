import { assert } from "chai";
import type { WhiteboardEdgeType } from "../../../../imports/lib/models/WhiteboardEdges";
import type { WhiteboardNodeType } from "../../../../imports/lib/models/WhiteboardNodes";
import type { WhiteboardVersionKind } from "../../../../imports/lib/models/WhiteboardVersions";
import {
  MAX_NODES_PER_BOARD,
  MAX_VERSION_BYTES_PER_BOARD,
  VERSION_IDLE_MS,
  VERSION_INTERVAL_MS,
  VERSION_JOIN_MS,
  VERSION_KEEP_AFTER_HUNT,
} from "../../../../imports/lib/whiteboard/limits";
import type {
  PrunableVersion,
  RestorePlan,
  VersionSummary,
} from "../../../../imports/lib/whiteboard/versions";
import {
  pickToRestore,
  planItemRestore,
  planRestore,
  restoreItemSet,
  versionDecision,
  versionDifferences,
  versionsToPrune,
} from "../../../../imports/lib/whiteboard/versions";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const now = new Date(Date.UTC(2026, 9, 4, 12, 0, 0));
const ago = (ms: number) => new Date(now.getTime() - ms);

const base = {
  hunt: "hunt",
  board: "board",
  contributors: [],
  createdAt: new Date(0),
  updatedAt: new Date(0),
  createdBy: "creator",
};
const node = (
  _id: string,
  fields: Partial<WhiteboardNodeType> = {},
): WhiteboardNodeType => ({
  ...base,
  _id,
  type: "sticky",
  position: { x: 0, y: 0 },
  ...fields,
});
const card = (_id: string, puzzle: string, parent?: string) =>
  node(_id, { type: "puzzle", puzzle, parent });
const frame = (_id: string, fields: Partial<WhiteboardNodeType> = {}) =>
  node(_id, { type: "frame", width: 300, height: 200, ...fields });
const edge = (
  _id: string,
  source: string,
  target: string,
  fields: Partial<WhiteboardEdgeType> = {},
): WhiteboardEdgeType => ({ ...base, _id, source, target, ...fields });

describe("whiteboard versions", function () {
  describe("versionDecision", function () {
    const version = (
      _id: string,
      createdAt: Date,
      users: [string, Date][],
      kind: WhiteboardVersionKind = "edits",
      hash = "a".repeat(64),
    ): VersionSummary => ({
      _id,
      kind,
      createdAt,
      users: users.map(([user, at]) => ({ user, at })),
      hash,
    });
    const decide = (
      versions: VersionSummary[],
      extra: {
        user?: string;
        kind?: WhiteboardVersionKind;
        lastRewrittenAt?: Date;
        hash?: string;
      } = {},
    ) =>
      versionDecision({
        kind: extra.kind ?? "edits",
        user: extra.user ?? "alice",
        now,
        lastRewrittenAt: extra.lastRewrittenAt,
        versions,
        hash: extra.hash,
      });

    it("extends inside the interval", function () {
      const v = version("v", ago(5 * MINUTE), [["alice", ago(5 * MINUTE)]]);
      assert.deepEqual(decide([v]), { action: "extend", version: "v" });
    });

    it("measures the interval from when the user joined, not when the version started", function () {
      // Started 15 minutes ago by Bob; Alice joined 2 minutes ago, after an
      // unchanged board
      const v = version("v", ago(15 * MINUTE), [
        ["bob", ago(15 * MINUTE)],
        ["alice", ago(2 * MINUTE)],
      ]);
      assert.deepEqual(decide([v]), { action: "extend", version: "v" });
      assert.deepEqual(decide([v], { user: "bob" }), { action: "serialize" });
    });

    it("joins a version under a minute old", function () {
      const v = version("v", ago(VERSION_JOIN_MS - 1000), [
        ["bob", ago(VERSION_JOIN_MS - 1000)],
      ]);
      assert.deepEqual(decide([v]), {
        action: "join",
        version: "v",
        listed: false,
      });
      // Someone whose window has run out on it starts it again
      const listed = version("w", ago(30 * 1000), [
        ["bob", ago(30 * 1000)],
        ["alice", ago(VERSION_INTERVAL_MS + 1)],
      ]);
      assert.deepEqual(decide([listed]), {
        action: "join",
        version: "w",
        listed: true,
      });
      // but not one a minute or more old
      const old = version("o", ago(VERSION_JOIN_MS), [
        ["bob", ago(VERSION_JOIN_MS)],
      ]);
      assert.deepEqual(decide([old]), { action: "serialize" });
    });

    it("starts a new one after the interval", function () {
      const v = version("v", ago(VERSION_INTERVAL_MS), [
        ["alice", ago(VERSION_INTERVAL_MS)],
      ]);
      assert.deepEqual(decide([v]), { action: "serialize" });
      assert.deepEqual(decide([v], { hash: "b".repeat(64) }), {
        action: "new",
      });
      assert.deepEqual(decide([]), { action: "serialize" });
      assert.deepEqual(decide([], { hash: "b".repeat(64) }), {
        action: "new",
      });
    });

    it("joins on an equal hash and refreshes the user's time", function () {
      const v = version("v", ago(HOUR), [
        ["bob", ago(HOUR)],
        ["alice", ago(HOUR)],
      ]);
      assert.deepEqual(decide([v], { hash: "a".repeat(64) }), {
        action: "unchanged",
        version: "v",
        listed: true,
      });
      assert.deepEqual(decide([v], { user: "carol", hash: "a".repeat(64) }), {
        action: "unchanged",
        version: "v",
        listed: false,
      });
    });

    it("always writes for reset and restore", function () {
      const v = version("v", ago(MINUTE), [["alice", ago(MINUTE)]]);
      for (const kind of ["reset", "restore"] as const) {
        assert.deepEqual(decide([v], { kind }), { action: "new" });
        assert.deepEqual(decide([v], { kind, hash: "a".repeat(64) }), {
          action: "new",
        });
      }
    });

    it("never extends or joins a reset or restore version, so the first edit after one snapshots", function () {
      const restore = version(
        "r",
        ago(30 * 1000),
        [["alice", ago(30 * 1000)]],
        "restore",
      );
      // The restore finished just after its version was taken
      const lastRewrittenAt = ago(29 * 1000);
      assert.deepEqual(decide([restore], { lastRewrittenAt }), {
        action: "serialize",
      });
      assert.deepEqual(
        decide([restore], { lastRewrittenAt, hash: "a".repeat(64) }),
        { action: "new" },
      );
      // An ordinary version from before the restore doesn't count either
      const before = version("b", ago(45 * 1000), [["alice", ago(45 * 1000)]]);
      assert.deepEqual(decide([before], { lastRewrittenAt }), {
        action: "serialize",
      });
      assert.deepEqual(
        decide([before], { lastRewrittenAt, hash: "a".repeat(64) }),
        { action: "new" },
      );
    });
  });

  describe("versionsToPrune", function () {
    let n = 0;
    const version = (
      createdAt: Date,
      kind: WhiteboardVersionKind = "edits",
      size = 1000,
    ): PrunableVersion => {
      n += 1;
      return { _id: `v${n}`, kind, createdAt, size };
    };
    const prune = (versions: PrunableVersion[], archived = false, at = now) =>
      versionsToPrune(versions, at, { archived });

    it("keeps everything in the first two hours", function () {
      const versions = Array.from({ length: 24 }, (_, i) =>
        version(ago(i * 5 * MINUTE)),
      );
      assert.deepEqual(prune(versions), []);
      assert.deepEqual(prune([]), []);
    });

    it("keeps the first version each hour", function () {
      // 09:00 to 09:50, every ten minutes, all over two hours old
      const hourStart = Date.UTC(2026, 9, 4, 9, 0, 0);
      const versions = Array.from({ length: 6 }, (_, i) =>
        version(new Date(hourStart + i * 10 * MINUTE)),
      );
      const newest = version(ago(MINUTE));
      const dropped = prune([...versions, newest]);
      assert.sameMembers(
        dropped,
        versions.slice(1).map((v) => v._id),
      );
    });

    it("keeps every reset and restore", function () {
      const hourStart = Date.UTC(2026, 9, 4, 8, 0, 0);
      const first = version(new Date(hourStart));
      const reset = version(new Date(hourStart + 10 * MINUTE), "reset");
      const edits = version(new Date(hourStart + 20 * MINUTE));
      const restore = version(new Date(hourStart + 30 * MINUTE), "restore");
      const dropped = prune([first, reset, edits, restore, version(now)]);
      assert.deepEqual(dropped, [edits._id]);
    });

    it("drops past the byte cap", function () {
      const third = MAX_VERSION_BYTES_PER_BOARD / 2 - 1;
      const newest = version(ago(MINUTE), "edits", third);
      const middle = version(ago(2 * MINUTE), "edits", third);
      const oldest = version(ago(3 * MINUTE), "edits", third);
      const older = version(ago(4 * MINUTE), "edits", 10);
      assert.sameMembers(prune([older, oldest, middle, newest]), [
        oldest._id,
        older._id,
      ]);
      // Resets and restores from the last two hours stay over the cap
      const reset = version(ago(5 * MINUTE), "reset", third);
      assert.sameMembers(prune([reset, oldest, middle, newest]), [oldest._id]);
    });

    it("never drops the newest", function () {
      const huge = version(ago(MINUTE), "edits", MAX_VERSION_BYTES_PER_BOARD);
      const big = version(ago(2 * MINUTE), "edits", 10);
      assert.deepEqual(prune([big, huge]), [big._id]);
      const alone = version(
        ago(3 * HOUR),
        "edits",
        MAX_VERSION_BYTES_PER_BOARD,
      );
      assert.deepEqual(prune([alone]), []);
    });

    it("thins an archived hunt to the newest ten plus resets and restores", function () {
      const versions = Array.from({ length: 15 }, (_, i) =>
        version(ago(i * MINUTE)),
      );
      const reset = version(ago(20 * MINUTE), "reset");
      const restore = version(ago(30 * MINUTE), "restore");
      const dropped = prune([...versions, reset, restore], true);
      assert.sameMembers(
        dropped,
        versions.slice(VERSION_KEEP_AFTER_HUNT).map((v) => v._id),
      );
      // Not archived, all of it is recent enough to keep
      assert.deepEqual(prune([...versions, reset, restore]), []);
    });

    it("thins a board idle for two weeks the same way", function () {
      const versions = Array.from({ length: 12 }, (_, i) =>
        version(ago(i * MINUTE)),
      );
      const reset = version(ago(40 * MINUTE), "reset");
      const later = new Date(now.getTime() + VERSION_IDLE_MS);
      const dropped = prune([...versions, reset], false, later);
      assert.sameMembers(
        dropped,
        versions.slice(VERSION_KEEP_AFTER_HUNT).map((v) => v._id),
      );
      // A day short of that, it's thinned by the hour instead
      const sooner = new Date(now.getTime() + VERSION_IDLE_MS - 24 * HOUR);
      assert.lengthOf(
        prune([...versions, reset], false, sooner),
        versions.length - 1,
      );
    });
  });

  describe("planRestore", function () {
    const plan = (
      current: { nodes: WhiteboardNodeType[]; edges?: WhiteboardEdgeType[] },
      target: { nodes: WhiteboardNodeType[]; edges?: WhiteboardEdgeType[] },
    ): RestorePlan => {
      const result = planRestore(
        { nodes: current.nodes, edges: current.edges ?? [] },
        { nodes: target.nodes, edges: target.edges ?? [] },
      );
      assert.isTrue(result.ok);
      if (!result.ok) throw new Error("refused");
      return result.plan;
    };
    const insertedIds = (p: RestorePlan) => p.nodes.insert.map((n) => n._id);

    it("matches cards by puzzle and remaps references", function () {
      const live = [frame("liveFrame", { tag: "round" }), card("new", "p1")];
      const stored = [
        frame("oldFrame", { tag: "round" }),
        card("old", "p1", "oldFrame"),
        node("sticky"),
      ];
      const result = plan(
        { nodes: live },
        { nodes: stored, edges: [edge("line", "sticky", "old")] },
      );
      // Nothing is inserted twice
      assert.deepEqual(insertedIds(result), ["sticky"]);
      const cardChange = result.nodes.change.find((c) => c._id === "new");
      assert.equal(cardChange?.$set.parent, "liveFrame");
      assert.deepEqual(result.edges.insert, [edge("line", "sticky", "new")]);
      assert.deepEqual(result.nodes.remove, []);
    });

    it("matches tag frames and feeder arrows by key", function () {
      const live = [
        frame("f2", { tag: "round", label: "Round" }),
        frame("u2", { frameKind: "ungrouped" }),
        card("a", "p1", "f2"),
        card("b", "p2", "f2"),
      ];
      const liveEdges = [
        edge("e2", "a", "b", { auto: true, feeder: "p1", meta: "p2" }),
      ];
      const stored = [
        frame("f1", {
          tag: "round",
          label: "Round",
          position: { x: 50, y: 0 },
        }),
        frame("u1", { frameKind: "ungrouped" }),
        card("a", "p1", "f1"),
        card("b", "p2", "u1"),
      ];
      const storedEdges = [
        edge("e1", "a", "b", {
          auto: true,
          feeder: "p1",
          meta: "p2",
          hidden: true,
        }),
      ];
      const result = plan(
        { nodes: live, edges: liveEdges },
        { nodes: stored, edges: storedEdges },
      );
      assert.deepEqual(insertedIds(result), []);
      assert.deepEqual(result.edges.insert, []);
      assert.deepEqual(result.nodes.remove, []);
      assert.deepEqual(result.edges.remove, []);
      assert.deepEqual(result.nodes.change.find((c) => c._id === "f2")?.$set, {
        position: { x: 50, y: 0 },
      });
      assert.equal(
        result.nodes.change.find((c) => c._id === "b")?.$set.parent,
        "u2",
      );
      assert.deepEqual(result.edges.change, [
        { _id: "e2", $set: { hidden: true }, $unset: {} },
      ]);
    });

    it("drops dangling parents, edges and orphan points", function () {
      const stored = [
        node("child", { parent: "gone", position: { x: 5, y: 5 } }),
        node("onSticky", { parent: "child" }),
        node("pointA", { type: "point" }),
        node("pointB", { type: "point" }),
        node("loose", { type: "point" }),
      ];
      const result = plan(
        { nodes: [] },
        {
          nodes: stored,
          edges: [
            edge("free", "pointA", "pointB"),
            edge("dangling", "child", "gone"),
          ],
        },
      );
      const inserted = new Map(result.nodes.insert.map((n) => [n._id, n]));
      assert.sameMembers(
        [...inserted.keys()],
        ["child", "onSticky", "pointA", "pointB"],
      );
      // Not in the version, and not a frame, so no parent
      assert.isUndefined(inserted.get("child")?.parent);
      assert.isUndefined(inserted.get("onSticky")?.parent);
      assert.deepEqual(
        result.edges.insert.map((e) => e._id),
        ["free"],
      );
    });

    it("lifts a looping parent to the top level", function () {
      const stored = [
        frame("a", { parent: "b" }),
        frame("b", { parent: "a" }),
        node("inside", { parent: "b" }),
      ];
      const result = plan({ nodes: [] }, { nodes: stored });
      const inserted = new Map(result.nodes.insert.map((n) => [n._id, n]));
      assert.isUndefined(inserted.get("a")?.parent);
      assert.equal(inserted.get("b")?.parent, "a");
      assert.equal(inserted.get("inside")?.parent, "b");
      // Parents first
      assert.deepEqual(insertedIds(result), ["a", "b", "inside"]);
    });

    it("keeps cards for puzzles added since", function () {
      const live = [
        frame("round", { tag: "t", position: { x: 100, y: 200 } }),
        card("added", "p9", "round"),
        node("added-sticky"),
      ];
      const result = plan({ nodes: live }, { nodes: [] });
      assert.sameMembers(result.nodes.remove, ["round", "added-sticky"]);
      assert.deepEqual(result.nodes.change, [
        {
          _id: "added",
          $set: { position: { x: 100, y: 200 } },
          $unset: { parent: "", manual: "" },
        },
      ]);
      assert.sameMembers(result.detach, ["round", "added-sticky"]);
    });

    it("leaves unchanged documents alone", function () {
      const live = [
        node("same", { updatedAt: new Date(5), text: "hi" }),
        node("hidden", { hidden: true }),
        card("c", "p1"),
      ];
      const stored = [
        node("same", { text: "hi" }),
        node("hidden"),
        card("c", "p1"),
      ];
      const result = plan({ nodes: live }, { nodes: stored });
      assert.deepEqual(result.nodes.change, [
        { _id: "hidden", $set: {}, $unset: { hidden: "" } },
      ]);
      assert.deepEqual(result.nodes.insert, []);
      assert.deepEqual(result.nodes.remove, []);
      assert.deepEqual(result.reattach, [{ node: "hidden", from: ["hidden"] }]);
      assert.deepEqual(result.detach, []);
    });

    it("puts back the version's locks, or keeps the board's with keepLocks", function () {
      const live = [
        node("lockedNow", { locked: true, lockedBy: "u1" }),
        node("unlockedNow", { position: { x: 5, y: 0 } }),
      ];
      const stored = [
        node("lockedNow", { position: { x: 9, y: 0 } }),
        node("unlockedNow", { locked: true, lockedBy: "u2" }),
        node("back", { locked: true, lockedBy: "u2" }),
      ];

      const asStored = plan({ nodes: live }, { nodes: stored });
      assert.sameDeepMembers(asStored.nodes.change, [
        {
          _id: "lockedNow",
          $set: { position: { x: 9, y: 0 } },
          $unset: { locked: "", lockedBy: "" },
        },
        {
          _id: "unlockedNow",
          $set: { position: { x: 0, y: 0 }, locked: true, lockedBy: "u2" },
          $unset: {},
        },
      ]);
      assert.isTrue(asStored.nodes.insert[0]?.locked);

      const result = planRestore(
        { nodes: live, edges: [] },
        { nodes: stored, edges: [] },
        { keepLocks: true },
      );
      if (!result.ok) throw new Error("refused");
      assert.sameDeepMembers(result.plan.nodes.change, [
        { _id: "lockedNow", $set: { position: { x: 9, y: 0 } }, $unset: {} },
        {
          _id: "unlockedNow",
          $set: { position: { x: 0, y: 0 } },
          $unset: {},
        },
      ]);
      assert.deepEqual(insertedIds(result.plan), ["back"]);
      assert.notProperty(result.plan.nodes.insert[0], "locked");
      assert.notProperty(result.plan.nodes.insert[0], "lockedBy");
    });

    it("refuses past the node cap", function () {
      const stored = Array.from({ length: MAX_NODES_PER_BOARD }, (_, i) =>
        node(`s${i}`),
      );
      assert.deepEqual(
        planRestore(
          { nodes: [card("kept", "p1")], edges: [] },
          { nodes: stored, edges: [] },
        ),
        { ok: false, reason: "tooBig" },
      );
      assert.isTrue(
        planRestore({ nodes: [], edges: [] }, { nodes: stored, edges: [] }).ok,
      );
    });
  });

  describe("pickToRestore", function () {
    it("is nothing for no selection and several things", function () {
      assert.isUndefined(pickToRestore([]));
      assert.isUndefined(pickToRestore([node("a"), node("b")]));
      assert.isUndefined(
        pickToRestore([
          node("ink1", { type: "ink", stroke: "s" }),
          node("ink2", { type: "ink", stroke: "t" }),
        ]),
      );
      assert.isUndefined(
        pickToRestore([
          node("ink1", { type: "ink", stroke: "s" }),
          node("sticky"),
        ]),
      );
    });

    it("takes one node, saying whether it's a frame", function () {
      assert.deepEqual(pickToRestore([node("a")]), {
        ids: ["a"],
        frame: false,
      });
      assert.deepEqual(pickToRestore([frame("f")]), {
        ids: ["f"],
        frame: true,
      });
    });

    it("takes every segment of one ink stroke as one pick", function () {
      assert.deepEqual(
        pickToRestore([
          node("ink1", { type: "ink", stroke: "s" }),
          node("ink2", { type: "ink", stroke: "s" }),
        ]),
        { ids: ["ink1", "ink2"], frame: false },
      );
    });
  });

  describe("restoreItemSet", function () {
    it("brings a frame's contents, a stroke's other segments, their lines and the lines' free ends", function () {
      const target = {
        nodes: [
          frame("round"),
          frame("inner", { parent: "round" }),
          node("deep", { parent: "inner" }),
          node("ink1", { type: "ink", stroke: "s" }),
          node("ink2", { type: "ink", stroke: "s" }),
          node("ink3", { type: "ink", stroke: "t" }),
          node("loose", { type: "point" }),
          node("elsewhere"),
        ],
        edges: [
          edge("toLoose", "deep", "loose"),
          edge("unrelated", "elsewhere", "ink3"),
        ],
      };
      const items = restoreItemSet(target, ["round", "ink1"]);
      assert.sameMembers(
        [...(items?.nodes ?? [])],
        ["round", "inner", "deep", "ink1", "ink2", "loose"],
      );
      assert.sameMembers([...(items?.edges ?? [])], ["toLoose"]);
    });

    it("is empty for no ids and undefined for one the version doesn't have", function () {
      const target = { nodes: [node("a")], edges: [] };
      assert.deepEqual(restoreItemSet(target, []), {
        nodes: new Set(),
        edges: new Set(),
      });
      assert.isUndefined(restoreItemSet(target, ["a", "missing"]));
    });
  });

  describe("planItemRestore", function () {
    const planItems = (
      current: { nodes: WhiteboardNodeType[]; edges?: WhiteboardEdgeType[] },
      target: { nodes: WhiteboardNodeType[]; edges?: WhiteboardEdgeType[] },
      ids: string[],
    ) => {
      const full = {
        current: { nodes: current.nodes, edges: current.edges ?? [] },
        target: { nodes: target.nodes, edges: target.edges ?? [] },
      };
      const items = restoreItemSet(full.target, ids);
      if (!items) throw new Error("not in the version");
      return planItemRestore(full.current, full.target, items);
    };

    it("inserts what's gone, updates matches and never removes", function () {
      const result = planItems(
        {
          nodes: [
            frame("liveFrame", { tag: "round" }),
            card("newCard", "p1", "liveFrame"),
            node("added", { parent: "liveFrame" }),
          ],
        },
        {
          nodes: [
            frame("oldFrame", { tag: "round", position: { x: 50, y: 0 } }),
            card("oldCard", "p1"),
            node("gone", { parent: "oldFrame" }),
          ],
        },
        ["oldFrame", "oldCard"],
      );
      assert.isTrue(result.ok);
      if (!result.ok) return;
      assert.deepEqual(
        result.plan.nodes.insert.map((n) => n._id),
        ["gone"],
      );
      assert.equal(result.plan.nodes.insert[0]?.parent, "liveFrame");
      assert.sameMembers(
        result.plan.nodes.change.map((c) => c._id),
        ["liveFrame", "newCard"],
      );
      assert.deepEqual(result.plan.nodes.remove, []);
      assert.deepEqual(result.plan.edges.remove, []);
      assert.deepEqual(result.puzzles, ["p1"]);
    });

    it("lifts a node whose frame is gone to where it was on the board", function () {
      const result = planItems(
        { nodes: [] },
        {
          nodes: [
            frame("round", { position: { x: 100, y: 200 } }),
            node("note", { parent: "round", position: { x: 10, y: 20 } }),
          ],
        },
        ["note"],
      );
      assert.isTrue(result.ok);
      if (!result.ok) return;
      assert.deepEqual(result.plan.nodes.insert, [
        node("note", { parent: undefined, position: { x: 110, y: 220 } }),
      ]);
    });

    it("drops a line whose other end isn't on the board, with its free end", function () {
      const result = planItems(
        { nodes: [node("kept")] },
        {
          nodes: [
            node("kept"),
            node("note"),
            node("gone"),
            node("end", { type: "point" }),
          ],
          edges: [edge("toGone", "note", "gone"), edge("toEnd", "note", "end")],
        },
        ["note"],
      );
      assert.isTrue(result.ok);
      if (!result.ok) return;
      assert.sameMembers(
        result.plan.nodes.insert.map((n) => n._id),
        ["note", "end"],
      );
      assert.deepEqual(
        result.plan.edges.insert.map((e) => e._id),
        ["toEnd"],
      );
    });

    it("refuses past the node cap", function () {
      const live = Array.from({ length: MAX_NODES_PER_BOARD }, (_, i) =>
        node(`s${i}`),
      );
      assert.deepEqual(
        planItems({ nodes: live }, { nodes: [node("new")] }, ["new"]),
        { ok: false, reason: "tooBig" },
      );
    });
  });

  describe("versionDifferences", function () {
    it("marks what's missing, moved, restyled or reframed, matching by identity", function () {
      const live = {
        nodes: [
          frame("liveFrame", { tag: "round" }),
          card("newCard", "p1", "liveFrame"),
          node("same"),
          node("moved", { position: { x: 5, y: 0 } }),
          node("recoloured", { color: "blue" }),
          node("reframed"),
        ],
        edges: [edge("line", "same", "moved", { dashed: true })],
      };
      const version = {
        nodes: [
          frame("oldFrame", { tag: "round" }),
          card("oldCard", "p1", "oldFrame"),
          node("same"),
          node("moved"),
          node("recoloured", { color: "pink" }),
          node("reframed", { parent: "oldFrame" }),
          node("missing"),
        ],
        edges: [
          edge("line", "same", "moved"),
          edge("sameLine", "same", "moved"),
        ],
      };
      assert.sameMembers(
        [...versionDifferences(live, version)],
        ["moved", "recoloured", "reframed", "missing", "line", "sameLine"],
      );
    });

    it("marks a node whose only difference is its lock", function () {
      const live = {
        nodes: [node("a", { locked: true, lockedBy: "u1" }), node("b")],
        edges: [],
      };
      const version = { nodes: [node("a"), node("b")], edges: [] };
      assert.sameMembers([...versionDifferences(live, version)], ["a"]);
    });

    it("marks a node locked by someone else in the version", function () {
      const live = {
        nodes: [
          node("a", { locked: true, lockedBy: "u1" }),
          node("b", { locked: true, lockedBy: "u1" }),
        ],
        edges: [],
      };
      const version = {
        nodes: [
          node("a", { locked: true, lockedBy: "u2" }),
          node("b", { locked: true, lockedBy: "u1" }),
        ],
        edges: [],
      };
      assert.sameMembers([...versionDifferences(live, version)], ["a"]);
      assert.equal(versionDifferences(live, version, { locks: false }).size, 0);
    });

    it("leaves a lock difference unmarked without locks", function () {
      const live = {
        nodes: [
          node("a", { locked: true, lockedBy: "u1" }),
          node("b", { locked: true, lockedBy: "u1" }),
        ],
        edges: [],
      };
      const version = {
        nodes: [node("a"), node("b", { position: { x: 5, y: 0 } })],
        edges: [],
      };
      assert.sameMembers(
        [...versionDifferences(live, version, { locks: false })],
        ["b"],
      );
    });

    it("finds nothing when the board hasn't changed", function () {
      const board = {
        nodes: [node("a"), node("b")],
        edges: [edge("l", "a", "b")],
      };
      assert.equal(versionDifferences(board, board).size, 0);
    });
  });
});
