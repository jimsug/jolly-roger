import { Meteor } from "meteor/meteor";
import { assert } from "chai";
import type { BoardDocs } from "../../../../imports/client/components/whiteboard/boardWrites";
import {
  callAll,
  dependedOnKeys,
  inverseOf,
  parentsFirst,
  parseKey,
  touchedKeys,
} from "../../../../imports/client/components/whiteboard/boardWrites";
import type { WhiteboardEdgeType } from "../../../../imports/lib/models/WhiteboardEdges";
import type { WhiteboardNodeType } from "../../../../imports/lib/models/WhiteboardNodes";

const at = new Date(1_000_000);

const node = (
  _id: string,
  fields: Partial<WhiteboardNodeType> = {},
): WhiteboardNodeType => ({
  _id,
  hunt: "hunt",
  board: "board",
  type: "sticky",
  position: { x: 10, y: 20 },
  contributors: [],
  createdAt: at,
  createdBy: "user",
  updatedAt: at,
  ...fields,
});

const edge = (
  _id: string,
  source: string,
  target: string,
  fields: Partial<WhiteboardEdgeType> = {},
): WhiteboardEdgeType => ({
  _id,
  hunt: "hunt",
  board: "board",
  source,
  target,
  contributors: [],
  createdAt: at,
  createdBy: "user",
  updatedAt: at,
  ...fields,
});

const docsOf = (
  nodes: WhiteboardNodeType[],
  edges: WhiteboardEdgeType[] = [],
): BoardDocs => ({
  node: (id) => nodes.find((n) => n._id === id),
  edge: (id) => edges.find((e) => e._id === id),
  children: (frames) =>
    nodes.filter((n) => n.parent && frames.includes(n.parent)),
  strokeSegments: (strokes) =>
    nodes.filter((n) => n.stroke && strokes.includes(n.stroke)),
  edgesTouching: (ids) =>
    edges.filter((e) => ids.includes(e.source) || ids.includes(e.target)),
});

describe("whiteboard undo inverses", function () {
  it("moves a node back where it was, in its old frame", function () {
    const docs = docsOf([node("a", { parent: "frame" })]);
    assert.deepEqual(
      inverseOf(
        { upsertNodes: [{ _id: "a", position: { x: 1, y: 2 }, parent: null }] },
        docs,
      ),
      {
        upsertNodes: [
          { _id: "a", position: { x: 10, y: 20 }, parent: "frame" },
        ],
      },
    );
  });

  it("puts text, colour and folding back, clearing what wasn't set", function () {
    const docs = docsOf([
      node("sticky", { text: "old", color: "blue" }),
      node("text", { type: "text" }),
      node("frame", { type: "frame", frameKind: "user" }),
    ]);
    assert.deepEqual(
      inverseOf(
        {
          upsertNodes: [
            { _id: "sticky", text: "new", color: "red" },
            { _id: "text", text: "typed", color: "green" },
            { _id: "frame", collapsed: true, label: "Round" },
          ],
        },
        docs,
      ).upsertNodes,
      [
        { _id: "sticky", text: "old", color: "blue" },
        { _id: "text", text: null, color: null },
        { _id: "frame", collapsed: false, label: null },
      ],
    );
  });

  it("unlocks what was locked and locks what was unlocked", function () {
    const docs = docsOf([
      node("open"),
      node("held", { locked: true, lockedBy: "someone" }),
    ]);
    assert.deepEqual(
      inverseOf(
        {
          upsertNodes: [
            { _id: "open", locked: true },
            { _id: "held", locked: false },
          ],
        },
        docs,
      ).upsertNodes,
      [
        { _id: "open", locked: false },
        { _id: "held", locked: true },
      ],
    );
  });

  it("deletes what was created, and takes away what was put back", function () {
    const docs = docsOf([node("card", { type: "puzzle", hidden: true })]);
    assert.deepEqual(
      inverseOf(
        {
          upsertNodes: [
            { _id: "new", type: "sticky", position: { x: 0, y: 0 } },
            { _id: "card", hidden: false, parent: null },
          ],
        },
        docs,
      ),
      { deleteNodes: ["new", "card"] },
    );
  });

  it("puts a deleted note back with its id and fields, and its lines", function () {
    const docs = docsOf(
      [
        node("note", { text: "keep me", color: "pink", width: 200 }),
        node("card", { type: "puzzle", puzzle: "p" }),
        node("end", { type: "point", position: { x: 5, y: 5 } }),
      ],
      [
        edge("toCard", "note", "card", { label: "feeds", dashed: true }),
        edge("toEnd", "note", "end"),
      ],
    );
    assert.deepEqual(inverseOf({ deleteNodes: ["note"] }, docs), {
      upsertNodes: [
        {
          _id: "note",
          type: "sticky",
          position: { x: 10, y: 20 },
          parent: null,
          width: 200,
          text: "keep me",
          color: "pink",
        },
        // The free end went with its only line
        { _id: "end", type: "point", position: { x: 5, y: 5 }, parent: null },
      ],
      upsertEdges: [
        {
          _id: "toCard",
          source: "note",
          target: "card",
          label: "feeds",
          dashed: true,
        },
        { _id: "toEnd", source: "note", target: "end" },
      ],
    });
  });

  it("puts a deleted image back with the same upload and size", function () {
    const image = { url: "https://example.com/a/b/c", width: 800, height: 400 };
    const docs = docsOf([
      node("pic", {
        type: "image",
        width: 240,
        height: 120,
        image,
      }),
    ]);
    assert.deepEqual(inverseOf({ deleteNodes: ["pic"] }, docs), {
      upsertNodes: [
        {
          _id: "pic",
          type: "image",
          position: { x: 10, y: 20 },
          parent: null,
          width: 240,
          height: 120,
          image,
        },
      ],
    });
  });

  it("puts a deleted shape back as the same shape, size and colour", function () {
    const docs = docsOf([
      node("box", {
        type: "shape",
        width: 160,
        height: 120,
        shape: "ellipse",
        color: "green",
      }),
    ]);
    assert.deepEqual(inverseOf({ deleteNodes: ["box"] }, docs), {
      upsertNodes: [
        {
          _id: "box",
          type: "shape",
          position: { x: 10, y: 20 },
          parent: null,
          width: 160,
          height: 120,
          color: "green",
          shape: "ellipse",
        },
      ],
    });
  });

  it("brings back a whole ink stroke from one segment", function () {
    const docs = docsOf([
      node("one", { type: "ink", stroke: "s", points: [[0, 0, 0.5]] }),
      node("two", { type: "ink", stroke: "s", points: [[1, 1, 0.5]] }),
      node("other", { type: "ink", stroke: "t", points: [[2, 2, 0.5]] }),
    ]);
    const ids = inverseOf({ deleteNodes: ["one"] }, docs).upsertNodes?.map(
      (n) => n._id,
    );
    assert.sameMembers(ids ?? [], ["one", "two"]);
  });

  it("unhides a card or seeded frame, and puts a frame's contents back in it", function () {
    const docs = docsOf([
      node("round", {
        type: "frame",
        tag: "tag",
        frameKind: "group",
        collapsed: true,
      }),
      node("card", { type: "puzzle", puzzle: "p", parent: "round" }),
    ]);
    assert.deepEqual(inverseOf({ deleteNodes: ["round"] }, docs), {
      upsertNodes: [
        { _id: "round", hidden: false, collapsed: true },
        { _id: "card", parent: "round", position: { x: 10, y: 20 } },
      ],
    });
  });

  it("takes a moved line end back, bringing back the free end it left", function () {
    const docs = docsOf(
      [node("end", { type: "point" }), node("card", { type: "puzzle" })],
      [edge("line", "card", "end", { color: "red" })],
    );
    assert.deepEqual(
      inverseOf(
        {
          upsertEdges: [{ _id: "line", target: "other", pathStyle: "elbow" }],
        },
        docs,
      ),
      {
        upsertNodes: [
          {
            _id: "end",
            type: "point",
            position: { x: 10, y: 20 },
            parent: null,
          },
        ],
        // An unset style goes back to what unset draws as
        upsertEdges: [{ _id: "line", target: "end", pathStyle: "curved" }],
      },
    );
  });

  it("puts a deleted line back, and a feeder arrow by showing it", function () {
    const docs = docsOf(
      [node("a"), node("b")],
      [
        edge("line", "a", "b", { arrowHead: "both" }),
        edge("feeder", "a", "b", { auto: true }),
      ],
    );
    assert.deepEqual(inverseOf({ deleteEdges: ["line", "feeder"] }, docs), {
      upsertEdges: [
        { _id: "line", source: "a", target: "b", arrowHead: "both" },
        { _id: "feeder", hidden: false },
      ],
    });
  });

  it("brings back a free end shared by a deleted line and a line deleted with its node", function () {
    const docs = docsOf(
      [node("a"), node("b"), node("p", { type: "point" })],
      [edge("l1", "a", "p"), edge("l2", "b", "p")],
    );
    const inverse = inverseOf(
      { deleteNodes: ["b"], deleteEdges: ["l1"] },
      docs,
    );
    assert.sameMembers(
      (inverse.upsertNodes ?? []).map((n) => n._id),
      ["b", "p"],
    );
    assert.sameMembers(
      (inverse.upsertEdges ?? []).map((e) => e._id),
      ["l1", "l2"],
    );
  });

  it("leaves a free end that another line still uses", function () {
    const docs = docsOf(
      [node("a"), node("b"), node("p", { type: "point" })],
      [edge("l1", "a", "p"), edge("l2", "b", "p")],
    );
    assert.deepEqual(inverseOf({ deleteEdges: ["l1"] }, docs), {
      upsertEdges: [{ _id: "l1", source: "a", target: "p" }],
    });
  });

  it("deletes a new line and its new free ends together", function () {
    const inverse = inverseOf(
      {
        upsertNodes: [{ _id: "p", type: "point", position: { x: 0, y: 0 } }],
        upsertEdges: [{ _id: "line", source: "a", target: "p" }],
      },
      docsOf([node("a")]),
    );
    assert.deepEqual(inverse, { deleteEdges: ["line"], deleteNodes: ["p"] });
    assert.sameMembers(
      touchedKeys(
        {
          upsertNodes: [{ _id: "p", type: "point", position: { x: 0, y: 0 } }],
          upsertEdges: [{ _id: "line", source: "a", target: "p" }],
        },
        inverse,
      ),
      ["node:p", "edge:line"],
    );
  });

  it("moves cards placed by tags back where they were", function () {
    const docs = docsOf([node("card", { type: "puzzle", parent: "frame" })]);
    assert.deepEqual(inverseOf({ placeByTags: ["card"] }, docs), {
      upsertNodes: [
        { _id: "card", position: { x: 10, y: 20 }, parent: "frame" },
      ],
    });
  });

  it("orders frames before what goes into them", function () {
    assert.deepEqual(
      parentsFirst([
        { _id: "child", parent: "inner" },
        { _id: "inner", parent: "outer" },
        { _id: "outer", parent: null },
        { _id: "loose" },
      ]).map((n) => n._id),
      ["outer", "loose", "inner", "child"],
    );
  });
});

describe("whiteboard undo keys", function () {
  it("names what a write needs on the board but doesn't write", function () {
    assert.sameMembers(
      dependedOnKeys(
        {
          upsertNodes: [
            { _id: "note", parent: "frame" },
            { _id: "loose", parent: null },
            { _id: "inner", parent: "outer" },
            { _id: "outer", type: "frame", position: { x: 0, y: 0 } },
          ],
        },
        { upsertEdges: [{ _id: "line", source: "card", target: "note" }] },
        { upsertEdges: [{ _id: "restyled", color: "red" }] },
      ),
      ["node:frame", "node:card"],
    );
    assert.deepEqual(dependedOnKeys({ deleteNodes: ["gone"] }), []);
  });

  it("reads a key back to its kind and id", function () {
    assert.deepEqual(parseKey("node:abc"), { kind: "node", id: "abc" });
    assert.deepEqual(parseKey("edge:x:y"), { kind: "edge", id: "x:y" });
  });
});

describe("whiteboard callAll", function () {
  it("hears at once when there's nothing to call", function () {
    let heard = 0;
    callAll([], (error) => {
      assert.isUndefined(error);
      heard += 1;
    });
    assert.equal(heard, 1);
  });

  it("hears once every call is back, with the first refusal", function () {
    const dones: ((error?: Meteor.Error) => void)[] = [];
    const heard: (Meteor.Error | undefined)[] = [];
    callAll(
      [0, 1, 2].map(() => (done) => {
        dones.push(done);
      }),
      (error) => heard.push(error),
    );
    const first = new Meteor.Error(400, "first");
    dones[1]!(first);
    dones[0]!();
    assert.isEmpty(heard);
    dones[2]!(new Meteor.Error(400, "second"));
    assert.deepEqual(heard, [first]);
  });
});
