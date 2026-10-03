import { assert } from "chai";
import { parseInitialTags } from "../../../../imports/lib/defaultHuntTags";

describe("parseInitialTags", function () {
  it("returns nothing for an empty field", function () {
    assert.deepEqual(parseInitialTags(""), []);
    assert.deepEqual(parseInitialTags("  , ,"), []);
  });

  it("splits on commas and trims whitespace", function () {
    assert.deepEqual(parseInitialTags(" is:meta,group:events , needs:onsite"), [
      "is:meta",
      "group:events",
      "needs:onsite",
    ]);
  });

  it("drops duplicates", function () {
    assert.deepEqual(parseInitialTags("is:meta, is:meta,priority:high"), [
      "is:meta",
      "priority:high",
    ]);
  });
});
