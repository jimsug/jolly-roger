import { Meteor } from "meteor/meteor";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { assert } from "chai";
import sinon from "sinon";

if (Meteor.isClient) {
  const {
    useWhiteboardFeederArrows,
  }: typeof import("../../../../imports/client/hooks/persisted-state") = require("../../../../imports/client/hooks/persisted-state");

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
}
