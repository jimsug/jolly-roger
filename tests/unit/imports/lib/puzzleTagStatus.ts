import { assert } from "chai";
import {
  isLocationTag,
  puzzleStatusFromTags,
} from "../../../../imports/lib/puzzleTagStatus";

describe("puzzleStatusFromTags", function () {
  it("finds nothing in no tags", function () {
    const status = puzzleStatusFromTags([]);
    assert.isUndefined(status.meta);
    assert.isUndefined(status.priority);
    assert.isFalse(status.stuck);
    assert.deepEqual(status.chips, []);
    assert.equal(status.shownAsStatus.size, 0);
  });

  it("finds nothing in ordinary tags", function () {
    const status = puzzleStatusFromTags(["group:A", "wordplay", undefined]);
    assert.isUndefined(status.meta);
    assert.isUndefined(status.priority);
    assert.isFalse(status.stuck);
    assert.equal(status.shownAsStatus.size, 0);
  });

  it("reads high and low priority, high winning", function () {
    assert.equal(puzzleStatusFromTags(["priority:high"]).priority, "high");
    assert.equal(puzzleStatusFromTags(["priority:low"]).priority, "low");
    const both = puzzleStatusFromTags(["priority:low", "priority:high"]);
    assert.equal(both.priority, "high");
    // The low tag still shows as a chip in the list.
    assert.sameMembers([...both.shownAsStatus], ["priority:high"]);
  });

  it("reads stuck and is:stuck", function () {
    for (const tag of ["stuck", "is:stuck"]) {
      const status = puzzleStatusFromTags([tag]);
      assert.isTrue(status.stuck, tag);
      assert.sameMembers([...status.shownAsStatus], ["stuck", "is:stuck"]);
    }
  });

  it("makes a meta of is:meta or meta-for:", function () {
    assert.equal(puzzleStatusFromTags(["is:meta"]).meta, "meta");
    const metaFor = puzzleStatusFromTags(["meta-for:A"]);
    assert.equal(metaFor.meta, "meta");
    // meta-for: stays a chip in the list; it says which round.
    assert.sameMembers([...metaFor.shownAsStatus], ["is:meta"]);
  });

  it("prefers metameta to meta", function () {
    const status = puzzleStatusFromTags(["is:meta", "is:metameta"]);
    assert.equal(status.meta, "metameta");
    assert.sameMembers([...status.shownAsStatus], ["is:metameta"]);
  });

  it("lists needs: and location tags as chips, in order", function () {
    const status = puzzleStatusFromTags([
      "where:library",
      "group:A",
      "needs:extraction",
      "needs:",
      "loc:atrium",
      "location:basement",
      "loc:",
    ]);
    assert.deepEqual(status.chips, [
      "where:library",
      "needs:extraction",
      "loc:atrium",
      "location:basement",
    ]);
  });

  it("treats location:, loc: and where: as location tags", function () {
    for (const name of ["location:a", "loc:a", "where:a"]) {
      assert.isTrue(isLocationTag(name), name);
    }
    for (const name of ["needs:a", "locale:a", "group:where:a"]) {
      assert.isFalse(isLocationTag(name), name);
    }
  });
});
