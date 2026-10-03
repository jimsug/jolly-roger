import { assert } from "chai";
import {
  escapeRegExp,
  normalizeTagName,
  tagNameMatcher,
} from "../../../../imports/lib/tagNames";

describe("normalizeTagName", function () {
  it("trims and collapses whitespace", function () {
    assert.equal(normalizeTagName("  group:  events \t"), "group: events");
    assert.equal(normalizeTagName("needs:extraction"), "needs:extraction");
  });

  it("keeps case", function () {
    assert.equal(normalizeTagName("Needs: Extraction"), "Needs: Extraction");
  });

  it("reduces blank names to the empty string", function () {
    assert.equal(normalizeTagName("   "), "");
    assert.equal(normalizeTagName(""), "");
  });
});

describe("tagNameMatcher", function () {
  it("matches the whole name ignoring case", function () {
    const matcher = tagNameMatcher("group:events");
    assert.isTrue(matcher.test("group:events"));
    assert.isTrue(matcher.test("Group:Events"));
    assert.isFalse(matcher.test("group:events-2"));
    assert.isFalse(matcher.test("subgroup:events"));
  });

  it("treats regex metacharacters literally", function () {
    const matcher = tagNameMatcher("needs:extraction?");
    assert.isTrue(matcher.test("needs:extraction?"));
    assert.isFalse(matcher.test("needs:extraction"));
    assert.isFalse(matcher.test("needs:extractio"));

    assert.isFalse(tagNameMatcher("a.b").test("axb"));
    assert.isTrue(tagNameMatcher("(round 1)").test("(ROUND 1)"));
    assert.doesNotThrow(() => tagNameMatcher("[^$]\\"));
  });
});

describe("escapeRegExp", function () {
  it("escapes every character with a special meaning", function () {
    const special = `.*+?^\${}()|[]\\`;
    assert.isTrue(new RegExp(`^${escapeRegExp(special)}$`).test(special));
  });
});
