import { assert } from "chai";
import type { InkPoint } from "../../../../imports/lib/whiteboard/ink";
import {
  distanceToInk,
  InkSegmenter,
  inkBounds,
  inkPath,
  relativeTo,
  SEGMENT_OVERLAP,
  segmentStroke,
  simulatedPressure,
} from "../../../../imports/lib/whiteboard/ink";

const line = (n: number): InkPoint[] =>
  Array.from({ length: n }, (_, i) => [i, 0, 0.5] as InkPoint);

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
});
