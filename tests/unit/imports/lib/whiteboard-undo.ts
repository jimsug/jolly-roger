import { assert } from "chai";
import type {
  Stamps,
  UndoEntry,
  UndoStacks,
} from "../../../../imports/lib/whiteboard/undo";
import {
  carryForward,
  changedAnything,
  emptyStacks,
  isStale,
  MAX_UNDO_ENTRIES,
  pushEdit,
  pushRedone,
  pushUndone,
  takeRedo,
  takeUndo,
} from "../../../../imports/lib/whiteboard/undo";

// Writes are just labels here: "move a", "unmove a" and so on.
const entry = (
  name: string,
  stamps: [string, number | null][] = [[`node:${name}`, 1]],
  group?: string,
): UndoEntry<string> => ({
  forward: [`do ${name}`],
  inverse: [`undo ${name}`],
  stamps: new Map(stamps),
  group,
});

const names = (entries: UndoEntry<string>[]) =>
  entries.map((e) => e.forward.join(" + "));

// Undoes the top entry, as the board would once its inverse is saved.
const undoTop = (stacks: UndoStacks<string>, after: Stamps) => {
  const taken = takeUndo(stacks)!;
  return {
    entry: taken.entry,
    stacks: pushUndone(taken.stacks, taken.entry, after),
  };
};

describe("whiteboard undo", function () {
  it("undoes the newest edit first", function () {
    let stacks = emptyStacks<string>();
    stacks = pushEdit(stacks, entry("a"));
    stacks = pushEdit(stacks, entry("b"));
    stacks = pushEdit(stacks, entry("c"));

    const order: string[] = [];
    for (let taken = takeUndo(stacks); taken; taken = takeUndo(stacks)) {
      order.push(taken.entry.inverse[0]!);
      stacks = taken.stacks;
    }
    assert.deepEqual(order, ["undo c", "undo b", "undo a"]);
    assert.isUndefined(takeUndo(stacks));
  });

  it("redoes what was undone, newest undo first, and can undo it again", function () {
    let stacks = emptyStacks<string>();
    stacks = pushEdit(stacks, entry("a"));
    stacks = pushEdit(stacks, entry("b"));
    stacks = undoTop(stacks, new Map([["node:b", 2]])).stacks;
    stacks = undoTop(stacks, new Map([["node:a", 2]])).stacks;
    assert.deepEqual(names(stacks.undo), []);
    assert.deepEqual(names(stacks.redo), ["do b", "do a"]);

    const redone = takeRedo(stacks)!;
    assert.deepEqual(redone.entry.forward, ["do a"]);
    // What it was undone to is what a redo checks against
    assert.deepEqual([...redone.entry.stamps], [["node:a", 2]]);
    stacks = pushRedone(redone.stacks, redone.entry, new Map([["node:a", 3]]));
    assert.deepEqual(names(stacks.undo), ["do a"]);
    assert.deepEqual(names(stacks.redo), ["do b"]);
    assert.deepEqual([...stacks.undo[0]!.stamps], [["node:a", 3]]);
  });

  it("clears what can be redone when a new edit is made", function () {
    let stacks = emptyStacks<string>();
    stacks = pushEdit(stacks, entry("a"));
    stacks = undoTop(stacks, new Map([["node:a", 2]])).stacks;
    assert.lengthOf(stacks.redo, 1);

    stacks = pushEdit(stacks, entry("b"));
    assert.deepEqual(names(stacks.undo), ["do b"]);
    assert.isEmpty(stacks.redo);
    assert.isUndefined(takeRedo(stacks));
  });

  it("keeps only the newest edits past the cap", function () {
    let stacks = emptyStacks<string>();
    for (let i = 0; i < MAX_UNDO_ENTRIES + 5; i++) {
      stacks = pushEdit(stacks, entry(`${i}`));
    }
    assert.lengthOf(stacks.undo, MAX_UNDO_ENTRIES);
    assert.equal(stacks.undo[0]!.forward[0], "do 5");
    assert.equal(stacks.undo.at(-1)!.forward[0], `do ${MAX_UNDO_ENTRIES + 4}`);

    // Undoing all of them can fill the redo stack no further than the cap
    for (let taken = takeUndo(stacks); taken; taken = takeUndo(stacks)) {
      stacks = pushUndone(taken.stacks, taken.entry, taken.entry.stamps);
    }
    assert.lengthOf(stacks.redo, MAX_UNDO_ENTRIES);
  });

  it("joins back-to-back edits in one group into one entry", function () {
    let stacks = emptyStacks<string>();
    stacks = pushEdit(stacks, entry("first", [["node:first", 1]], "stroke:s"));
    stacks = pushEdit(
      stacks,
      entry("second", [["node:second", 2]], "stroke:s"),
    );
    stacks = pushEdit(stacks, entry("other", [["node:other", 3]], "stroke:t"));

    assert.lengthOf(stacks.undo, 2);
    const stroke = stacks.undo[0]!;
    assert.deepEqual(stroke.forward, ["do first", "do second"]);
    // Undone in reverse
    assert.deepEqual(stroke.inverse, ["undo second", "undo first"]);
    assert.deepEqual(
      [...stroke.stamps],
      [
        ["node:first", 1],
        ["node:second", 2],
      ],
    );
  });

  describe("isStale", function () {
    const now = (stamps: Record<string, number>) => (key: string) =>
      stamps[key];

    it("is fresh while nothing it touched has changed", function () {
      assert.isFalse(isStale(new Map([["node:a", 5]]), now({ "node:a": 5 })));
      // Older than recorded can only be the same edit seen late
      assert.isFalse(isStale(new Map([["node:a", 5]]), now({ "node:a": 4 })));
    });

    it("is stale once a document has a newer updatedAt", function () {
      assert.isTrue(isStale(new Map([["node:a", 5]]), now({ "node:a": 6 })));
    });

    it("is stale once a document has gone", function () {
      assert.isTrue(isStale(new Map([["node:a", 5]]), now({})));
    });

    it("doesn't count a document that didn't exist when it was recorded", function () {
      assert.isFalse(isStale(new Map([["node:a", null]]), now({})));
      assert.isFalse(
        isStale(new Map([["node:a", null]]), now({ "node:a": 9 })),
      );
    });

    it("checks every document an entry spans", function () {
      const stamps = new Map<string, number | null>([
        ["node:a", 5],
        ["node:b", 7],
        ["edge:c", 3],
      ]);
      assert.isFalse(
        isStale(stamps, now({ "node:a": 5, "node:b": 7, "edge:c": 3 })),
      );
      assert.isTrue(
        isStale(stamps, now({ "node:a": 5, "node:b": 7, "edge:c": 4 })),
      );
      assert.isTrue(isStale(stamps, now({ "node:a": 5, "edge:c": 3 })));
    });
  });

  describe("carryForward", function () {
    it("moves entries that recorded a document as the write found it", function () {
      let stacks = emptyStacks<string>();
      stacks = pushEdit(stacks, entry("a", [["node:a", 5]]));
      stacks = pushEdit(
        stacks,
        entry("b", [
          ["node:a", 3],
          ["node:b", 1],
        ]),
      );
      stacks = carryForward(
        stacks,
        new Map([["node:a", 5]]),
        new Map([["node:a", 8]]),
      );
      // The viewer's own edit since doesn't make the first look stale
      assert.deepEqual([...stacks.undo[0]!.stamps], [["node:a", 8]]);
      // One that saw something older already was, and still is
      assert.deepEqual(
        [...stacks.undo[1]!.stamps],
        [
          ["node:a", 3],
          ["node:b", 1],
        ],
      );
    });

    it("carries a document the write brought back or took away", function () {
      let stacks = emptyStacks<string>();
      stacks = pushEdit(stacks, entry("move", [["node:a", 5]]));
      // Deleted: entries that knew it at 5 now know it as gone
      stacks = carryForward(
        stacks,
        new Map([["node:a", 5]]),
        new Map([["node:a", null]]),
      );
      assert.deepEqual([...stacks.undo[0]!.stamps], [["node:a", null]]);
      // Put back by an undo: they pick up its new stamp
      stacks = carryForward(
        stacks,
        new Map([["node:a", null]]),
        new Map([["node:a", 9]]),
      );
      assert.deepEqual([...stacks.undo[0]!.stamps], [["node:a", 9]]);
    });

    it("leaves the stacks alone when nothing changed", function () {
      const stacks = pushEdit(emptyStacks<string>(), entry("a"));
      assert.strictEqual(
        carryForward(
          stacks,
          new Map([["node:a", 1]]),
          new Map([["node:a", 1]]),
        ),
        stacks,
      );
    });
  });

  it("tells a write that changed something from one that didn't", function () {
    assert.isFalse(
      changedAnything(new Map([["node:a", 1]]), new Map([["node:a", 1]])),
    );
    assert.isTrue(
      changedAnything(new Map([["node:a", 1]]), new Map([["node:a", 2]])),
    );
    assert.isTrue(
      changedAnything(new Map([["node:a", null]]), new Map([["node:a", 2]])),
    );
    assert.isFalse(changedAnything(new Map(), new Map()));
  });
});
