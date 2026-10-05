import { Random } from "meteor/random";
import { act, cleanup, renderHook } from "@testing-library/react";
import { assert } from "chai";
import sinon from "sinon";
import useWhiteboardOthersEditing from "../../../../imports/client/hooks/useWhiteboardOthersEditing";
import WhiteboardPresence from "../../../../imports/client/WhiteboardPresence";
import { REMOTE_EDITING_TIMEOUT_MS } from "../../../../imports/lib/whiteboard/remoteActivity";

// The client's own copy of the collection, written to directly as the
// presence publication would.
const local = (
  WhiteboardPresence as unknown as {
    _collection: {
      insert: (doc: Record<string, unknown>) => string;
      update: (id: string, modifier: Record<string, unknown>) => number;
      remove: (selector: Record<string, unknown>) => number;
    };
  }
)._collection;

describe("useWhiteboardOthersEditing", function () {
  let clock: sinon.SinonFakeTimers;
  let board: string;
  let ada: string;

  beforeEach(function () {
    clock = sinon.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "Date"],
    });
    board = Random.id();
    ada = Random.id();
  });

  afterEach(function () {
    cleanup();
    local.remove({ board });
    clock.restore();
  });

  const typingIn = (note: string) =>
    local.insert({ _id: Random.id(), board, user: ada, editing: note });

  it("names who's typing in what", function () {
    const note = Random.id();
    typingIn(note);
    const { result } = renderHook(() =>
      useWhiteboardOthersEditing(board, true),
    );
    assert.deepEqual(
      [...result.current],
      [[note, { user: ada, name: "Someone" }]],
    );
  });

  it("lets go 30 seconds after their presence last changed, and takes it back when it changes", function () {
    const note = Random.id();
    const doc = typingIn(note);
    const { result } = renderHook(() =>
      useWhiteboardOthersEditing(board, true),
    );
    act(() => {
      clock.tick(20_000);
      local.update(doc, { $set: { cursor: { x: 1, y: 2 } } });
      clock.tick(REMOTE_EDITING_TIMEOUT_MS - 1);
    });
    assert.isTrue(result.current.has(note));
    act(() => {
      clock.tick(1);
    });
    assert.isFalse(result.current.has(note));
    act(() => {
      local.update(doc, { $set: { cursor: { x: 3, y: 4 } } });
    });
    assert.isTrue(result.current.has(note));
  });

  it("clears when they stop typing or leave", function () {
    const note = Random.id();
    const doc = typingIn(note);
    const { result } = renderHook(() =>
      useWhiteboardOthersEditing(board, true),
    );
    act(() => {
      local.update(doc, { $set: { editing: null } });
    });
    assert.equal(result.current.size, 0);
    act(() => {
      local.update(doc, { $set: { editing: note } });
    });
    assert.isTrue(result.current.has(note));
    act(() => {
      local.remove({ _id: doc });
    });
    assert.equal(result.current.size, 0);
  });

  it("doesn't re-render for a cursor moving when nobody is typing", function () {
    const doc = local.insert({ _id: Random.id(), board, user: ada });
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useWhiteboardOthersEditing(board, true);
    });
    const before = renders;
    act(() => {
      local.update(doc, { $set: { cursor: { x: 1, y: 2 } } });
    });
    assert.equal(renders, before);
  });

  it("shows nobody while turned off", function () {
    const note = Random.id();
    typingIn(note);
    const { result, rerender } = renderHook(
      ({ enabled }) => useWhiteboardOthersEditing(board, enabled),
      { initialProps: { enabled: true } },
    );
    assert.isTrue(result.current.has(note));
    rerender({ enabled: false });
    assert.equal(result.current.size, 0);
    rerender({ enabled: true });
    assert.isTrue(result.current.has(note));
  });
});
