import { assert } from "chai";
import { PASSIVE_VIEWER_WINDOW_MS } from "../../../../imports/lib/presenceStatus";
import computePuzzleViewers, {
  puzzleViewerInputs,
  puzzleViewerPeople,
} from "../../../../imports/lib/puzzleViewers";

const now = new Date(Date.UTC(2026, 0, 1, 12, 0));
const ago = (ms: number) => new Date(now.getTime() - ms);
const MINUTE = 60 * 1000;

describe("computePuzzleViewers", function () {
  it("returns nothing for no presence", function () {
    assert.deepEqual(
      computePuzzleViewers({
        callers: [],
        subscriptions: [],
        interactions: [],
        now,
      }),
      {},
    );
  });

  it("lists callers once however many tabs they have open", function () {
    const viewers = computePuzzleViewers({
      callers: [
        { puzzle: "p1", user: "alice" },
        { puzzle: "p1", user: "alice" },
        { puzzle: "p1", user: "bob" },
      ],
      subscriptions: [],
      interactions: [],
      now,
    });
    assert.deepEqual(viewers.p1?.rtcViewers, ["alice", "bob"]);
  });

  it("puts a user on every puzzle they have a visible tab on", function () {
    const viewers = computePuzzleViewers({
      callers: [],
      subscriptions: [
        { puzzle: "p1", user: "alice", visible: true, updatedAt: ago(0) },
        { puzzle: "p2", user: "alice", visible: true, updatedAt: ago(MINUTE) },
        { puzzle: "p3", user: "alice", visible: false, updatedAt: ago(0) },
      ],
      interactions: [],
      now,
    });
    assert.deepEqual(viewers.p1?.activeViewers, ["alice"]);
    assert.deepEqual(viewers.p2?.activeViewers, ["alice"]);
    assert.notProperty(
      viewers,
      "p3",
      "A hidden tab doesn't count while a visible one exists",
    );
  });

  it("falls back to the most recent interaction, then the most recent hidden tab", function () {
    const viewers = computePuzzleViewers({
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
    assert.notProperty(viewers, "p1");
    assert.deepEqual(viewers.p2?.passiveViewers, ["alice"]);
    assert.notProperty(viewers, "p3");

    const noInteractions = computePuzzleViewers({
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
    const viewers = computePuzzleViewers({
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
    assert.deepEqual(viewers, {
      p3: { rtcViewers: [], activeViewers: [], passiveViewers: ["carol"] },
    });
  });

  it("keeps the previous objects for puzzles whose viewers didn't change", function () {
    const input = {
      callers: [{ puzzle: "p1", user: "alice" }],
      subscriptions: [
        { puzzle: "p2", user: "bob", visible: true, updatedAt: ago(0) },
      ],
      interactions: [{ puzzle: "p3", user: "carol", updatedAt: ago(MINUTE) }],
      now,
    };
    const first = computePuzzleViewers(input);
    assert.strictEqual(
      computePuzzleViewers({ ...input, previous: first }),
      first,
      "Nothing changed, so the previous result comes back as is",
    );

    const changed = computePuzzleViewers({
      ...input,
      callers: [...input.callers, { puzzle: "p2", user: "dave" }],
      previous: first,
    });
    assert.notStrictEqual(changed, first);
    assert.strictEqual(changed.p1, first.p1);
    assert.strictEqual(changed.p3, first.p3);
    assert.notStrictEqual(changed.p2, first.p2);
    assert.deepEqual(changed.p2?.rtcViewers, ["dave"]);

    const fewer = computePuzzleViewers({
      ...input,
      interactions: [],
      previous: first,
    });
    assert.notStrictEqual(fewer, first, "A puzzle emptied out");
    assert.notProperty(fewer, "p3");
    assert.strictEqual(fewer.p1, first.p1);
  });

  it("copes with puzzle ids that are Object.prototype's property names", function () {
    // Topic names are whatever a subscriber sends, "puzzle:__proto__" included
    const input = {
      callers: [{ puzzle: "constructor", user: "bob" }],
      subscriptions: [
        {
          puzzle: "__proto__",
          user: "mallory",
          visible: true,
          updatedAt: ago(0),
        },
        { puzzle: "toString", user: "dave", visible: false, updatedAt: ago(0) },
        { puzzle: "p1", user: "alice", visible: true, updatedAt: ago(0) },
      ],
      interactions: [
        { puzzle: "hasOwnProperty", user: "carol", updatedAt: ago(0) },
      ],
      now,
    };
    const viewers = computePuzzleViewers(input);
    const own = (puzzle: string) =>
      Object.hasOwn(viewers, puzzle) ? viewers[puzzle] : undefined;
    assert.deepEqual(own("p1")?.activeViewers, ["alice"]);
    assert.deepEqual(own("__proto__")?.activeViewers, ["mallory"]);
    assert.deepEqual(own("constructor")?.rtcViewers, ["bob"]);
    assert.deepEqual(own("toString")?.passiveViewers, ["dave"]);
    assert.deepEqual(own("hasOwnProperty")?.passiveViewers, ["carol"]);
    assert.notProperty(Object.prototype, "activeViewers");

    // And again with the previous result, as the puzzle list does, or with
    // one that has none of these puzzles
    assert.strictEqual(
      computePuzzleViewers({ ...input, previous: viewers }),
      viewers,
    );
    assert.deepEqual(computePuzzleViewers({ ...input, previous: {} }), viewers);
  });

  it("doesn't list callers as viewers of the puzzle they're calling on", function () {
    const viewers = computePuzzleViewers({
      callers: [{ puzzle: "p1", user: "alice" }],
      subscriptions: [
        { puzzle: "p1", user: "alice", visible: true, updatedAt: ago(0) },
        { puzzle: "p2", user: "alice", visible: true, updatedAt: ago(0) },
      ],
      interactions: [],
      now,
    });
    assert.deepEqual(viewers.p1, {
      rtcViewers: ["alice"],
      activeViewers: [],
      passiveViewers: [],
    });
    assert.deepEqual(viewers.p2?.activeViewers, ["alice"]);
  });
});

// The puzzle list's rows and the whiteboard's cards both take the hunt's
// presence rows through puzzleViewerInputs, computePuzzleViewers and
// puzzleViewerPeople, so for one set of rows a card shows its row's people.
describe("the people on a puzzle's card and list row", function () {
  const names: Record<string, string> = {
    alice: "Alice",
    bob: "Bob",
    carol: "Carol",
    dave: "Dave",
    erin: "Erin",
  };
  const userOf = (id: string) =>
    Object.hasOwn(names, id) ? { displayName: names[id] } : { displayName: "" };

  const rows = {
    peers: [{ call: "p1", createdBy: "dave" }],
    subscribers: [
      // Alice has the puzzle open
      { name: "puzzle:p1", user: "alice", visible: true, updatedAt: ago(0) },
      // Bob's only trace is a tab hidden ten minutes ago
      {
        name: "puzzle:p1",
        user: "bob",
        visible: false,
        updatedAt: ago(10 * MINUTE),
      },
      // Carol hid her tab a couple of minutes ago
      {
        name: "puzzle:p1",
        user: "carol",
        visible: false,
        updatedAt: ago(2 * MINUTE),
      },
      // Dave is on the call and has the puzzle open too
      { name: "puzzle:p1", user: "dave", visible: true, updatedAt: ago(0) },
      // Erin has p2 hidden, but last did something on p1
      {
        name: "puzzle:p2",
        user: "erin",
        visible: false,
        updatedAt: ago(3 * MINUTE),
      },
      // Frank has no display name
      { name: "puzzle:p1", user: "frank", visible: true, updatedAt: ago(0) },
      // Not a puzzle
      { name: "hunt:h1", user: "alice", visible: true, updatedAt: ago(0) },
    ],
    statuses: [
      { puzzle: "p1", user: "erin", updatedAt: ago(MINUTE) },
      { user: "alice", updatedAt: ago(0) },
    ],
  };

  const shown = (puzzle: string, rtcDisabled: boolean) => {
    const byPuzzle = computePuzzleViewers({
      ...puzzleViewerInputs({ ...rows, rtcDisabled }),
      now,
    });
    const { callers, viewers } = puzzleViewerPeople(byPuzzle[puzzle], userOf);
    return {
      callers: callers.map((p) => p._id),
      viewers: viewers.map((p) => [p._id, p.isPassive]),
    };
  };

  it("shows callers, then open tabs, then faded recent ones", function () {
    assert.deepEqual(shown("p1", false), {
      callers: ["dave"],
      viewers: [
        ["alice", false],
        ["carol", true],
        ["erin", true],
      ],
    });
    assert.deepEqual(shown("p2", false), { callers: [], viewers: [] });
  });

  it("shows callers as viewers while calls are off", function () {
    assert.deepEqual(shown("p1", true), {
      callers: [],
      viewers: [
        ["alice", false],
        ["dave", false],
        ["carol", true],
        ["erin", true],
      ],
    });
  });

  it("shows nobody for a puzzle nobody is on", function () {
    assert.deepEqual(puzzleViewerPeople(undefined, userOf), {
      callers: [],
      viewers: [],
    });
  });
});
