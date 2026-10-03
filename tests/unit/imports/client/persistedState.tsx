import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { assert } from "chai";
import sinon from "sinon";
import type { PuzzleListState } from "../../../../imports/client/hooks/persisted-state";
import {
  useHuntPuzzleListShowViewers,
  useWhiteboardFeederArrows,
} from "../../../../imports/client/hooks/persisted-state";

const KEY = "whiteboard:feederArrows";

const FeederArrowsToggle = () => {
  const [shown, setShown] = useWhiteboardFeederArrows();
  return (
    <button type="button" onClick={() => setShown((current) => !current)}>
      {shown ? "shown" : "hidden"}
    </button>
  );
};

describe("whiteboard settings", function () {
  beforeEach(function () {
    localStorage.removeItem(KEY);
  });

  afterEach(function () {
    cleanup();
    sinon.restore();
    localStorage.removeItem(KEY);
  });

  it("are kept for the next visit", function () {
    render(<FeederArrowsToggle />);
    fireEvent.click(screen.getByRole("button", { name: "shown" }));
    assert.equal(localStorage.getItem(KEY), "false");
    cleanup();
    render(<FeederArrowsToggle />);
    assert.exists(screen.getByRole("button", { name: "hidden" }));
  });

  it("still change when storage won't take them", function () {
    sinon
      .stub(Storage.prototype, "setItem")
      .throws(new DOMException("Storage is full", "QuotaExceededError"));
    render(<FeederArrowsToggle />);
    fireEvent.click(screen.getByRole("button", { name: "shown" }));
    assert.exists(screen.getByRole("button", { name: "hidden" }));
    fireEvent.click(screen.getByRole("button", { name: "hidden" }));
    assert.exists(screen.getByRole("button", { name: "shown" }));
  });
});

const VIEW_KEY = "puzzleListView";
const HUNT_ID = "persistedStateHunt";

const ViewersToggle = () => {
  const [shown, setShown] = useHuntPuzzleListShowViewers(HUNT_ID);
  return (
    <button type="button" onClick={() => setShown((current) => !current)}>
      {shown ? "viewers shown" : "viewers hidden"}
    </button>
  );
};

const saveView = (view: Partial<PuzzleListState>) => {
  localStorage.setItem(
    VIEW_KEY,
    JSON.stringify({
      [HUNT_ID]: {
        displayMode: "group",
        showSolved: true,
        collapseGroups: {},
        ...view,
      },
    }),
  );
};

const savedView = () => {
  const stored = localStorage.getItem(VIEW_KEY);
  if (!stored) {
    return undefined;
  }
  return (JSON.parse(stored) as Record<string, PuzzleListState>)[HUNT_ID];
};

describe("the puzzle list's viewers setting", function () {
  beforeEach(function () {
    localStorage.removeItem(VIEW_KEY);
  });

  afterEach(function () {
    cleanup();
    localStorage.removeItem(VIEW_KEY);
  });

  it("is shown when nothing is saved", function () {
    render(<ViewersToggle />);
    assert.exists(screen.getByRole("button", { name: "viewers shown" }));
  });

  it("falls back to a saved showSolvers, shown for anything but hide", function () {
    saveView({ showSolvers: "hide" });
    render(<ViewersToggle />);
    assert.exists(screen.getByRole("button", { name: "viewers hidden" }));
    cleanup();

    saveView({ showSolvers: "viewers" });
    render(<ViewersToggle />);
    assert.exists(screen.getByRole("button", { name: "viewers shown" }));
    cleanup();

    saveView({ showSolvers: "callers" });
    render(<ViewersToggle />);
    assert.exists(screen.getByRole("button", { name: "viewers shown" }));
  });

  it("saves a change as showViewers, which wins over showSolvers", function () {
    saveView({ showSolvers: "hide" });
    render(<ViewersToggle />);
    fireEvent.click(screen.getByRole("button", { name: "viewers hidden" }));
    assert.exists(screen.getByRole("button", { name: "viewers shown" }));
    assert.isTrue(savedView()?.showViewers);
    cleanup();

    render(<ViewersToggle />);
    assert.exists(screen.getByRole("button", { name: "viewers shown" }));
  });
});
