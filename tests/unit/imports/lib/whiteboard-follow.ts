import { assert } from "chai";
import type { FollowPresence } from "../../../../imports/lib/whiteboard/follow";
import {
  FOLLOW_IDLE_MS,
  followersOf,
  followIdleAt,
  followLocalMove,
  followPresence,
  resumeFollowing,
  startFollowing,
  viewAtCentre,
  viewportFor,
} from "../../../../imports/lib/whiteboard/follow";
import { MAX_COORDINATE } from "../../../../imports/lib/whiteboard/limits";
import { MAX_ZOOM, MIN_ZOOM } from "../../../../imports/lib/whiteboard/links";

describe("following someone on the whiteboard", function () {
  const start = 1_000_000;
  const ada = (fields: Partial<FollowPresence> = {}): FollowPresence => ({
    _id: "tab-a",
    user: "ada",
    cursor: null,
    view: null,
    ...fields,
  });
  const bob: FollowPresence = {
    _id: "tab-b",
    user: "bob",
    cursor: { x: 1, y: 1 },
    view: { x: 9, y: 9, zoom: 1 },
  };

  it("moves to their view at once, and again only when it changes", function () {
    const view = { x: 100, y: 200, zoom: 0.5 };
    const started = startFollowing("ada", [ada({ view }), bob], start);
    assert.deepEqual(started.apply, view);
    assert.isUndefined(started.stopped);

    const same = followPresence(
      started.state!,
      [ada({ view }), bob],
      start + 1,
    );
    assert.isUndefined(same.apply);
    assert.exists(same.state);

    const moved = { x: 150, y: 200, zoom: 0.5 };
    const next = followPresence(
      same.state,
      [ada({ view: moved }), bob],
      start + 2,
    );
    assert.deepEqual(next.apply, moved);
    assert.deepEqual(next.state?.applied, moved);
  });

  it("waits for a view from someone who hasn't sent one", function () {
    const started = startFollowing(
      "ada",
      [ada({ cursor: { x: 1, y: 2 } })],
      start,
    );
    assert.exists(started.state);
    assert.isUndefined(started.apply);
    const later = followPresence(
      started.state,
      [ada({ view: { x: 3, y: 4, zoom: 1 } })],
      start + 10,
    );
    assert.deepEqual(later.apply, { x: 3, y: 4, zoom: 1 });
  });

  it("follows the first of their tabs that has a view", function () {
    const result = startFollowing(
      "ada",
      [
        ada({ _id: "tab-c", view: { x: 3, y: 3, zoom: 1 } }),
        ada({ _id: "tab-a" }),
        ada({ _id: "tab-b", view: { x: 2, y: 2, zoom: 1 } }),
      ],
      start,
    );
    assert.deepEqual(result.apply, { x: 2, y: 2, zoom: 1 });
  });

  it("stops when the viewer moves the board", function () {
    assert.deepEqual(followLocalMove(), { state: undefined, stopped: "moved" });
  });

  it("stops when they leave the board", function () {
    const started = startFollowing("ada", [ada(), bob], start);
    assert.deepEqual(followPresence(started.state!, [bob], start + 1), {
      state: undefined,
      stopped: "left",
    });
    // and can't start without them
    assert.deepEqual(startFollowing("ada", [bob], start), {
      state: undefined,
      stopped: "left",
    });
  });

  it("stops when they haven't moved for a minute, and not before", function () {
    const view = { x: 0, y: 0, zoom: 1 };
    const started = startFollowing("ada", [ada({ view })], start);
    assert.equal(followIdleAt(started.state!), start + FOLLOW_IDLE_MS);

    const nearly = followPresence(
      started.state!,
      [ada({ view })],
      start + FOLLOW_IDLE_MS - 1,
    );
    assert.exists(nearly.state);
    assert.deepEqual(
      followPresence(nearly.state, [ada({ view })], start + FOLLOW_IDLE_MS),
      { state: undefined, stopped: "idle" },
    );

    // Moving their pointer counts as moving
    const pointed = followPresence(
      nearly.state,
      [ada({ view, cursor: { x: 5, y: 5 } })],
      start + FOLLOW_IDLE_MS - 1,
    );
    assert.equal(pointed.state?.activeAt, start + FOLLOW_IDLE_MS - 1);
    assert.exists(
      followPresence(
        pointed.state!,
        [ada({ view, cursor: { x: 5, y: 5 } })],
        start + FOLLOW_IDLE_MS + 10,
      ).state,
    );
  });

  it("puts their view back after a pause, even if it hasn't changed", function () {
    const view = { x: 7, y: 8, zoom: 1.25 };
    const started = startFollowing("ada", [ada({ view })], start);
    const resumed = resumeFollowing(started.state!);
    assert.deepEqual(
      followPresence(resumed, [ada({ view })], start + 1).apply,
      view,
    );
  });

  it("lists who follows someone, once each and never themselves", function () {
    assert.deepEqual(
      followersOf("ada", [
        { user: "bob", followedUser: "ada" },
        { user: "bob", followedUser: "ada" },
        { user: "cat", followedUser: "bob" },
        { user: "ada", followedUser: "ada" },
        { user: "dan", followedUser: null },
        { user: "eve" },
      ]),
      ["bob"],
    );
    assert.deepEqual(followersOf("ada", []), []);
  });

  it("works out the view at the centre of the canvas, and back", function () {
    const view = viewAtCentre({ x: 100, y: -50, zoom: 0.5 }, 800, 600);
    assert.deepEqual(view, { x: 600, y: 700, zoom: 0.5 });
    assert.deepEqual(viewportFor(view, 800, 600), {
      x: 100,
      y: -50,
      zoom: 0.5,
    });
    // A different canvas puts the same point at its own centre
    assert.deepEqual(viewportFor(view, 400, 400), {
      x: -100,
      y: -150,
      zoom: 0.5,
    });
  });

  it("keeps a view to the board's limits and rounds it", function () {
    assert.deepEqual(viewAtCentre({ x: 0.123, y: 0, zoom: 1 / 3 }, 0, 0), {
      x: -0.4,
      y: 0,
      zoom: 0.3333,
    });
    const far = viewAtCentre({ x: -1e9, y: 1e9, zoom: 5 }, 100, 100);
    assert.deepEqual(far, {
      x: MAX_COORDINATE,
      y: -MAX_COORDINATE,
      zoom: MAX_ZOOM,
    });
    assert.equal(viewAtCentre({ x: 0, y: 0, zoom: 0.01 }, 0, 0).zoom, MIN_ZOOM);
  });
});
