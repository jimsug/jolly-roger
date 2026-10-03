import { assert } from "chai";
import sortUsersByDisplayName from "../../../../imports/lib/sortUsersByDisplayName";

describe("sortUsersByDisplayName", function () {
  it("ignores case and accents", function () {
    const sorted = sortUsersByDisplayName([
      { displayName: "zoe" },
      { displayName: "Émile" },
      { displayName: "alice" },
      { displayName: "Bob" },
      { displayName: "eve" },
    ]);
    assert.deepEqual(
      sorted.map((u) => u.displayName),
      ["alice", "Bob", "Émile", "eve", "zoe"],
    );
  });

  it("puts users without a display name first", function () {
    const sorted = sortUsersByDisplayName([
      { displayName: "bob" },
      { displayName: undefined },
    ]);
    assert.deepEqual(
      sorted.map((u) => u.displayName),
      [undefined, "bob"],
    );
  });

  it("handles an empty list", function () {
    assert.deepEqual(sortUsersByDisplayName([]), []);
  });
});
