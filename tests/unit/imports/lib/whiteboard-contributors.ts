import { assert } from "chai";
import contributorsByRecency from "../../../../imports/lib/whiteboard/contributors";

const at = (n: number) => new Date(1000 * n);

describe("whiteboard contributorsByRecency", function () {
  it("handles an empty or missing log", function () {
    assert.deepEqual(contributorsByRecency(undefined), []);
    assert.deepEqual(contributorsByRecency([]), []);
  });

  it("returns a single entry as-is", function () {
    assert.deepEqual(contributorsByRecency([{ user: "a", at: at(1) }]), [
      { user: "a", at: at(1) },
    ]);
  });

  it("collapses repeat edits to each person's latest", function () {
    const result = contributorsByRecency([
      { user: "a", at: at(1) },
      { user: "b", at: at(2) },
      { user: "a", at: at(3) },
    ]);
    assert.deepEqual(result, [
      { user: "a", at: at(3) },
      { user: "b", at: at(2) },
    ]);
  });

  it("orders newest first", function () {
    const result = contributorsByRecency([
      { user: "a", at: at(1) },
      { user: "b", at: at(5) },
      { user: "c", at: at(3) },
    ]);
    assert.deepEqual(
      result.map((c) => c.user),
      ["b", "c", "a"],
    );
  });

  it("breaks ties by log order, later first", function () {
    const result = contributorsByRecency([
      { user: "a", at: at(1) },
      { user: "b", at: at(1) },
    ]);
    assert.deepEqual(
      result.map((c) => c.user),
      ["b", "a"],
    );
  });
});
