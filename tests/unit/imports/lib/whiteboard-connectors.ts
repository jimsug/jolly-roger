import { assert } from "chai";
import {
  attachHit,
  compareAttachHits,
  contains,
  snapAngle,
} from "../../../../imports/lib/whiteboard/connectors";

describe("whiteboard snapAngle", function () {
  const origin = { x: 10, y: 10 };

  it("snaps to the nearest 15 degrees and keeps the length", function () {
    const point = { x: 110, y: 18 }; // about 4.6 degrees
    const snapped = snapAngle(origin, point);
    assert.closeTo(snapped.y, 10, 1e-9);
    assert.closeTo(
      Math.hypot(snapped.x - 10, snapped.y - 10),
      Math.hypot(100, 8),
      1e-9,
    );
  });

  it("snaps to 45 degrees", function () {
    const snapped = snapAngle(origin, { x: 110, y: 102 });
    assert.closeTo(snapped.x - 10, snapped.y - 10, 1e-9);
  });

  it("leaves a zero-length line alone", function () {
    assert.deepEqual(snapAngle(origin, origin), origin);
  });
});

describe("whiteboard contains", function () {
  const box = { x: 0, y: 0, width: 10, height: 10 };

  it("includes the edges and excludes anything outside", function () {
    assert.isTrue(contains(box, { x: 5, y: 5 }));
    assert.isTrue(contains(box, { x: 0, y: 10 }));
    assert.isFalse(contains(box, { x: -1, y: 5 }));
    assert.isFalse(contains(box, { x: 5, y: 11 }));
  });
});

describe("whiteboard attachHit", function () {
  const box = { x: 100, y: 100, width: 200, height: 100 };

  it("is on anything the point is inside, edges included", function () {
    assert.deepEqual(attachHit(box, { x: 150, y: 150 }, 8, false), {
      inside: true,
      distance: 0,
    });
    assert.deepEqual(attachHit(box, { x: 100, y: 200 }, 8, false), {
      inside: true,
      distance: 0,
    });
  });

  it("catches a near miss just outside, but not beyond the margin", function () {
    assert.deepEqual(attachHit(box, { x: 96, y: 150 }, 8, false), {
      inside: false,
      distance: 4,
    });
    assert.closeTo(
      attachHit(box, { x: 305, y: 205 }, 8, false)!.distance,
      Math.hypot(5, 5),
      1e-9,
    );
    assert.isUndefined(attachHit(box, { x: 91, y: 150 }, 8, false));
    assert.isUndefined(attachHit(box, { x: 99, y: 150 }, 0, false));
  });

  it("only takes a frame by its border, from either side", function () {
    assert.isUndefined(attachHit(box, { x: 200, y: 150 }, 8, true));
    assert.deepEqual(attachHit(box, { x: 105, y: 150 }, 8, true), {
      inside: false,
      distance: 5,
    });
    assert.deepEqual(attachHit(box, { x: 95, y: 150 }, 8, true), {
      inside: false,
      distance: 5,
    });
    assert.deepEqual(attachHit(box, { x: 200, y: 200 }, 8, true), {
      inside: false,
      distance: 0,
    });
  });

  it("lets a near miss on something in a frame beat the frame's border", function () {
    const frameHit = attachHit(box, { x: 106, y: 150 }, 8, true)!;
    const cardHit = attachHit(
      { x: 109, y: 120, width: 50, height: 50 },
      { x: 106, y: 150 },
      8,
      false,
    )!;
    assert.isBelow(
      compareAttachHits(
        { ...cardHit, z: 1, order: 1 },
        { ...frameHit, z: 0, order: 0 },
      ),
      0,
    );
  });
});

describe("whiteboard compareAttachHits", function () {
  const hit = (inside: boolean, distance: number, z: number, order = 0) => ({
    inside,
    distance,
    z,
    order,
  });

  it("prefers something the point is on over a near miss", function () {
    assert.isBelow(compareAttachHits(hit(true, 0, 0), hit(false, 1, 9)), 0);
    assert.isAbove(compareAttachHits(hit(false, 1, 9), hit(true, 0, 0)), 0);
  });

  it("prefers the topmost of things the point is on", function () {
    assert.isBelow(compareAttachHits(hit(true, 0, 5), hit(true, 0, 1)), 0);
    assert.isBelow(
      compareAttachHits(hit(true, 0, 1, 7), hit(true, 0, 1, 3)),
      0,
    );
  });

  it("prefers the closest near miss, then the topmost", function () {
    assert.isBelow(compareAttachHits(hit(false, 2, 0), hit(false, 6, 9)), 0);
    assert.isBelow(compareAttachHits(hit(false, 2, 3), hit(false, 2, 1)), 0);
  });
});
