import { assert } from "chai";
import type { WhiteboardEdgeType } from "../../../../imports/lib/models/WhiteboardEdges";
import type { WhiteboardNodeType } from "../../../../imports/lib/models/WhiteboardNodes";
import type { BoardClip } from "../../../../imports/lib/whiteboard/clipboard";
import {
  CLIP_PREFIX,
  clipBounds,
  clipFromText,
  clipText,
  copySelection,
  imageHunt,
  looksLikeClip,
  offsetToCentre,
  pasteClip,
  readClip,
  withoutOtherHuntsImages,
} from "../../../../imports/lib/whiteboard/clipboard";
import type { Point, Rect } from "../../../../imports/lib/whiteboard/layout";
import { POINT_SIZE } from "../../../../imports/lib/whiteboard/layout";
import { MAX_TEXT_LENGTH } from "../../../../imports/lib/whiteboard/limits";

type Node = Pick<
  WhiteboardNodeType,
  | "_id"
  | "type"
  | "parent"
  | "position"
  | "width"
  | "height"
  | "hidden"
  | "text"
  | "label"
  | "color"
  | "points"
  | "strokeWidth"
  | "stroke"
  | "collapsed"
  | "image"
  | "shape"
>;
type Edge = Pick<
  WhiteboardEdgeType,
  | "_id"
  | "source"
  | "target"
  | "label"
  | "hidden"
  | "auto"
  | "pathStyle"
  | "arrowHead"
  | "color"
  | "dashed"
>;

const node = (
  _id: string,
  type: Node["type"],
  x: number,
  y: number,
  extra: Partial<Node> = {},
): Node => ({
  _id,
  type,
  position: { x, y },
  ...(type === "point" ? {} : { width: 100, height: 80 }),
  ...extra,
});
const line = (
  _id: string,
  source: string,
  target: string,
  extra: Partial<Edge> = {},
): Edge => ({ _id, source, target, ...extra });

const select = (nodes: string[], edges: string[] = []) => ({ nodes, edges });

// Ids handed out in order, so tests can say which is which.
const counter = () => {
  let next = 0;
  return () => {
    next += 1;
    return `new${next}`;
  };
};

// Lands a point in the smallest of frames around it, or the top level.
const smallestAround =
  (frames: { id: string; rect: Rect }[]) => (point: Point) =>
    frames
      .filter(
        ({ rect }) =>
          point.x >= rect.x &&
          point.x <= rect.x + rect.width &&
          point.y >= rect.y &&
          point.y <= rect.y + rect.height,
      )
      .toSorted(
        (a, b) => a.rect.width * a.rect.height - b.rect.width * b.rect.height,
      )[0];
const topLevel = smallestAround([]);

const byId = <T extends { id: string }>(items: T[]) =>
  new Map(items.map((item) => [item.id, item]));

describe("whiteboard clipboard", function () {
  describe("copySelection", function () {
    it("brings everything in a selected frame, keeping where it is on the board", function () {
      const nodes = [
        node("f", "frame", 100, 100, { width: 400, height: 300, label: "F" }),
        node("s", "sticky", 24, 56, { parent: "f", text: "Note" }),
        node("g", "frame", 200, 50, { parent: "f", width: 150, height: 150 }),
        node("t", "text", 10, 60, { parent: "g", text: "Inner" }),
        node("outside", "sticky", 900, 900),
      ];
      const { clip, cards } = copySelection(nodes, [], select(["f"]));
      assert.equal(cards, 0);
      const copied = byId(clip.nodes);
      assert.sameMembers([...copied.keys()], ["f", "s", "g", "t"]);
      assert.deepInclude(copied.get("f"), { x: 100, y: 100, label: "F" });
      assert.notProperty(copied.get("f"), "parent");
      assert.deepInclude(copied.get("s"), {
        x: 124,
        y: 156,
        parent: "f",
        text: "Note",
      });
      assert.deepInclude(copied.get("g"), { x: 300, y: 150, parent: "f" });
      assert.deepInclude(copied.get("t"), { x: 310, y: 210, parent: "g" });
    });

    it("copies a node whose frame isn't copied at the top, where it is on the board", function () {
      const nodes = [
        node("f", "frame", 100, 100, { width: 400, height: 300 }),
        node("s", "sticky", 24, 56, { parent: "f" }),
      ];
      const { clip } = copySelection(nodes, [], select(["s"]));
      assert.deepEqual(clip.nodes, [
        { id: "s", type: "sticky", x: 124, y: 156, width: 100, height: 80 },
      ]);
    });

    it("copies every segment of a stroke when one is selected", function () {
      const points: [number, number, number][] = [
        [0, 0, 0.5],
        [10, 10, 0.5],
      ];
      const nodes = [
        node("k1", "ink", 0, 0, { stroke: "s1", points, strokeWidth: "thin" }),
        node("k2", "ink", 10, 10, {
          stroke: "s1",
          points,
          strokeWidth: "thin",
        }),
        node("k3", "ink", 50, 50, {
          stroke: "s2",
          points,
          strokeWidth: "thin",
        }),
      ];
      const { clip } = copySelection(nodes, [], select(["k1"]));
      assert.sameMembers(
        clip.nodes.map((n) => n.id),
        ["k1", "k2"],
      );
      assert.deepInclude(clip.nodes[0], {
        stroke: "s1",
        points,
        strokeWidth: "thin",
      });
    });

    it("copies a line with both ends copied, with its style and label, and drops one with an end left behind", function () {
      const nodes = [
        node("a", "sticky", 0, 0),
        node("b", "sticky", 200, 0),
        node("c", "sticky", 400, 0),
      ];
      const edges = [
        line("ab", "a", "b", {
          label: "feeds",
          pathStyle: "elbow",
          arrowHead: "both",
          color: "red",
          dashed: true,
        }),
        line("ac", "a", "c"),
      ];
      const { clip } = copySelection(nodes, edges, select(["a", "b"]));
      assert.deepEqual(clip.edges, [
        {
          source: "a",
          target: "b",
          label: "feeds",
          pathStyle: "elbow",
          arrowHead: "both",
          color: "red",
          dashed: true,
        },
      ]);
    });

    it("brings a line's free ends along with it, and no others", function () {
      const nodes = [
        node("a", "sticky", 0, 0),
        node("p", "point", 300, 300),
        node("q", "point", 500, 500),
        node("r", "point", 600, 600),
        node("u", "point", 700, 700),
      ];
      const edges = [
        line("ap", "a", "p"),
        // Free at both ends: copied only when selected
        line("qr", "q", "r"),
        line("ru", "r", "u"),
      ];
      const { clip } = copySelection(nodes, edges, select(["a", "q"], ["ru"]));
      assert.sameMembers(
        clip.nodes.map((n) => n.id),
        ["a", "p", "q", "r", "u"],
      );
      assert.sameDeepMembers(
        clip.edges.map((e) => [e.source, e.target]),
        [
          ["a", "p"],
          ["q", "r"],
          ["r", "u"],
        ],
      );

      // A free end selected on its own, with no line copied, stays behind
      const alone = copySelection(nodes, [], select(["a", "q"]));
      assert.deepEqual(
        alone.clip.nodes.map((n) => n.id),
        ["a"],
      );
    });

    it("leaves out puzzle cards and counts them, with their lines", function () {
      const nodes = [
        node("f", "frame", 0, 0, { width: 600, height: 400 }),
        node("k", "puzzle", 24, 56, { parent: "f" }),
        node("s", "sticky", 300, 56, { parent: "f" }),
      ];
      const edges = [line("ks", "k", "s")];
      const cardOnly = copySelection(nodes, edges, select(["k"]));
      assert.isEmpty(cardOnly.clip.nodes);
      assert.isEmpty(cardOnly.clip.edges);
      assert.equal(cardOnly.cards, 1);

      const frame = copySelection(nodes, edges, select(["f"]));
      assert.sameMembers(
        frame.clip.nodes.map((n) => n.id),
        ["f", "s"],
      );
      assert.isEmpty(frame.clip.edges);
      assert.equal(frame.cards, 1);
    });

    it("leaves out feeder arrows, hidden nodes and what isn't on the board", function () {
      const nodes = [
        node("a", "sticky", 0, 0),
        node("b", "sticky", 200, 0),
        node("gone", "frame", 0, 0, { hidden: true }),
      ];
      const edges = [line("auto", "a", "b", { auto: true })];
      const { clip, cards } = copySelection(
        nodes,
        edges,
        select(["a", "b", "gone", "missing"]),
      );
      assert.sameMembers(
        clip.nodes.map((n) => n.id),
        ["a", "b"],
      );
      assert.isEmpty(clip.edges);
      assert.equal(cards, 0);
    });

    it("copies an image with its address and both sizes, and pastes it as it was", function () {
      const image = {
        url: "https://s3.us-east-1.amazonaws.com/bucket/hunt/puzzle/upload",
        width: 1600,
        height: 900,
      };
      const nodes = [
        node("i", "image", 40, 60, { width: 480, height: 270, image }),
      ];
      const { clip, cards } = copySelection(nodes, [], select(["i"]));
      assert.equal(cards, 0);
      assert.deepEqual(clip.nodes, [
        {
          id: "i",
          type: "image",
          x: 40,
          y: 60,
          width: 480,
          height: 270,
          image,
        },
      ]);
      // A copy of the image, not the stored object, goes on the clipboard
      assert.notStrictEqual(clip.nodes[0]!.image, image);
      assert.deepEqual(readClip(clipText(clip)), clip);

      const pasted = pasteClip(clip, { x: 10, y: 0 }, topLevel, counter());
      assert.deepEqual(pasted.nodes, [
        {
          _id: "new1",
          type: "image",
          position: { x: 50, y: 60 },
          parent: null,
          width: 480,
          height: 270,
          image,
        },
      ]);
    });

    it("copies a shape with its kind, size and colour, and pastes it as it was", function () {
      const nodes = [
        node("r", "shape", 40, 60, {
          width: 160,
          height: 120,
          shape: "rect",
          color: "blue",
        }),
        node("e", "shape", 300, 60, {
          width: 80,
          height: 40,
          shape: "ellipse",
        }),
        node("t", "text", 50, 70, { text: "On top" }),
      ];
      const edges = [line("l", "r", "e")];
      const { clip } = copySelection(nodes, edges, select(["r", "e", "t"]));
      assert.deepEqual(byId(clip.nodes).get("r"), {
        id: "r",
        type: "shape",
        x: 40,
        y: 60,
        width: 160,
        height: 120,
        color: "blue",
        shape: "rect",
      });
      assert.deepEqual(byId(clip.nodes).get("e"), {
        id: "e",
        type: "shape",
        x: 300,
        y: 60,
        width: 80,
        height: 40,
        shape: "ellipse",
      });
      assert.deepEqual(clip.edges, [{ source: "r", target: "e" }]);
      assert.deepEqual(readClip(clipText(clip)), clip);

      const pasted = pasteClip(clip, { x: 10, y: 0 }, topLevel, counter());
      const rect = pasted.nodes.find((n) => n.shape === "rect");
      assert.deepEqual(rect, {
        _id: rect!._id,
        type: "shape",
        position: { x: 50, y: 60 },
        parent: null,
        width: 160,
        height: 120,
        color: "blue",
        shape: "rect",
      });
      assert.equal(
        pasted.nodes.find((n) => n.type === "text")?.shape,
        undefined,
      );
      assert.lengthOf(pasted.edges, 1);
    });

    it("labels a frame as it's shown", function () {
      const nodes = [
        node("f", "frame", 0, 0, { label: "Saved", collapsed: true }),
      ];
      const { clip } = copySelection(nodes, [], select(["f"]), () => "Live");
      assert.deepInclude(clip.nodes[0], { label: "Live", collapsed: true });
    });

    it("copies nothing from an empty selection", function () {
      const { clip, cards } = copySelection(
        [node("a", "sticky", 0, 0)],
        [],
        select([]),
      );
      assert.deepEqual(clip, { nodes: [], edges: [] });
      assert.equal(cards, 0);
    });
  });

  describe("pasteClip", function () {
    const nested: BoardClip = {
      nodes: [
        { id: "f", type: "frame", x: 100, y: 100, width: 400, height: 300 },
        {
          id: "s",
          type: "sticky",
          parent: "f",
          x: 124,
          y: 156,
          width: 100,
          height: 80,
          text: "Note",
          color: "blue",
        },
        {
          id: "g",
          type: "frame",
          parent: "f",
          x: 300,
          y: 150,
          width: 150,
          height: 150,
        },
        { id: "t", type: "text", parent: "g", x: 310, y: 210, text: "T" },
        { id: "p", type: "point", x: 700, y: 700 },
        { id: "unused", type: "point", x: 800, y: 800 },
      ],
      edges: [
        { source: "s", target: "p", label: "to", dashed: true },
        { source: "t", target: "s" },
      ],
    };

    it("keeps a frame's contents where they are in it", function () {
      const { nodes } = pasteClip(
        nested,
        { x: 1000, y: 0 },
        topLevel,
        counter(),
      );
      const pasted = new Map(nodes.map((n) => [n.text ?? n.type, n]));
      const frame = nodes[0];
      assert.deepInclude(frame, {
        type: "frame",
        position: { x: 1100, y: 100 },
        parent: null,
      });
      assert.deepInclude(pasted.get("Note"), {
        position: { x: 24, y: 56 },
        parent: frame?._id,
        color: "blue",
      });
      const inner = nodes.find((n) => n.type === "frame" && n !== frame);
      assert.deepInclude(inner, { position: { x: 200, y: 50 } });
      assert.deepInclude(pasted.get("T"), {
        position: { x: 10, y: 60 },
        parent: inner?._id,
      });
    });

    it("gives everything fresh ids and points the lines and parents at them", function () {
      const { nodes, edges } = pasteClip(
        nested,
        { x: 0, y: 0 },
        topLevel,
        counter(),
      );
      const oldIds = new Set(nested.nodes.map((n) => n.id));
      const newIds = new Set(nodes.map((n) => n._id));
      assert.equal(newIds.size, nodes.length);
      nodes.forEach((n) => {
        assert.isFalse(oldIds.has(n._id));
        if (n.parent) assert.isTrue(newIds.has(n.parent));
      });
      assert.lengthOf(edges, 2);
      edges.forEach((e) => {
        assert.isFalse(newIds.has(e._id));
        assert.isTrue(newIds.has(e.source));
        assert.isTrue(newIds.has(e.target));
      });
      const sticky = nodes.find((n) => n.text === "Note");
      const point = nodes.find((n) => n.type === "point");
      assert.deepInclude(edges[0], {
        source: sticky?._id,
        target: point?._id,
        label: "to",
        dashed: true,
      });
    });

    it("leaves out free ends no line uses", function () {
      const { nodes } = pasteClip(nested, { x: 0, y: 0 }, topLevel, counter());
      assert.lengthOf(
        nodes.filter((n) => n.type === "point"),
        1,
      );
    });

    it("gives a stroke's segments one fresh stroke id", function () {
      const points: [number, number, number][] = [[0, 0, 0.5]];
      const { nodes } = pasteClip(
        {
          nodes: [
            {
              id: "k1",
              type: "ink",
              x: 0,
              y: 0,
              width: 10,
              height: 10,
              points,
              strokeWidth: "thin",
              stroke: "s1",
            },
            {
              id: "k2",
              type: "ink",
              x: 10,
              y: 0,
              width: 10,
              height: 10,
              points,
              strokeWidth: "thin",
              stroke: "s1",
            },
          ],
          edges: [],
        },
        { x: 0, y: 0 },
        topLevel,
        counter(),
      );
      const [first, second] = nodes;
      assert.exists(first?.stroke);
      assert.notEqual(first?.stroke, "s1");
      assert.equal(first?.stroke, second?.stroke);
      assert.deepEqual(first?.points, points);
    });

    it("moves a clip so its middle lands on a point, and by a set offset", function () {
      const clip: BoardClip = {
        nodes: [
          { id: "a", type: "sticky", x: 0, y: 0, width: 100, height: 80 },
          { id: "b", type: "sticky", x: 300, y: 0, width: 101, height: 80 },
        ],
        edges: [],
      };
      assert.deepEqual(clipBounds(clip), {
        x: 0,
        y: 0,
        width: 401,
        height: 80,
      });
      const offset = offsetToCentre(clip, { x: 1000, y: 1000 });
      // Whole units, so the layout stays exact
      assert.deepEqual(offset, { x: 800, y: 960 });
      const centred = pasteClip(clip, offset, topLevel, counter()).nodes;
      assert.deepEqual(
        centred.map((n) => n.position),
        [
          { x: 800, y: 960 },
          { x: 1100, y: 960 },
        ],
      );
      const duplicated = pasteClip(clip, { x: 24, y: 24 }, topLevel, counter());
      assert.deepEqual(
        duplicated.nodes.map((n) => n.position),
        [
          { x: 24, y: 24 },
          { x: 324, y: 24 },
        ],
      );
      assert.deepEqual(
        offsetToCentre({ nodes: [], edges: [] }, { x: 5, y: 5 }),
        {
          x: 0,
          y: 0,
        },
      );
    });

    it("counts a free end by its size on the board", function () {
      assert.deepEqual(
        clipBounds({
          nodes: [{ id: "p", type: "point", x: 10, y: 20 }],
          edges: [],
        }),
        { x: 10, y: 20, width: POINT_SIZE, height: POINT_SIZE },
      );
    });

    describe("where things land", function () {
      const frames = [
        { id: "big", rect: { x: 0, y: 0, width: 2000, height: 2000 } },
        { id: "inner", rect: { x: 100, y: 100, width: 400, height: 400 } },
      ];
      const sticky = (x: number, y: number): BoardClip => ({
        nodes: [{ id: "s", type: "sticky", x, y, width: 100, height: 80 }],
        edges: [],
      });
      const landed = (clip: BoardClip, offset?: { x: number; y: number }) =>
        pasteClip(
          clip,
          offset ?? { x: 0, y: 0 },
          smallestAround(frames),
          counter(),
        ).nodes[0];

      it("goes into the frame placeAt picks for its middle, placed in it", function () {
        assert.deepInclude(landed(sticky(150, 150)), {
          parent: "inner",
          position: { x: 50, y: 50 },
        });
        // By where it ends up, not where it was copied from
        assert.deepInclude(landed(sticky(5000, 5000), { x: -4400, y: -4400 }), {
          parent: "big",
          position: { x: 600, y: 600 },
        });
      });

      it("goes at the top level away from every frame", function () {
        assert.deepInclude(landed(sticky(3000, 3000)), {
          parent: null,
          position: { x: 3000, y: 3000 },
        });
      });

      it("keeps a stroke together, by the middle of the whole stroke", function () {
        const points: [number, number, number][] = [[0, 0, 0.5]];
        const segment = (id: string, x: number) => ({
          id,
          type: "ink" as const,
          x,
          y: 200,
          width: 100,
          height: 10,
          points,
          strokeWidth: "thin" as const,
          stroke: "s1",
        });
        // The first segment's own middle is outside the inner frame
        const { nodes } = pasteClip(
          { nodes: [segment("k1", 20), segment("k2", 120)], edges: [] },
          { x: 0, y: 0 },
          smallestAround(frames.filter((f) => f.id === "inner")),
          counter(),
        );
        assert.deepEqual(
          nodes.map((n) => [n.parent, n.position]),
          [
            ["inner", { x: -80, y: 100 }],
            ["inner", { x: 20, y: 100 }],
          ],
        );
      });

      it("leaves what's inside a pasted frame in it", function () {
        const { nodes } = pasteClip(
          {
            nodes: [
              { id: "f", type: "frame", x: 150, y: 150, width: 50, height: 50 },
              { id: "s", type: "sticky", parent: "f", x: 3000, y: 3000 },
            ],
            edges: [],
          },
          { x: 0, y: 0 },
          smallestAround(frames),
          counter(),
        );
        assert.equal(nodes[0]?.parent, "inner");
        assert.equal(nodes[1]?.parent, nodes[0]?._id);
      });
    });
  });

  describe("on the clipboard", function () {
    const clip: BoardClip = {
      nodes: [
        { id: "a", type: "sticky", x: 0, y: 0, width: 100, height: 80 },
        { id: "p", type: "point", x: 300, y: 0 },
      ],
      edges: [{ source: "a", target: "p", pathStyle: "straight" }],
    };

    it("reads back what it writes, as JSON after a marker", function () {
      const text = clipText(clip);
      assert.isTrue(text.startsWith(CLIP_PREFIX));
      assert.deepEqual(JSON.parse(text.slice(CLIP_PREFIX.length)), clip);
      assert.isTrue(looksLikeClip(text));
      assert.deepEqual(readClip(text), clip);
    });

    it("turns down text from anywhere else", function () {
      assert.isUndefined(readClip("hello"));
      assert.isFalse(looksLikeClip("hello"));
      assert.isUndefined(readClip(JSON.stringify(clip)));
      assert.isFalse(looksLikeClip(JSON.stringify(clip)));
    });

    it("turns down a copy that's broken or from another version", function () {
      const bad = (value: unknown) =>
        assert.isUndefined(readClip(`${CLIP_PREFIX}${JSON.stringify(value)}`));
      assert.isUndefined(readClip(`${CLIP_PREFIX}{"nodes": [`));
      assert.isUndefined(readClip(`${CLIP_PREFIX}null`));
      const future = `jolly-roger-whiteboard/2\n${JSON.stringify(clip)}`;
      assert.isTrue(looksLikeClip(future));
      assert.isUndefined(readClip(future));

      bad({ nodes: "a" });
      bad({ ...clip, nodes: [{ ...clip.nodes[0], type: "puzzle" }] });
      bad({ ...clip, nodes: [{ ...clip.nodes[0], x: 1e9 }] });
      bad({ ...clip, nodes: [{ ...clip.nodes[0], color: "mauve" }] });
      bad({
        ...clip,
        nodes: [{ ...clip.nodes[0], text: "x".repeat(MAX_TEXT_LENGTH + 1) }],
      });
      // A line to something that isn't in it, or from a node to itself
      bad({ ...clip, edges: [{ source: "a", target: "missing" }] });
      bad({ ...clip, edges: [{ source: "a", target: "a" }] });
      // Two nodes with one id
      bad({ ...clip, nodes: [clip.nodes[0], clip.nodes[0]], edges: [] });
      // A parent that isn't there, isn't a frame, or goes round in a loop
      bad({ nodes: [{ ...clip.nodes[0], parent: "nope" }], edges: [] });
      bad({
        nodes: [
          { id: "s", type: "sticky", x: 0, y: 0 },
          { id: "t", type: "text", parent: "s", x: 0, y: 0 },
        ],
        edges: [],
      });
      bad({
        nodes: [
          { id: "f", type: "frame", parent: "g", x: 0, y: 0 },
          { id: "g", type: "frame", parent: "f", x: 0, y: 0 },
        ],
        edges: [],
      });
      // Ink with nothing to draw
      bad({ nodes: [{ id: "k", type: "ink", x: 0, y: 0 }], edges: [] });
      // An image with no image or no size, and an image on something else
      const image = { url: "https://example.com/a.png", width: 4, height: 3 };
      bad({
        nodes: [{ id: "i", type: "image", x: 0, y: 0, width: 4, height: 3 }],
        edges: [],
      });
      bad({
        nodes: [{ id: "i", type: "image", x: 0, y: 0, image }],
        edges: [],
      });
      bad({ nodes: [{ ...clip.nodes[0], image }], edges: [] });
      // A shape with no kind, an unknown one or no size, and a kind on
      // something else
      const shape = { id: "s", type: "shape", x: 0, y: 0, width: 4, height: 3 };
      bad({ nodes: [shape], edges: [] });
      bad({ nodes: [{ ...shape, shape: "star" }], edges: [] });
      bad({
        nodes: [{ id: "s", type: "shape", x: 0, y: 0, shape: "rect" }],
        edges: [],
      });
      bad({ nodes: [{ ...clip.nodes[0], shape: "rect" }], edges: [] });
      bad({
        nodes: [
          {
            id: "i",
            type: "image",
            x: 0,
            y: 0,
            width: 4,
            height: 3,
            image: { ...image, width: 0 },
          },
        ],
        edges: [],
      });
    });
  });

  describe("clipFromText", function () {
    const sizes = {
      sticky: { width: 200, height: 160 },
      text: { width: 240, height: 48 },
    };

    it("makes a sticky note of ordinary text, trimmed", function () {
      assert.deepEqual(clipFromText("  Round 1 legend\n", sizes), {
        nodes: [
          {
            id: "pasted",
            type: "sticky",
            x: 0,
            y: 0,
            width: 200,
            height: 160,
            text: "Round 1 legend",
            color: "yellow",
          },
        ],
        edges: [],
      });
    });

    it("makes a text box of a single web address", function () {
      const url = "https://example.com/puzzle?x=1";
      assert.deepInclude(clipFromText(` ${url} `, sizes)?.nodes[0], {
        type: "text",
        text: url,
        width: 240,
        height: 48,
      });
      // Not a web address, or more than one thing
      assert.equal(
        clipFromText("javascript:alert(1)", sizes)?.nodes[0]?.type,
        "sticky",
      );
      assert.equal(
        clipFromText(`${url} and more`, sizes)?.nodes[0]?.type,
        "sticky",
      );
    });

    it("cuts text to the longest a note can be", function () {
      const text = clipFromText("y".repeat(MAX_TEXT_LENGTH + 50), sizes)
        ?.nodes[0]?.text;
      assert.lengthOf(text ?? "", MAX_TEXT_LENGTH);
    });

    it("makes nothing of blank text", function () {
      assert.isUndefined(clipFromText("", sizes));
      assert.isUndefined(clipFromText(" \n\t", sizes));
    });
  });

  describe("images from other hunts", function () {
    const at = (hunt: string) =>
      `https://s3.us-east-1.amazonaws.com/jr-images/${hunt}/puzzle1/upload1`;

    it("reads the hunt an image was uploaded for from its address", function () {
      assert.equal(imageHunt(at("hunt1")), "hunt1");
      assert.isUndefined(imageHunt("not an address"));
      assert.isUndefined(imageHunt("https://example.com/cat.png"));
      assert.isUndefined(imageHunt("data:image/png;base64,iVBORw0KGgo="));
    });

    it("leaves out other hunts' images and the lines to them, and counts them", function () {
      const clip: BoardClip = {
        nodes: [
          {
            id: "ours",
            type: "image",
            x: 0,
            y: 0,
            width: 100,
            height: 50,
            image: { url: at("hunt1"), width: 200, height: 100 },
          },
          {
            id: "theirs",
            type: "image",
            x: 200,
            y: 0,
            width: 100,
            height: 50,
            image: { url: at("hunt2"), width: 200, height: 100 },
          },
          {
            id: "odd",
            type: "image",
            x: 400,
            y: 0,
            width: 100,
            height: 50,
            image: { url: "https://example.com/cat.png", width: 1, height: 1 },
          },
          { id: "note", type: "sticky", x: 0, y: 100, width: 50, height: 50 },
        ],
        edges: [
          { source: "note", target: "ours" },
          { source: "note", target: "theirs" },
        ],
      };
      const { clip: kept, leftOut } = withoutOtherHuntsImages(clip, "hunt1");
      assert.equal(leftOut, 2);
      assert.sameMembers(
        kept.nodes.map((n) => n.id),
        ["ours", "note"],
      );
      assert.deepEqual(kept.edges, [{ source: "note", target: "ours" }]);
    });

    it("hands back a clip with nothing foreign in it as it was", function () {
      const clip: BoardClip = {
        nodes: [{ id: "note", type: "sticky", x: 0, y: 0 }],
        edges: [],
      };
      assert.deepEqual(withoutOtherHuntsImages(clip, "hunt1"), {
        clip,
        leftOut: 0,
      });
    });
  });
});
