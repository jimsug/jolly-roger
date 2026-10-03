import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { assert } from "chai";
import OperatorModeMenuItem from "../../../../imports/client/components/OperatorModeMenuItem";

const HUNT_ID = "operatorModeMenuItemHunt";
const STORAGE_KEY = "operatorActionsHidden";

const storedHidden = () => {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return undefined;
  }
  return (JSON.parse(stored) as Record<string, boolean>)[HUNT_ID];
};

describe("OperatorModeMenuItem", function () {
  beforeEach(function () {
    window.localStorage.removeItem(STORAGE_KEY);
  });

  afterEach(function () {
    cleanup();
    window.localStorage.removeItem(STORAGE_KEY);
  });

  it("offers Solver mode while operator actions are shown", function () {
    render(<OperatorModeMenuItem huntId={HUNT_ID} />);
    assert.exists(screen.getByText("Switch to Solver"));
    assert.exists(screen.getByText("Currently in Deputy mode"));
  });

  it("flips the persisted mode on each click", function () {
    render(<OperatorModeMenuItem huntId={HUNT_ID} />);

    fireEvent.click(screen.getByText("Switch to Solver"));
    assert.exists(screen.getByText("Switch to Deputy"));
    assert.exists(screen.getByText("Currently in Solver mode"));
    assert.isTrue(storedHidden());

    fireEvent.click(screen.getByText("Switch to Deputy"));
    assert.exists(screen.getByText("Switch to Solver"));
    assert.exists(screen.getByText("Currently in Deputy mode"));
    assert.isFalse(storedHidden());
  });

  it("reads the mode the puzzle list toggle saved", function () {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ [HUNT_ID]: true }),
    );
    render(<OperatorModeMenuItem huntId={HUNT_ID} />);
    assert.exists(screen.getByText("Switch to Deputy"));
    assert.exists(screen.getByText("Currently in Solver mode"));
  });
});
