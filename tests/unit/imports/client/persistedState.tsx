import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { assert } from "chai";
import sinon from "sinon";
import type { PuzzleListState } from "../../../../imports/client/hooks/persisted-state";
import {
  useAddPuzzleHuntRecentTags,
  useHuntPuzzleListShowViewers,
  useWhiteboardFeederArrows,
  useWhiteboardHideInk,
} from "../../../../imports/client/hooks/persisted-state";

const KEY = "whiteboard:feederArrows";
const HIDE_INK_KEY = "whiteboard:hideInk";

const FeederArrowsToggle = () => {
  const [shown, setShown] = useWhiteboardFeederArrows();
  return (
    <button type="button" onClick={() => setShown((current) => !current)}>
      {shown ? "shown" : "hidden"}
    </button>
  );
};

const HideInkToggle = () => {
  const [hidden, setHidden] = useWhiteboardHideInk();
  return (
    <button type="button" onClick={() => setHidden((current) => !current)}>
      {hidden ? "ink hidden" : "ink shown"}
    </button>
  );
};

describe("whiteboard settings", function () {
  beforeEach(function () {
    localStorage.removeItem(KEY);
    localStorage.removeItem(HIDE_INK_KEY);
  });

  afterEach(function () {
    cleanup();
    sinon.restore();
    localStorage.removeItem(KEY);
    localStorage.removeItem(HIDE_INK_KEY);
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

    // Once storage takes values again, the next change is saved
    sinon.restore();
    fireEvent.click(screen.getByRole("button", { name: "shown" }));
    assert.equal(localStorage.getItem(KEY), "false");
  });

  it("follow a change made elsewhere in the tab, and only under its key", function () {
    render(
      <>
        <FeederArrowsToggle />
        <FeederArrowsToggle />
        <HideInkToggle />
      </>,
    );
    const [first, second] = screen.getAllByRole("button", { name: "shown" });
    assert.exists(first);
    assert.exists(second);
    fireEvent.click(first);
    assert.lengthOf(screen.getAllByRole("button", { name: "hidden" }), 2);
    assert.exists(screen.getByRole("button", { name: "ink shown" }));
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

const RECENT_KEY = "huntRecentTags";

const RecentTags = ({ huntId, add }: { huntId: string; add: string[] }) => {
  const [recent, addRecent] = useAddPuzzleHuntRecentTags(huntId);
  return (
    <div>
      <button type="button" onClick={() => addRecent(add)}>
        add {huntId}
      </button>
      <output aria-label={`recent ${huntId}`}>{recent.join(",")}</output>
    </div>
  );
};

const shownRecent = (huntId = HUNT_ID) =>
  screen.getByLabelText(`recent ${huntId}`).textContent;

describe("the add puzzle form's recent tags", function () {
  beforeEach(function () {
    localStorage.removeItem(RECENT_KEY);
  });

  afterEach(function () {
    cleanup();
    sinon.restore();
    localStorage.removeItem(RECENT_KEY);
  });

  it("puts the newest first, once each, and keeps them for the next visit", function () {
    render(<RecentTags huntId={HUNT_ID} add={["a", "b"]} />);
    assert.equal(shownRecent(), "");
    fireEvent.click(screen.getByRole("button", { name: `add ${HUNT_ID}` }));
    assert.equal(shownRecent(), "a,b");
    cleanup();

    render(<RecentTags huntId={HUNT_ID} add={["c", "b", "c"]} />);
    assert.equal(shownRecent(), "a,b");
    fireEvent.click(screen.getByRole("button", { name: `add ${HUNT_ID}` }));
    assert.equal(shownRecent(), "c,b,a");
    assert.deepEqual(JSON.parse(localStorage.getItem(RECENT_KEY) ?? "null"), {
      [HUNT_ID]: ["c", "b", "a"],
    });
  });

  it("keeps the ten newest", function () {
    const first = Array.from({ length: 8 }, (_, i) => `old${i}`);
    render(<RecentTags huntId={HUNT_ID} add={first} />);
    fireEvent.click(screen.getByRole("button", { name: `add ${HUNT_ID}` }));
    cleanup();

    render(<RecentTags huntId={HUNT_ID} add={["new0", "new1", "new2"]} />);
    fireEvent.click(screen.getByRole("button", { name: `add ${HUNT_ID}` }));
    assert.equal(
      shownRecent(),
      "new0,new1,new2,old0,old1,old2,old3,old4,old5,old6",
    );
  });

  it("keeps each hunt's apart, and shares a change with the rest of the tab", function () {
    render(
      <>
        <RecentTags huntId={HUNT_ID} add={["a"]} />
        <RecentTags huntId="otherHunt" add={["z"]} />
        <RecentTags huntId={HUNT_ID} add={["b"]} />
      </>,
    );
    const [addA, addB] = screen.getAllByRole("button", {
      name: `add ${HUNT_ID}`,
    });
    assert.exists(addA);
    assert.exists(addB);
    fireEvent.click(addA);
    fireEvent.click(screen.getByRole("button", { name: "add otherHunt" }));
    fireEvent.click(addB);
    assert.deepEqual(
      screen.getAllByLabelText(`recent ${HUNT_ID}`).map((o) => o.textContent),
      ["b,a", "b,a"],
    );
    assert.equal(shownRecent("otherHunt"), "z");
  });

  it("still updates when storage is blocked", function () {
    sinon
      .stub(Storage.prototype, "getItem")
      .throws(new DOMException("Blocked", "SecurityError"));
    sinon
      .stub(Storage.prototype, "setItem")
      .throws(new DOMException("Blocked", "SecurityError"));
    render(<RecentTags huntId={HUNT_ID} add={["a", "b"]} />);
    assert.equal(shownRecent(), "");
    fireEvent.click(screen.getByRole("button", { name: `add ${HUNT_ID}` }));
    assert.equal(shownRecent(), "a,b");

    // A form opened later in the visit starts from the same list, and adding
    // to it keeps what the first one added
    render(<RecentTags huntId={HUNT_ID} add={["c"]} />);
    const shown = () =>
      screen.getAllByLabelText(`recent ${HUNT_ID}`).map((o) => o.textContent);
    assert.deepEqual(shown(), ["a,b", "a,b"]);
    const [, addC] = screen.getAllByRole("button", { name: `add ${HUNT_ID}` });
    assert.exists(addC);
    fireEvent.click(addC);
    assert.deepEqual(shown(), ["c,a,b", "c,a,b"]);

    // Once storage takes values again, the next change is saved
    sinon.restore();
    fireEvent.click(addC);
    assert.deepEqual(JSON.parse(localStorage.getItem(RECENT_KEY) ?? "null"), {
      [HUNT_ID]: ["c", "a", "b"],
    });
  });

  it("ignores a saved value that isn't a list of names", function () {
    localStorage.setItem(
      RECENT_KEY,
      JSON.stringify({ [HUNT_ID]: ["a", 3, null, "b"], otherHunt: "c" }),
    );
    render(
      <>
        <RecentTags huntId={HUNT_ID} add={["c"]} />
        <RecentTags huntId="otherHunt" add={["d"]} />
      </>,
    );
    assert.equal(shownRecent(), "a,b");
    assert.equal(shownRecent("otherHunt"), "");
    fireEvent.click(screen.getByRole("button", { name: "add otherHunt" }));
    assert.equal(shownRecent("otherHunt"), "d");
  });
});
