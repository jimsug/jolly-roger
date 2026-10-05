import { assert } from "chai";
import type { InkPoint } from "../../../../imports/lib/whiteboard/ink";
import {
  distanceToInk,
  filledIn,
  INK_SIMPLIFY_TOLERANCE,
  InkSegmenter,
  inkBounds,
  inkPath,
  inkPointCount,
  MAX_FILLED_POINTS,
  relativeTo,
  SEGMENT_OVERLAP,
  simplifyInk,
  simulatedPressure,
} from "../../../../imports/lib/whiteboard/ink";
import { MAX_COORDINATE } from "../../../../imports/lib/whiteboard/limits";

const line = (n: number): InkPoint[] =>
  Array.from({ length: n }, (_, i) => [i, 0, 0.5] as InkPoint);

// Feeds a whole stroke through the segmenter, as drawing does one sample at a
// time.
const segmentStroke = (points: InkPoint[]): InkPoint[][] => {
  const segmenter = new InkSegmenter();
  const segments: InkPoint[][] = [];
  points.forEach((p) => {
    const full = segmenter.push(p);
    if (full) segments.push(full);
  });
  const rest = segmenter.finish(segments.length > 0);
  if (rest) segments.push(rest);
  return segments;
};

describe("whiteboard ink segmenting", function () {
  it("keeps exactly 500 points in one segment", function () {
    const segments = segmentStroke(line(500));
    assert.lengthOf(segments, 1);
    assert.lengthOf(segments[0]!, 500);
  });

  it("splits 501 points into two segments", function () {
    const segments = segmentStroke(line(501));
    assert.lengthOf(segments, 2);
    assert.lengthOf(segments[0]!, 500);
    assert.lengthOf(segments[1]!, SEGMENT_OVERLAP + 1);
  });

  it("overlaps each segment with the end of the previous one", function () {
    const [first, second] = segmentStroke(line(600));
    assert.deepEqual(
      second!.slice(0, SEGMENT_OVERLAP),
      first!.slice(-SEGMENT_OVERLAP),
    );
  });

  it("splits a 10,000 point stroke into 21 segments that join back up", function () {
    const points = line(10_000);
    const segments = segmentStroke(points);
    assert.lengthOf(segments, 21);
    const rejoined = segments.flatMap((s, i) =>
      i === 0 ? s : s.slice(SEGMENT_OVERLAP),
    );
    assert.deepEqual(rejoined, points);
  });

  it("drops samples too close to the last one", function () {
    const segmenter = new InkSegmenter();
    segmenter.push([0, 0, 0.5]);
    segmenter.push([0.1, 0.1, 0.5]);
    segmenter.push([5, 5, 0.5]);
    assert.lengthOf(segmenter.points, 2);
  });

  it("returns nothing for an empty stroke", function () {
    assert.deepEqual(segmentStroke([]), []);
  });

  it("keeps a single-point dot", function () {
    const segments = segmentStroke([[3, 4, 0.5]]);
    assert.deepEqual(segments, [[[3, 4, 0.5]]]);
  });
});

describe("whiteboard ink geometry", function () {
  it("simulates pressure deterministically", function () {
    const previous: InkPoint = [0, 0, 0.5];
    const a = simulatedPressure(previous, 10, 0, 6);
    const b = simulatedPressure(previous, 10, 0, 6);
    assert.equal(a, b);
    assert.isAtLeast(a, 0);
    assert.isAtMost(a, 1);
    assert.equal(simulatedPressure(undefined, 0, 0, 6), 0.5);
  });

  it("pads bounds by the stroke size and round-trips relative points", function () {
    const points: InkPoint[] = [
      [10, 20, 0.5],
      [30, 50, 0.5],
    ];
    const bounds = inkBounds(points, 6);
    assert.deepEqual(bounds, { x: 4, y: 14, width: 32, height: 42 });
    const relative = relativeTo(points, bounds);
    assert.deepEqual(relative, [
      [6, 6, 0.5],
      [26, 36, 0.5],
    ]);
  });

  it("draws a closed path", function () {
    const path = inkPath(line(20), "medium", true);
    assert.match(path, /^M.*Z$/);
    assert.equal(inkPath([], "medium", true), "");
  });

  it("measures distance to the nearest sample", function () {
    assert.equal(distanceToInk(line(10), 4, 3), 3);
  });

  it("measures distance between samples too", function () {
    const sparse: InkPoint[] = [
      [0, 0, 0.5],
      [100, 0, 0.5],
    ];
    assert.equal(distanceToInk(sparse, 50, 4), 4);
    assert.equal(distanceToInk(sparse, 110, 0), 10);
    assert.equal(distanceToInk([[3, 4, 0.5]], 0, 0), 5);
    assert.equal(distanceToInk([], 0, 0), Number.POSITIVE_INFINITY);
  });

  it("draws a two-point stroke as a whole line", function () {
    const path = inkPath(
      [
        [0, 0, 0.5],
        [200, 0, 0.5],
      ],
      "medium",
      true,
    );
    const xs = [...path.matchAll(/(-?\d+\.\d+),/g)].map((m) => Number(m[1]));
    assert.isAbove(Math.max(...xs), 195);
    assert.isBelow(Math.min(...xs), 5);
  });

  it("fills in gaps every few units", function () {
    const filled = filledIn([
      [0, 0, 0],
      [40, 0, 1],
    ]);
    assert.lengthOf(filled, 11);
    assert.deepEqual(filled[5], [20, 0, 0.5]);
    assert.deepEqual(filledIn([]), []);
    assert.deepEqual(filledIn([[1, 2, 0.5]]), [[1, 2, 0.5]]);
  });

  it("fills in no more than its cap, however far apart the samples", function () {
    const far = MAX_COORDINATE;
    const zigzag = Array.from(
      { length: 500 },
      (_, i): InkPoint => (i % 2 === 0 ? [-far, -far, 0.5] : [far, far, 0.5]),
    );
    const filled = filledIn(zigzag);
    assert.isAtMost(filled.length, zigzag.length * 2 + MAX_FILLED_POINTS);
    const started = Date.now();
    assert.match(
      inkPath(
        [
          [-far, -far, 0.5],
          [far, far, 0.5],
        ],
        "medium",
        true,
      ),
      /^M.*Z$/,
    );
    assert.isBelow(Date.now() - started, 1000);
  });
});

describe("whiteboard ink simplifying", function () {
  // Distance from (x, y) to the nearest part of a stroke
  const offBy = (points: InkPoint[], [x, y]: InkPoint) =>
    distanceToInk(points, x, y);

  it("collapses a straight line to its two ends", function () {
    const points = line(100);
    assert.deepEqual(simplifyInk(points), [points[0]!, points[99]!]);
  });

  it("keeps a corner", function () {
    const points: InkPoint[] = [
      ...Array.from({ length: 10 }, (_, i): InkPoint => [i * 5, 0, 0.5]),
      ...Array.from({ length: 10 }, (_, i): InkPoint => [50, i * 5, 0.5]),
    ];
    assert.deepEqual(simplifyInk(points), [
      [0, 0, 0.5],
      [50, 0, 0.5],
      [50, 45, 0.5],
    ]);
  });

  it("keeps the turn of a stroke that doubles back", function () {
    const points: InkPoint[] = [
      [0, 0, 0.5],
      [50, 0, 0.5],
      [100, 0, 0.5],
      [60, 0, 0.5],
      [20, 0, 0.5],
    ];
    assert.deepEqual(simplifyInk(points), [
      [0, 0, 0.5],
      [100, 0, 0.5],
      [20, 0, 0.5],
    ]);
  });

  it("drops only what's within the tolerance of what's kept", function () {
    // A wobble of 0.4 goes, one of 0.6 stays
    const small: InkPoint[] = [
      [0, 0, 0.5],
      [10, 0.4, 0.5],
      [20, 0, 0.5],
    ];
    assert.lengthOf(simplifyInk(small), 2);
    const large: InkPoint[] = [
      [0, 0, 0.5],
      [10, 0.6, 0.5],
      [20, 0, 0.5],
    ];
    assert.lengthOf(simplifyInk(large), 3);

    const wave = Array.from(
      { length: 200 },
      (_, i): InkPoint => [i, Math.round(Math.sin(i / 8) * 300) / 10, 0.5],
    );
    const simplified = simplifyInk(wave);
    assert.isBelow(simplified.length, wave.length / 2);
    wave.forEach((p) => {
      assert.isAtMost(offBy(simplified, p), INK_SIMPLIFY_TOLERANCE);
    });
    // A wider tolerance drops more
    assert.isBelow(simplifyInk(wave, 3).length, simplified.length);
  });

  it("carries each kept point's own pressure", function () {
    const points: InkPoint[] = [
      [0, 0, 0.1],
      [10, 0, 0.9],
      [20, 0, 0.3],
      [20, 10, 0.7],
    ];
    assert.deepEqual(simplifyInk(points), [
      [0, 0, 0.1],
      [20, 0, 0.3],
      [20, 10, 0.7],
    ]);
  });

  it("never goes below two points, and leaves one or two alone", function () {
    const still = Array.from({ length: 50 }, (): InkPoint => [5, 5, 0.5]);
    assert.lengthOf(simplifyInk(still), 2);
    const two: InkPoint[] = [
      [0, 0, 0.5],
      [0.1, 0, 0.5],
    ];
    assert.deepEqual(simplifyInk(two), two);
    assert.deepEqual(simplifyInk([[1, 2, 0.5]]), [[1, 2, 0.5]]);
    assert.deepEqual(simplifyInk([]), []);
  });

  it("counts the ink points among nodes", function () {
    assert.equal(
      inkPointCount([
        { type: "ink", points: line(3) },
        { type: "sticky" },
        { type: "ink", points: line(4) },
        { type: "ink" },
      ]),
      7,
    );
    assert.equal(inkPointCount([]), 0);
  });
});
