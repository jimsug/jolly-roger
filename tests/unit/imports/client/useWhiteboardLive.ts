import { Random } from "meteor/random";
import { act, cleanup, renderHook } from "@testing-library/react";
import { assert } from "chai";
import sinon from "sinon";
import useWhiteboardLive from "../../../../imports/client/hooks/useWhiteboardLive";
import { EDITING_KEEPALIVE_MS } from "../../../../imports/lib/whiteboard/remoteActivity";
import setWhiteboardLive from "../../../../imports/methods/setWhiteboardLive";

describe("useWhiteboardLive", function () {
  let clock: sinon.SinonFakeTimers;
  let call: sinon.SinonStub;
  let board: string;

  beforeEach(function () {
    clock = sinon.useFakeTimers({
      now: Date.now(),
      toFake: [
        "setTimeout",
        "clearTimeout",
        "setInterval",
        "clearInterval",
        "Date",
      ],
    });
    call = sinon.stub(setWhiteboardLive, "call");
    board = Random.id();
  });

  afterEach(function () {
    cleanup();
    call.restore();
    clock.restore();
  });

  const sent = () =>
    call.getCalls().map((c) => c.args[0] as Record<string, unknown>);

  it("sends a fresh editingAt every few seconds while typing, and none after", function () {
    const note = Random.id();
    const { result } = renderHook(() => useWhiteboardLive(board, true));
    act(() => {
      result.current.setEditing(note);
      clock.tick(1000);
    });
    assert.lengthOf(sent(), 1);
    assert.equal(sent()[0]?.editing, note);
    const started = sent()[0]?.editingAt as Date;
    assert.instanceOf(started, Date);

    // 40 seconds of typing, with nothing else changing
    act(() => {
      clock.tick(40_000);
    });
    const times = sent().map((p) => (p.editingAt as Date).getTime());
    assert.isAtLeast(times.length, 40_000 / EDITING_KEEPALIVE_MS);
    times.slice(1).forEach((time, i) => {
      assert.isAtMost(time - times[i]!, EDITING_KEEPALIVE_MS + 1000);
      assert.isAbove(time, times[i]!);
    });
    assert.isTrue(sent().every((p) => p.editing === note));

    act(() => {
      result.current.setEditing(null);
      clock.tick(1000);
    });
    const stopped = sent().length;
    assert.isNull(sent().at(-1)?.editing);
    assert.isNull(sent().at(-1)?.editingAt);
    act(() => {
      clock.tick(3 * EDITING_KEEPALIVE_MS);
    });
    assert.lengthOf(sent(), stopped);
    // No timer is left running once the edit is over
    assert.equal(clock.countTimers(), 0);
  });

  it("sends nothing on its own while nothing is being typed in", function () {
    renderHook(() => useWhiteboardLive(board, true));
    assert.equal(clock.countTimers(), 0);
    act(() => {
      clock.tick(3 * EDITING_KEEPALIVE_MS);
    });
    assert.lengthOf(sent(), 0);
  });

  it("sends the view at most every 200ms, only when it changes, and none while hidden", function () {
    const { result } = renderHook(() => useWhiteboardLive(board, true));
    const views = () => sent().map((p) => p.view);
    act(() => {
      result.current.setView({ x: 1, y: 1, zoom: 1 });
      clock.tick(250);
    });
    assert.deepEqual(views(), [{ x: 1, y: 1, zoom: 1 }]);

    // A pan sends the view five times a second at most, ending where it
    // stopped, however fast the cursor goes with it
    const changedAt: number[] = [];
    let last = JSON.stringify(views().at(-1));
    call.callsFake((payload: { view: unknown }) => {
      const view = JSON.stringify(payload.view);
      if (view !== last) changedAt.push(Date.now());
      last = view;
    });
    act(() => {
      for (let i = 2; i <= 21; i++) {
        result.current.setView({ x: i, y: 1, zoom: 1 });
        result.current.setCursor({ x: i * 10, y: 0 });
        clock.tick(50);
      }
      clock.tick(500);
    });
    assert.deepEqual(views().at(-1), { x: 21, y: 1, zoom: 1 });
    assert.isAtLeast(changedAt.length, 4);
    changedAt.slice(1).forEach((at, i) => {
      assert.isAtLeast(at - changedAt[i]!, 200);
    });

    // The same view again sends nothing
    const before = sent().length;
    act(() => {
      result.current.setView({ x: 21, y: 1, zoom: 1 });
      clock.tick(1000);
    });
    assert.lengthOf(sent(), before);

    // Hidden, the view and who's followed go as null, and come back after
    const visibility = sinon
      .stub(document, "visibilityState")
      .get(() => "hidden");
    try {
      act(() => {
        result.current.setFollowedUser("someone");
        document.dispatchEvent(new Event("visibilitychange"));
        clock.tick(1000);
      });
      assert.isNull(sent().at(-1)?.view);
      assert.isNull(sent().at(-1)?.followedUser);
      visibility.get(() => "visible");
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
        clock.tick(1000);
      });
      assert.deepEqual(sent().at(-1)?.view, { x: 21, y: 1, zoom: 1 });
      assert.equal(sent().at(-1)?.followedUser, "someone");
    } finally {
      visibility.restore();
    }
  });

  it("sends a view that changes just after one went out, during a drag", function () {
    const { result } = renderHook(() => useWhiteboardLive(board, true));
    act(() => {
      // A drag sends every 100ms, faster than the view may go
      result.current.setDrag([{ node: Random.id(), x: 1, y: 1 }]);
      clock.tick(250);
      result.current.setView({ x: 1, y: 0, zoom: 1 });
      clock.tick(0);
    });
    assert.deepEqual(sent().at(-1)?.view, { x: 1, y: 0, zoom: 1 });
    act(() => {
      // The next send is for the cursor, before the view is due again
      result.current.setCursor({ x: 10, y: 10 });
      clock.tick(20);
      result.current.setView({ x: 2, y: 0, zoom: 1 });
      clock.tick(1000);
    });
    assert.deepEqual(sent().at(-1)?.view, { x: 2, y: 0, zoom: 1 });
  });

  it("stops the keep-alive when the canvas goes", function () {
    const { result, unmount } = renderHook(() =>
      useWhiteboardLive(board, true),
    );
    act(() => {
      result.current.setEditing(Random.id());
    });
    unmount();
    assert.equal(clock.countTimers(), 0);
  });
});
