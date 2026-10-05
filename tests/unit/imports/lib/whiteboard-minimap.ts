import { assert } from "chai";
import type { WhiteboardColor } from "../../../../imports/lib/models/WhiteboardNodes";
import type { Solvedness } from "../../../../imports/lib/solvedness";
import { miniMapColor } from "../../../../imports/lib/whiteboard/minimap";

const palette = {
  solvedness: {
    solved: "#solved",
    unsolved: "#unsolved",
    noAnswers: "#noAnswers",
  },
  frames: {
    yellow: "#f59f00",
    orange: "#f76707",
    red: "#e03131",
    pink: "#d6336c",
    purple: "#7048e8",
    blue: "#1c7ed6",
    green: "#2f9e44",
    gray: "#868e96",
    black: "#495057",
  } satisfies Record<WhiteboardColor, string>,
};
const solvedness = new Map<string, Solvedness>([
  ["done", "solved"],
  ["open", "unsolved"],
]);
const colorOf = (doc: Parameters<typeof miniMapColor>[0]) =>
  miniMapColor(doc, palette, (id) => solvedness.get(id));

describe("whiteboard miniMapColor", function () {
  it("colours a solved card differently from an unsolved one", function () {
    assert.equal(colorOf({ type: "puzzle", puzzle: "done" }), "#solved");
    assert.equal(colorOf({ type: "puzzle", puzzle: "open" }), "#unsolved");
  });

  it("shows a card whose puzzle it doesn't know as grey", function () {
    const grey = colorOf({ type: "sticky" });
    assert.equal(colorOf({ type: "puzzle", puzzle: "gone" }), grey);
    assert.equal(colorOf({ type: "puzzle" }), grey);
  });

  it("shows a frame's colour faintly, and an uncoloured frame fainter still", function () {
    assert.equal(colorOf({ type: "frame", color: "blue" }), "#1c7ed640");
    assert.match(colorOf({ type: "frame" }), /^rgb\(128 128 128 \/ \d+%\)$/);
  });

  it("shows a shape as faintly as a frame, clear or coloured", function () {
    assert.equal(
      colorOf({ type: "shape", color: "green" }),
      colorOf({ type: "frame", color: "green" }),
    );
    assert.equal(colorOf({ type: "shape" }), colorOf({ type: "frame" }));
    assert.notEqual(colorOf({ type: "shape" }), colorOf({ type: "sticky" }));
  });

  it("hides free line ends and greys everything else", function () {
    assert.equal(colorOf({ type: "point" }), "transparent");
    assert.equal(colorOf({ type: "ink" }), colorOf({ type: "text" }));
  });
});
