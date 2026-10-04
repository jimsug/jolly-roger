import { assert } from "chai";
import planTagSynonymApply from "../../../../imports/lib/planTagSynonymApply";
import {
  MAX_TAG_NAME_LENGTH,
  TAG_SYNONYMS,
} from "../../../../imports/lib/tagNames";

describe("planTagSynonymApply", function () {
  it("plans nothing for no tags, an empty table or canonical names", function () {
    assert.deepEqual(planTagSynonymApply([], TAG_SYNONYMS), []);
    assert.deepEqual(
      planTagSynonymApply([{ _id: "a", name: "loc:atrium" }], []),
      [],
    );
    assert.deepEqual(
      planTagSynonymApply(
        [
          { _id: "a", name: "where:atrium" },
          { _id: "b", name: "is:stuck" },
          { _id: "c", name: "Loc:atrium" },
        ],
        TAG_SYNONYMS,
      ),
      [],
    );
  });

  it("renames a tag whose canonical name is free", function () {
    assert.deepEqual(
      planTagSynonymApply([{ _id: "a", name: "loc:atrium" }], TAG_SYNONYMS),
      [{ tagId: "a", from: "loc:atrium", to: "where:atrium" }],
    );
  });

  it("merges into a tag with the canonical name, or one aliased to it", function () {
    assert.deepEqual(
      planTagSynonymApply(
        [
          { _id: "a", name: "loc:atrium" },
          { _id: "b", name: "Where:Atrium" },
          { _id: "c", name: "stuck" },
          { _id: "d", name: "help", aliases: ["is:stuck"] },
        ],
        TAG_SYNONYMS,
      ),
      [
        { tagId: "a", from: "loc:atrium", to: "where:atrium", mergeInto: "b" },
        { tagId: "c", from: "stuck", to: "is:stuck", mergeInto: "d" },
      ],
    );
  });

  it("merges a tag into another synonym of it, which then takes the canonical name", function () {
    assert.deepEqual(
      planTagSynonymApply(
        [
          { _id: "a", name: "loc:atrium", aliases: ["atrium"] },
          { _id: "b", name: "location:atrium" },
        ],
        TAG_SYNONYMS,
      ),
      [
        { tagId: "a", from: "loc:atrium", to: "where:atrium", mergeInto: "b" },
        { tagId: "b", from: "location:atrium", to: "where:atrium" },
      ],
    );
  });

  it("follows a custom table", function () {
    assert.deepEqual(
      planTagSynonymApply(
        [
          { _id: "a", name: "round:1" },
          { _id: "b", name: "loc:atrium" },
        ],
        [{ kind: "prefix", match: "round:", to: "group:" }],
      ),
      [{ tagId: "a", from: "round:1", to: "group:1" }],
    );
  });

  it("leaves a tag whose canonical name would be too long", function () {
    const name = `loc:${"x".repeat(MAX_TAG_NAME_LENGTH - 4)}`;
    assert.lengthOf(name, MAX_TAG_NAME_LENGTH);
    assert.deepEqual(
      planTagSynonymApply([{ _id: "a", name }], TAG_SYNONYMS),
      [],
    );
  });
});
