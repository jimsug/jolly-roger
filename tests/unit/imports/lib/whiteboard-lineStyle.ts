import { assert } from "chai";
import type { LineStyle } from "../../../../imports/lib/whiteboard/lineStyle";
import { lineStyleFrom } from "../../../../imports/lib/whiteboard/lineStyle";

const fallback: LineStyle = {
  pathStyle: "curved",
  arrowHead: "end",
  color: "black",
  dashed: false,
};

describe("whiteboard lineStyleFrom", function () {
  it("keeps a saved style that is all there", function () {
    const saved: LineStyle = {
      pathStyle: "elbow",
      arrowHead: "both",
      color: "red",
      dashed: true,
    };
    assert.deepEqual(lineStyleFrom(saved, fallback), saved);
  });

  it("falls back when nothing or something else is saved", function () {
    assert.deepEqual(lineStyleFrom(undefined, fallback), fallback);
    assert.deepEqual(lineStyleFrom(null, fallback), fallback);
    assert.deepEqual(lineStyleFrom("curved", fallback), fallback);
    assert.deepEqual(lineStyleFrom(7, fallback), fallback);
    assert.deepEqual(lineStyleFrom([], fallback), fallback);
  });

  it("reads the fork's colour as color", function () {
    assert.deepEqual(
      lineStyleFrom(
        { pathStyle: "straight", arrowHead: "none", colour: "blue" },
        fallback,
      ),
      {
        pathStyle: "straight",
        arrowHead: "none",
        color: "blue",
        dashed: false,
      },
    );
    // color wins when both are there
    assert.equal(
      lineStyleFrom({ color: "green", colour: "blue" }, fallback).color,
      "green",
    );
  });

  it("drops fields that aren't the style's and values it can't take", function () {
    const style = lineStyleFrom(
      {
        pathStyle: "wavy",
        arrowHead: 3,
        color: "#ff0000",
        dashed: "yes",
        width: 4,
        label: "x",
      },
      fallback,
    );
    assert.deepEqual(style, fallback);
    assert.sameMembers(Object.keys(style), [
      "pathStyle",
      "arrowHead",
      "color",
      "dashed",
    ]);
  });
});
