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
