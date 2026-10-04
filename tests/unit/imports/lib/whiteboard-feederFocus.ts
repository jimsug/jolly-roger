import { assert } from "chai";
import {
  feederArrowEmphasis,
  feederArrowLook,
  feederFocus,
} from "../../../../imports/lib/whiteboard/feederFocus";

// Feeders f1 and f2 feed meta m; m feeds metameta mm.
const arrows = [
  { source: "f1", target: "m" },
  { source: "f2", target: "m" },
  { source: "m", target: "mm" },
];

describe("whiteboard feederFocus", function () {
  it("keeps only cards with feeder arrows, once each", function () {
    assert.deepEqual(
      feederFocus(["m", undefined, "sticky", "f1", "m"], arrows),
      ["f1", "m"],
    );
  });

  it("is empty with nothing in focus or no arrows", function () {
    assert.deepEqual(feederFocus([], arrows), []);
    assert.deepEqual(feederFocus([undefined], arrows), []);
    assert.deepEqual(feederFocus(["m"], []), []);
  });
});

describe("whiteboard feederArrowEmphasis", function () {
  const emphasis = (focus: string[]) =>
    arrows.map((a) => feederArrowEmphasis(a, new Set(focus)));

  it("leaves every arrow alone with nothing in focus", function () {
    assert.deepEqual(emphasis([]), [undefined, undefined, undefined]);
  });

  it("raises a meta's arrows, both from its feeders and to its own meta", function () {
    assert.deepEqual(emphasis(["m"]), ["raised", "raised", "raised"]);
  });

  it("raises a feeder's arrows to its metas and fades the rest", function () {
    assert.deepEqual(emphasis(["f1"]), ["raised", "faded", "faded"]);
  });

  it("raises the arrows of every card in focus", function () {
    assert.deepEqual(emphasis(["f1", "f2"]), ["raised", "raised", "faded"]);
  });
});

describe("whiteboard feederArrowLook", function () {
  it("draws arrows thin and quiet as a rule", function () {
    assert.deepEqual(feederArrowLook(undefined, false), {
      strokeWidth: 1,
      opacity: 0.55,
    });
  });

  it("draws a raised arrow at full opacity and 2px", function () {
    assert.deepEqual(feederArrowLook("raised", false), {
      strokeWidth: 2,
      opacity: 1,
    });
    assert.deepEqual(feederArrowLook("raised", true), {
      strokeWidth: 2,
      opacity: 1,
    });
  });

  it("fades the others", function () {
    assert.isBelow(feederArrowLook("faded", false).opacity, 0.55);
    assert.equal(feederArrowLook("faded", false).strokeWidth, 1);
  });

  it("shows a selected arrow at full opacity, even when faded", function () {
    assert.equal(feederArrowLook(undefined, true).opacity, 1);
    assert.equal(feederArrowLook("faded", true).opacity, 1);
  });
});
