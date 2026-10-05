import { assert } from "chai";
import {
  hiddenFeederArrows,
  missingCards,
} from "../../../../imports/lib/whiteboard/notOnBoard";

describe("whiteboard notOnBoard", function () {
  const live = [
    { _id: "p1", title: "Bravo" },
    { _id: "p2", title: "Alpha" },
    { _id: "p3", title: "Charlie" },
  ];

  describe("missingCards", function () {
    it("lists hidden cards and puzzles with no card, by title", function () {
      assert.deepEqual(
        missingCards(live, [
          { _id: "c1", type: "puzzle", puzzle: "p1", hidden: true },
          { _id: "c3", type: "puzzle", puzzle: "p3" },
        ]),
        [
          { id: undefined, puzzle: "p2", title: "Alpha" },
          { id: "c1", puzzle: "p1", title: "Bravo" },
        ],
      );
    });

    it("leaves out a deleted puzzle's hidden card", function () {
      assert.deepEqual(
        missingCards(live.slice(0, 1), [
          { _id: "c1", type: "puzzle", puzzle: "p1" },
          { _id: "gone", type: "puzzle", puzzle: "deleted", hidden: true },
        ]),
        [],
      );
    });

    it("is empty for an empty hunt", function () {
      assert.deepEqual(missingCards([], []), []);
    });
  });

  describe("hiddenFeederArrows", function () {
    it("lists arrows between live puzzles, with their titles", function () {
      assert.deepEqual(
        hiddenFeederArrows(live, [
          { _id: "e1", feeder: "p1", meta: "p2" },
          { _id: "e2", feeder: "deleted", meta: "p2" },
          { _id: "e3", feeder: "p3", meta: "deleted" },
          { _id: "e4" },
        ]),
        [{ id: "e1", feeder: "Bravo", meta: "Alpha" }],
      );
    });
  });
});
