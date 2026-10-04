import { assert } from "chai";
import { MAX_COORDINATE } from "../../../../imports/lib/whiteboard/limits";
import {
  boardLinkQuery,
  boardTargetFromParams,
  boardTargetKey,
  formatBoardView,
  MAX_ZOOM,
  MIN_ZOOM,
  parseBoardView,
} from "../../../../imports/lib/whiteboard/links";

describe("whiteboard parseBoardView", function () {
  it("reads x, y and zoom", function () {
    assert.deepEqual(parseBoardView("120,-40.5,0.8"), {
      x: 120,
      y: -40.5,
      zoom: 0.8,
    });
  });

  it("accepts the edges of the board and of the zoom range", function () {
    assert.ok(
      parseBoardView(`${MAX_COORDINATE},-${MAX_COORDINATE},${MIN_ZOOM}`),
    );
    assert.ok(parseBoardView(`0,0,${MAX_ZOOM}`));
  });

  it("ignores anything else", function () {
    [
      "",
      "1,2",
      "1,2,3,4",
      "1,,1",
      "a,b,c",
      "1,2,NaN",
      "Infinity,0,1",
      `${MAX_COORDINATE + 1},0,1`,
      "0,0,0",
      "0,0,-1",
      `0,0,${MAX_ZOOM + 0.01}`,
    ].forEach((value) => {
      assert.isUndefined(parseBoardView(value), value);
    });
  });
});

describe("whiteboard formatBoardView", function () {
  it("rounds to board units and hundredths of zoom", function () {
    assert.equal(
      formatBoardView({ x: 10.4, y: -3.6, zoom: 0.8333 }),
      "10,-4,0.83",
    );
  });

  it("keeps the zoom in range, so its own links parse", function () {
    const text = formatBoardView({ x: 0, y: 0, zoom: 5 });
    assert.deepEqual(parseBoardView(text), { x: 0, y: 0, zoom: MAX_ZOOM });
  });
});

describe("whiteboard boardTargetFromParams", function () {
  it("reads a puzzle, a node or a view", function () {
    assert.deepEqual(boardTargetFromParams({ puzzle: "p" }), {
      kind: "puzzle",
      id: "p",
    });
    assert.deepEqual(boardTargetFromParams({ node: "n" }), {
      kind: "node",
      id: "n",
    });
    assert.deepEqual(boardTargetFromParams({ v: "1,2,0.5" }), {
      kind: "view",
      x: 1,
      y: 2,
      zoom: 0.5,
    });
  });

  it("takes a puzzle over a node, and a node over a view", function () {
    assert.deepEqual(
      boardTargetFromParams({ puzzle: "p", node: "n", v: "1,2,0.5" }),
      { kind: "puzzle", id: "p" },
    );
    assert.deepEqual(boardTargetFromParams({ node: "n", v: "1,2,0.5" }), {
      kind: "node",
      id: "n",
    });
  });

  it("names nothing for no parameters, empty ones or a bad view", function () {
    assert.isUndefined(boardTargetFromParams({}));
    assert.isUndefined(boardTargetFromParams({ puzzle: "", node: "" }));
    assert.isUndefined(boardTargetFromParams({ v: "abc" }));
  });
});

describe("whiteboard boardTargetKey", function () {
  it("tells targets apart, and is empty for none", function () {
    const keys = [
      boardTargetKey({ kind: "puzzle", id: "a" }),
      boardTargetKey({ kind: "node", id: "a" }),
      boardTargetKey({ kind: "puzzle", id: "b" }),
      boardTargetKey({ kind: "view", x: 1, y: 2, zoom: 1 }),
      boardTargetKey({ kind: "view", x: 1, y: 2, zoom: 0.5 }),
    ];
    assert.equal(new Set(keys).size, keys.length);
    assert.equal(boardTargetKey(undefined), "");
    assert.equal(
      boardTargetKey({ kind: "puzzle", id: "a" }),
      boardTargetKey({ kind: "puzzle", id: "a" }),
    );
  });
});

describe("whiteboard boardLinkQuery", function () {
  const view = { x: 10.4, y: -3.6, zoom: 0.8333 };

  it("links a card by its puzzle", function () {
    assert.equal(
      boardLinkQuery({ _id: "n", type: "puzzle", puzzle: "p" }, view),
      "puzzle=p",
    );
  });

  it("links frames, notes and text by their node", function () {
    (["frame", "sticky", "text"] as const).forEach((type) => {
      assert.equal(boardLinkQuery({ _id: "n", type }, view), "node=n", type);
    });
  });

  it("links the view for nothing, or for something it can't link", function () {
    assert.equal(boardLinkQuery(undefined, view), "v=10,-4,0.83");
    assert.equal(
      boardLinkQuery({ _id: "n", type: "ink" }, view),
      "v=10,-4,0.83",
    );
    assert.equal(
      boardLinkQuery({ _id: "n", type: "puzzle" }, view),
      "v=10,-4,0.83",
    );
  });

  it("encodes the ids it puts in a link", function () {
    assert.equal(
      boardLinkQuery({ _id: "a&b", type: "sticky" }, view),
      "node=a%26b",
    );
  });

  it("writes views that boardTargetFromParams reads back", function () {
    const query = new URLSearchParams(boardLinkQuery(undefined, view));
    assert.deepEqual(
      boardTargetFromParams({ v: query.get("v") ?? undefined }),
      { kind: "view", x: 10, y: -4, zoom: 0.83 },
    );
  });
});
