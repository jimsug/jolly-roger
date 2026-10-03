import { assert } from "chai";
import computePuzzleSolvers, {
  PASSIVE_VIEWER_WINDOW_MS,
} from "../../../../imports/lib/puzzleSolvers";

const now = new Date(Date.UTC(2026, 0, 1, 12, 0));
const ago = (ms: number) => new Date(now.getTime() - ms);
const MINUTE = 60 * 1000;

describe("computePuzzleSolvers", function () {
  it("returns nothing for no presence", function () {
    assert.deepEqual(
      computePuzzleSolvers({
        callers: [],
        subscriptions: [],
        interactions: [],
        now,
      }),
      {},
    );
  });

  it("lists callers once however many tabs they have open", function () {
    const solvers = computePuzzleSolvers({
      callers: [
        { puzzle: "p1", user: "alice" },
        { puzzle: "p1", user: "alice" },
        { puzzle: "p1", user: "bob" },
      ],
      subscriptions: [],
      interactions: [],
      now,
    });
    assert.deepEqual(solvers.p1?.rtcViewers, ["alice", "bob"]);
  });

  it("puts a user on every puzzle they have a visible tab on", function () {
    const solvers = computePuzzleSolvers({
      callers: [],
      subscriptions: [
        { puzzle: "p1", user: "alice", visible: true, updatedAt: ago(0) },
        { puzzle: "p2", user: "alice", visible: true, updatedAt: ago(MINUTE) },
        { puzzle: "p3", user: "alice", visible: false, updatedAt: ago(0) },
      ],
      interactions: [],
      now,
    });
    assert.deepEqual(solvers.p1?.activeViewers, ["alice"]);
    assert.deepEqual(solvers.p2?.activeViewers, ["alice"]);
    assert.notProperty(
      solvers,
      "p3",
      "A hidden tab doesn't count while a visible one exists",
    );
  });

  it("falls back to the most recent interaction, then the most recent hidden tab", function () {
    const solvers = computePuzzleSolvers({
      callers: [],
      subscriptions: [
        { puzzle: "p1", user: "alice", visible: false, updatedAt: ago(MINUTE) },
      ],
      interactions: [
        { puzzle: "p2", user: "alice", updatedAt: ago(3 * MINUTE) },
        { puzzle: "p3", user: "alice", updatedAt: ago(4 * MINUTE) },
      ],
      now,
    });
    assert.notProperty(solvers, "p1");
    assert.deepEqual(solvers.p2?.passiveViewers, ["alice"]);
    assert.notProperty(solvers, "p3");

    const noInteractions = computePuzzleSolvers({
      callers: [],
      subscriptions: [
        { puzzle: "p1", user: "alice", visible: false, updatedAt: ago(MINUTE) },
        {
          puzzle: "p4",
          user: "alice",
          visible: false,
          updatedAt: ago(2 * MINUTE),
        },
      ],
      interactions: [],
      now,
    });
    assert.deepEqual(noInteractions.p1?.passiveViewers, ["alice"]);
    assert.notProperty(noInteractions, "p4");
  });

  it("forgets presence older than the passive window", function () {
    const solvers = computePuzzleSolvers({
      callers: [],
      subscriptions: [
        {
          puzzle: "p1",
          user: "alice",
          visible: false,
          updatedAt: ago(PASSIVE_VIEWER_WINDOW_MS),
        },
      ],
      interactions: [
        { puzzle: "p2", user: "bob", updatedAt: ago(PASSIVE_VIEWER_WINDOW_MS) },
        {
          puzzle: "p3",
          user: "carol",
          updatedAt: ago(PASSIVE_VIEWER_WINDOW_MS - 1),
        },
      ],
      now,
    });
    assert.deepEqual(solvers, {
      p3: { rtcViewers: [], activeViewers: [], passiveViewers: ["carol"] },
    });
  });

  it("keeps the previous objects for puzzles whose solvers didn't change", function () {
    const input = {
      callers: [{ puzzle: "p1", user: "alice" }],
      subscriptions: [
        { puzzle: "p2", user: "bob", visible: true, updatedAt: ago(0) },
      ],
      interactions: [{ puzzle: "p3", user: "carol", updatedAt: ago(MINUTE) }],
      now,
    };
    const first = computePuzzleSolvers(input);
    assert.strictEqual(
      computePuzzleSolvers({ ...input, previous: first }),
      first,
      "Nothing changed, so the previous result comes back as is",
    );

    const changed = computePuzzleSolvers({
      ...input,
      callers: [...input.callers, { puzzle: "p2", user: "dave" }],
      previous: first,
    });
    assert.notStrictEqual(changed, first);
    assert.strictEqual(changed.p1, first.p1);
    assert.strictEqual(changed.p3, first.p3);
    assert.notStrictEqual(changed.p2, first.p2);
    assert.deepEqual(changed.p2?.rtcViewers, ["dave"]);

    const fewer = computePuzzleSolvers({
      ...input,
      interactions: [],
      previous: first,
    });
    assert.notStrictEqual(fewer, first, "A puzzle emptied out");
    assert.notProperty(fewer, "p3");
    assert.strictEqual(fewer.p1, first.p1);
  });

  it("doesn't list callers as viewers of the puzzle they're calling on", function () {
    const solvers = computePuzzleSolvers({
      callers: [{ puzzle: "p1", user: "alice" }],
      subscriptions: [
        { puzzle: "p1", user: "alice", visible: true, updatedAt: ago(0) },
        { puzzle: "p2", user: "alice", visible: true, updatedAt: ago(0) },
      ],
      interactions: [],
      now,
    });
    assert.deepEqual(solvers.p1, {
      rtcViewers: ["alice"],
      activeViewers: [],
      passiveViewers: [],
    });
    assert.deepEqual(solvers.p2?.activeViewers, ["alice"]);
  });
});
