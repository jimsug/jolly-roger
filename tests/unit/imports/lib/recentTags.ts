import { assert } from "chai";
import {
  recentTagName,
  recentTagsToOffer,
} from "../../../../imports/lib/recentTags";
import { TAG_SYNONYMS } from "../../../../imports/lib/tagNames";

const tags = [
  { name: "group:events" },
  { name: "where:atrium" },
  { name: "is:stuck" },
  { name: "cryptic", aliases: ["cryptics"] },
  { name: "loc:basement" },
];

describe("recentTagName", function () {
  it("keeps a tag's own name", function () {
    assert.equal(
      recentTagName("group:events", tags, TAG_SYNONYMS),
      "group:events",
    );
  });

  it("remembers a synonym or alias as the tag it stands for", function () {
    assert.equal(
      recentTagName("loc:atrium", tags, TAG_SYNONYMS),
      "where:atrium",
    );
    assert.equal(recentTagName("stuck", tags, TAG_SYNONYMS), "is:stuck");
    assert.equal(recentTagName("Cryptics", tags, TAG_SYNONYMS), "cryptic");
    assert.equal(
      recentTagName("  Group:Events ", tags, TAG_SYNONYMS),
      "group:events",
    );
  });

  it("remembers a tag still under a synonym by its canonical name", function () {
    assert.equal(
      recentTagName("loc:basement", tags, TAG_SYNONYMS),
      "where:basement",
    );
  });

  it("uses the canonical name of a tag the hunt doesn't have yet", function () {
    assert.equal(recentTagName("loc:roof", tags, TAG_SYNONYMS), "where:roof");
    assert.equal(recentTagName("new  tag", [], TAG_SYNONYMS), "new tag");
    assert.equal(recentTagName("loc:roof", tags, []), "loc:roof");
  });
});

const labels = (offered: { label: string }[]) =>
  offered.map(({ label }) => label);

describe("recentTagsToOffer", function () {
  it("offers nothing when nothing is remembered", function () {
    assert.deepEqual(recentTagsToOffer([], tags, [], TAG_SYNONYMS), []);
  });

  it("keeps the remembered order and drops tags the hunt no longer has", function () {
    assert.deepEqual(
      labels(
        recentTagsToOffer(
          ["is:stuck", "gone", "group:events", "cryptic"],
          tags,
          [],
          TAG_SYNONYMS,
        ),
      ),
      ["is:stuck", "group:events", "cryptic"],
    );
    assert.deepEqual(
      recentTagsToOffer(["group:events"], [], [], TAG_SYNONYMS),
      [],
    );
  });

  it("shows canonical names, once each, and adds the name the hunt's tag has", function () {
    assert.deepEqual(
      recentTagsToOffer(
        ["where:basement", "loc:basement", "where:atrium", "Where:Atrium"],
        tags,
        [],
        TAG_SYNONYMS,
      ),
      [
        { label: "where:basement", value: "loc:basement" },
        { label: "where:atrium", value: "where:atrium" },
      ],
    );
  });

  it("leaves out tags already applied, under any name", function () {
    assert.deepEqual(
      labels(
        recentTagsToOffer(
          [
            "is:stuck",
            "where:atrium",
            "cryptic",
            "group:events",
            "loc:basement",
          ],
          tags,
          ["stuck", "loc:atrium", "cryptics", "loc:basement"],
          TAG_SYNONYMS,
        ),
      ),
      ["group:events"],
    );
  });
});
