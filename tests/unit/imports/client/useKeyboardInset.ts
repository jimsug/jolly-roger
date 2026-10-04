import { act, cleanup, renderHook } from "@testing-library/react";
import { assert } from "chai";
import useKeyboardInset from "../../../../imports/client/hooks/useKeyboardInset";

// Stands in for window.visualViewport, whose size the test sets.
class FakeViewport extends EventTarget {
  height = 800;

  offsetTop = 0;
}

describe("useKeyboardInset", function () {
  let viewport: FakeViewport;
  const realViewport = Object.getOwnPropertyDescriptor(
    window,
    "visualViewport",
  );
  const realInnerHeight = Object.getOwnPropertyDescriptor(
    window,
    "innerHeight",
  );

  beforeEach(function () {
    viewport = new FakeViewport();
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: viewport,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 800,
    });
  });

  afterEach(function () {
    cleanup();
    if (realViewport) {
      Object.defineProperty(window, "visualViewport", realViewport);
    } else {
      delete (window as { visualViewport?: unknown }).visualViewport;
    }
    if (realInnerHeight) {
      Object.defineProperty(window, "innerHeight", realInnerHeight);
    } else {
      delete (window as { innerHeight?: unknown }).innerHeight;
    }
  });

  it("follows a fake visualViewport", function () {
    const { result } = renderHook(() => useKeyboardInset());
    assert.deepEqual(result.current, { inset: 0, height: 800 });

    // The keyboard opens over the bottom 300px
    act(() => {
      viewport.height = 500;
      viewport.dispatchEvent(new Event("resize"));
    });
    assert.deepEqual(result.current, { inset: 300, height: 500 });

    // and the page scrolls up inside what's left showing
    act(() => {
      viewport.offsetTop = 100;
      viewport.dispatchEvent(new Event("scroll"));
    });
    assert.deepEqual(result.current, { inset: 200, height: 500 });

    // A viewport taller than the window never gives a negative inset
    act(() => {
      viewport.height = 900;
      viewport.offsetTop = 0;
      viewport.dispatchEvent(new Event("resize"));
    });
    assert.deepEqual(result.current, { inset: 0, height: 900 });
  });
});
