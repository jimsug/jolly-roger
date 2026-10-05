import { assert } from "chai";
import {
  type Box,
  fitFrame,
  growFrameFor,
  type TidyCard,
  tidyFrame,
} from "../../../../imports/lib/whiteboard/frameTools";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  cardSlot,
  FRAME_HEADER,
  FRAME_PADDING,
} from "../../../../imports/lib/whiteboard/layout";

const box = (
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  locked?: boolean,
): Box => ({ id, x, y, width, height, ...(locked ? { locked } : {}) });

// A card well away from any slot unless `at` says where.
const card = (
  id: string,
  createdAt: number,
  at?: { x: number; y: number },
  locked?: boolean,
): TidyCard => ({
  ...box(
    id,
    at?.x ?? 2000,
    at?.y ?? 2000 + createdAt * 10,
    CARD_WIDTH,
    CARD_HEIGHT,
    locked,
  ),
  createdAt,
});

const changesById = (result: { changes: { id: string }[] }) =>
  new Map(result.changes.map(({ id, ...change }) => [id, change]));

describe("whiteboard frame tools", function () {
  describe("fitFrame", function () {
    it("shrinks a frame round what's in it and keeps it all still on the board", function () {
      const frame = box("f", 1000, 2000, 1000, 800);
      const result = fitFrame(frame, [
        box("a", 100, 200, CARD_WIDTH, CARD_HEIGHT),
        box("b", 400, 300, 100, 80),
      ]);
      assert.isEmpty(result.locked);
      const changes = changesById(result);
      const fitted = changes.get("f") as {
        position: { x: number; y: number };
        width: number;
        height: number;
      };
      assert.deepEqual(fitted, {
        position: { x: 1076, y: 2144 },
        width: 500 - 100 + FRAME_PADDING * 2,
        height: 380 - 200 + FRAME_HEADER + FRAME_PADDING,
      });
      assert.deepEqual(changes.get("a"), {
        position: { x: FRAME_PADDING, y: FRAME_HEADER },
      });
      assert.deepEqual(changes.get("b"), { position: { x: 324, y: 156 } });
      // Where they were on the board
      assert.equal(fitted.position.x + FRAME_PADDING, 1000 + 100);
      assert.equal(fitted.position.y + 156, 2000 + 300);
    });

    it("grows a frame whose contents overhang it", function () {
      const result = fitFrame(box("f", 0, 0, 200, 150), [
        box("a", FRAME_PADDING, FRAME_HEADER, 400, 300),
      ]);
      assert.deepEqual(result.changes, [
        {
          id: "f",
          width: 400 + FRAME_PADDING * 2,
          height: 300 + FRAME_HEADER + FRAME_PADDING,
        },
      ]);
    });

    it("changes nothing on a frame that already fits, or has nothing in it", function () {
      const fitted = box(
        "f",
        50,
        50,
        CARD_WIDTH + FRAME_PADDING * 2,
        CARD_HEIGHT + FRAME_HEADER + FRAME_PADDING,
      );
      const child = box("a", FRAME_PADDING, FRAME_HEADER, CARD_WIDTH, 112);
      assert.deepEqual(fitFrame(fitted, [child]), { changes: [], locked: [] });
      assert.deepEqual(fitFrame(box("f", 0, 0, 500, 500), []), {
        changes: [],
        locked: [],
      });
    });

    it("keeps to the smallest size it's given", function () {
      const result = fitFrame(
        box("f", 0, 0, 500, 500),
        [box("p", FRAME_PADDING, FRAME_HEADER, 12, 12)],
        [],
        { width: CARD_HEIGHT, height: CARD_HEIGHT },
      );
      assert.deepEqual(result.changes, [
        { id: "f", width: CARD_HEIGHT, height: CARD_HEIGHT },
      ]);
    });

    it("lists a locked frame, and locked contents only when they'd move", function () {
      const fitted = box("f", 0, 0, 288, 192, true);
      const child = box("a", FRAME_PADDING, FRAME_HEADER, CARD_WIDTH, 112);
      assert.deepEqual(fitFrame(fitted, [child]).locked, ["f"]);

      // Shrinking from the right and bottom moves nothing inside
      const lockedStill = box("a", FRAME_PADDING, FRAME_HEADER, 100, 100, true);
      assert.isEmpty(fitFrame(box("g", 0, 0, 900, 900), [lockedStill]).locked);

      const lockedMoving = box("a", 300, 300, 100, 100, true);
      assert.deepEqual(
        fitFrame(box("g", 0, 0, 900, 900), [lockedMoving]).locked,
        ["a"],
      );
    });

    it("grows the frames around it that it would overhang, keeping their contents still", function () {
      const inner = box("f", FRAME_PADDING, FRAME_HEADER, 200, 150);
      const sibling = box("s", 300, 100, 100, 80);
      const parent = box("p", 100, 100, 600, 400);
      const grandparent = box("g", 0, 0, 2000, 2000);
      const result = fitFrame(
        inner,
        // Sticking out of the frame's left edge, and up into its header
        [box("c", -40, 20, 100, 50)],
        [
          { frame: parent, children: [inner, sibling] },
          { frame: grandparent, children: [parent] },
        ],
      );
      assert.isEmpty(result.locked);
      const changes = changesById(result);
      // The frame grows up and left; its origin moves by (-64, -36) and its
      // parent's moves the same, so it stays where it was in its parent
      assert.deepEqual(changes.get("f"), {
        width: 100 + FRAME_PADDING * 2,
        height: 50 + FRAME_HEADER + FRAME_PADDING,
      });
      assert.deepEqual(changes.get("c"), {
        position: { x: FRAME_PADDING, y: FRAME_HEADER },
      });
      assert.deepEqual(changes.get("p"), {
        position: { x: 36, y: 64 },
        width: 664,
        height: 436,
      });
      assert.deepEqual(changes.get("s"), { position: { x: 364, y: 136 } });
      // The grandparent already has room
      assert.isFalse(changes.has("g"));
      // c is where it was on the board: 100 + 24 - 40 across, 100 + 56 + 20
      // down
      assert.equal(36 + FRAME_PADDING + FRAME_PADDING, 100 + 24 - 40);
      assert.equal(64 + FRAME_HEADER + FRAME_HEADER, 100 + 56 + 20);
    });

    it("lists a locked frame around it that would have to grow", function () {
      const inner = box("f", FRAME_PADDING, FRAME_HEADER, 200, 150);
      const parent = box("p", 0, 0, 300, 300, true);
      const result = fitFrame(
        inner,
        [box("c", FRAME_PADDING, FRAME_HEADER, 500, 100)],
        [{ frame: parent, children: [inner] }],
      );
      assert.deepEqual(result.locked, ["p"]);
    });
  });

  describe("growFrameFor", function () {
    it("grows a frame on the right or bottom for what overhangs it", function () {
      const frame = box("f", 0, 0, 400, 300);
      assert.deepEqual(growFrameFor(frame, [box("s", 340, 100, 100, 80)]), {
        changes: [{ id: "f", width: 440 + FRAME_PADDING }],
        locked: [],
      });
      assert.deepEqual(
        growFrameFor(frame, [box("s", 100, 250, 100, 80)]).changes,
        [{ id: "f", height: 330 + FRAME_PADDING }],
      );
    });

    it("leaves a frame alone when nothing overhangs, or only on the left or top", function () {
      const frame = box("f", 0, 0, 400, 300);
      assert.isEmpty(
        growFrameFor(frame, [box("s", 290, 200, 100, 80)]).changes,
      );
      assert.isEmpty(
        growFrameFor(frame, [box("s", -50, -20, 100, 80)]).changes,
      );
      assert.isEmpty(growFrameFor(frame, []).changes);
    });

    it("grows the frames around it too, and lists any that are locked", function () {
      const frame = box("f", FRAME_PADDING, FRAME_HEADER, 400, 300);
      const around = (locked?: boolean) => [
        { frame: box("p", 0, 0, 450, 400, locked), children: [frame] },
      ];
      const result = growFrameFor(
        frame,
        [box("s", 340, 100, 100, 80)],
        around(),
      );
      assert.deepEqual(result.changes, [
        { id: "f", width: 464 },
        { id: "p", width: FRAME_PADDING + 464 + FRAME_PADDING },
      ]);
      assert.deepEqual(
        growFrameFor(frame, [box("s", 340, 100, 100, 80)], around(true)).locked,
        ["p"],
      );
      assert.deepEqual(
        growFrameFor({ ...frame, locked: true }, [box("s", 340, 100, 100, 80)])
          .locked,
        ["f"],
      );
    });
  });

  describe("tidyFrame", function () {
    const ROW_Y = (row: number) => cardSlot(row * 4).y;

    it("puts metas on their own row, then the rest by creation, four to a row", function () {
      const frame = box("f", 500, 500, 400, 300);
      const result = tidyFrame(
        frame,
        [
          card("e", 6),
          card("a", 1),
          card("m", 5),
          card("c", 3),
          card("b", 2),
          card("d", 4),
        ],
        new Set(["m"]),
      );
      assert.isEmpty(result.locked);
      const changes = changesById(result);
      assert.deepEqual(changes.get("m"), { position: cardSlot(0) });
      assert.deepEqual(changes.get("a"), { position: cardSlot(4) });
      assert.deepEqual(changes.get("b"), { position: cardSlot(5) });
      assert.deepEqual(changes.get("c"), { position: cardSlot(6) });
      assert.deepEqual(changes.get("d"), { position: cardSlot(7) });
      assert.deepEqual(changes.get("e"), { position: cardSlot(8) });
      assert.equal(cardSlot(4).y, ROW_Y(1));
      // Grown to take them, and not moved
      assert.deepEqual(changes.get("f"), {
        width: cardSlot(7).x + CARD_WIDTH + FRAME_PADDING,
        height: cardSlot(8).y + CARD_HEIGHT + FRAME_PADDING,
      });
    });

    it("starts the rest on the first row without a card when there's no meta", function () {
      const result = tidyFrame(
        box("f", 0, 0, 2000, 2000),
        [card("b", 2), card("a", 1)],
        new Set(),
      );
      const changes = changesById(result);
      assert.deepEqual(changes.get("a"), { position: cardSlot(0) });
      assert.deepEqual(changes.get("b"), { position: cardSlot(1) });
      // Big enough already
      assert.isFalse(changes.has("f"));
    });

    it("goes round notes and locked cards, and leaves them and cards already in place alone", function () {
      const result = tidyFrame(
        box("f", 0, 0, 2000, 2000),
        [
          card("a", 1, cardSlot(0)),
          card("b", 2),
          card("locked", 0, cardSlot(2), true),
          card("c", 3),
        ],
        new Set(),
        [box("note", cardSlot(1).x + 10, cardSlot(1).y + 10, 100, 80)],
      );
      assert.isEmpty(result.locked);
      const changes = changesById(result);
      assert.isFalse(changes.has("a"));
      assert.isFalse(changes.has("locked"));
      assert.isFalse(changes.has("note"));
      assert.deepEqual(changes.get("b"), { position: cardSlot(3) });
      assert.deepEqual(changes.get("c"), { position: cardSlot(4) });
    });

    it("lays cards over a shape, which stays put", function () {
      const result = tidyFrame(
        box("f", 0, 0, 2000, 2000),
        [card("a", 1), card("b", 2)],
        new Set(),
        [
          {
            ...box("shape", cardSlot(0).x - 10, cardSlot(0).y - 10, 600, 300),
            background: true,
          },
        ],
      );
      const changes = changesById(result);
      assert.deepEqual(changes.get("a"), { position: cardSlot(0) });
      assert.deepEqual(changes.get("b"), { position: cardSlot(1) });
      assert.isFalse(changes.has("shape"));
    });

    it("keeps feeders off a row of metas, a locked meta's included", function () {
      const result = tidyFrame(
        box("f", 0, 0, 2000, 2000),
        [card("m1", 1, cardSlot(0), true), card("m2", 2), card("a", 3)],
        new Set(["m1", "m2"]),
      );
      const changes = changesById(result);
      assert.deepEqual(changes.get("m2"), { position: cardSlot(1) });
      assert.deepEqual(changes.get("a"), { position: cardSlot(4) });
    });

    it("lists a locked frame only when it, or a locked frame round it, would have to grow", function () {
      const big = tidyFrame(
        box("f", 0, 0, 2000, 2000, true),
        [card("a", 1)],
        new Set(),
      );
      assert.isEmpty(big.locked);
      assert.deepEqual(changesById(big).get("a"), { position: cardSlot(0) });
      assert.deepEqual(
        tidyFrame(box("f", 0, 0, 100, 100, true), [card("a", 1)], new Set())
          .locked,
        ["f"],
      );
      const frame = box("f", FRAME_PADDING, FRAME_HEADER, 100, 100);
      const parent = box("p", 0, 0, 200, 200, true);
      const result = tidyFrame(
        frame,
        [card("a", 1)],
        new Set(),
        [],
        [{ frame: parent, children: [frame] }],
      );
      assert.deepEqual(result.locked, ["p"]);
    });
  });
});
