import { assert } from "chai";
import {
  LIVE_DRAG_TIMEOUT_MS,
  liveDrags,
  seeDrags,
} from "../../../../imports/lib/whiteboard/liveDrags";

describe("live drags", function () {
  const start = 1_000_000;

  it("counts a drag from when it was last seen to move", function () {
    let seen = seeDrags(
      new Map(),
      [{ node: "a", x: 1, y: 2, parent: null }],
      start,
    );
    assert.deepEqual(liveDrags(seen, start), {
      live: new Map([["a", { x: 1, y: 2, parent: undefined }]]),
      staleAt: start + LIVE_DRAG_TIMEOUT_MS,
    });

    // Seen again unmoved, it keeps its time and goes stale on schedule
    seen = seeDrags(seen, [{ node: "a", x: 1, y: 2 }], start + 1500);
    assert.equal(
      liveDrags(seen, start + 1500).staleAt,
      start + LIVE_DRAG_TIMEOUT_MS,
    );
    assert.equal(liveDrags(seen, start + LIVE_DRAG_TIMEOUT_MS).live.size, 0);

    // A move, or a change of frame, starts it over
    for (const drag of [
      { node: "a", x: 1, y: 3 },
      { node: "a", x: 1, y: 2, parent: "frame" },
    ]) {
      const moved = seeDrags(seen, [drag], start + 1500);
      assert.equal(
        liveDrags(moved, start + LIVE_DRAG_TIMEOUT_MS).live.size,
        1,
        JSON.stringify(drag),
      );
    }
  });

  it("forgets drags that have ended", function () {
    const seen = seeDrags(
      new Map(),
      [
        { node: "a", x: 1, y: 2 },
        { node: "b", x: 3, y: 4 },
      ],
      start,
    );
    const after = seeDrags(seen, [{ node: "b", x: 3, y: 4 }], start + 10);
    assert.deepEqual([...after.keys()], ["b"]);
    assert.deepEqual(liveDrags(new Map(), start), {
      live: new Map(),
      staleAt: undefined,
    });
  });

  it("goes stale by the earliest of several", function () {
    let seen = seeDrags(new Map(), [{ node: "a", x: 0, y: 0 }], start);
    seen = seeDrags(
      seen,
      [
        { node: "a", x: 0, y: 0 },
        { node: "b", x: 0, y: 0 },
      ],
      start + 500,
    );
    assert.equal(
      liveDrags(seen, start + 600).staleAt,
      start + LIVE_DRAG_TIMEOUT_MS,
    );
    const later = liveDrags(seen, start + LIVE_DRAG_TIMEOUT_MS + 100);
    assert.deepEqual([...later.live.keys()], ["b"]);
    assert.equal(later.staleAt, start + 500 + LIVE_DRAG_TIMEOUT_MS);
  });
});
