import { assert } from "chai";
import {
  canonicalTagName,
  cleanTagSynonymRules,
  compareTagNames,
  escapeRegExp,
  isFunctionalTag,
  isGroupTag,
  isLocationTag,
  isMetaForTag,
  isMetametaTag,
  isMetaTag,
  isStuckTag,
  normalizeTagName,
  TAG_SYNONYMS,
  type TagKind,
  type TagSynonymRule,
  tagKind,
  tagNameMatcher,
  tagPrefixValue,
  tagSynonymMatcher,
  tagSynonymNames,
  tagSynonymRuleProblems,
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

describe("canonicalTagName", function () {
  it("rewrites the location prefixes to where:", function () {
    assert.equal(canonicalTagName("location:atrium"), "where:atrium");
    assert.equal(canonicalTagName("loc:atrium"), "where:atrium");
    assert.equal(canonicalTagName("loc:"), "where:");
    assert.equal(canonicalTagName("where:atrium"), "where:atrium");
  });

  it("rewrites the whole tag stuck to is:stuck", function () {
    assert.equal(canonicalTagName("stuck"), "is:stuck");
    assert.equal(canonicalTagName("is:stuck"), "is:stuck");
    assert.equal(canonicalTagName("stuck:on 3"), "stuck:on 3");
    assert.equal(canonicalTagName("unstuck"), "unstuck");
  });

  it("leaves other names, and other cases, alone", function () {
    for (const name of [
      "group:events",
      "locale:fr",
      "Loc:atrium",
      "Stuck",
      "group:loc:x",
      "",
    ]) {
      assert.equal(canonicalTagName(name), name);
    }
  });

  it("follows a table it is given", function () {
    const synonyms = [
      { kind: "prefix", match: "round:", to: "group:" },
    ] as const;
    assert.equal(canonicalTagName("round:1", synonyms), "group:1");
    assert.equal(canonicalTagName("loc:x", synonyms), "loc:x");
    assert.equal(canonicalTagName("loc:x", []), "loc:x");
  });

  it("leaves every name alone with an empty table", function () {
    for (const name of ["loc:x", "location:x", "stuck", "where:x", ""]) {
      assert.equal(canonicalTagName(name, []), name);
    }
  });

  it("covers every rule in the default table", function () {
    for (const rule of TAG_SYNONYMS) {
      const name = rule.kind === "tag" ? rule.match : `${rule.match}x`;
      const expected = rule.kind === "tag" ? rule.to : `${rule.to}x`;
      assert.equal(canonicalTagName(name), expected, name);
    }
  });
});

describe("tagSynonymNames", function () {
  it("lists every name for the same tag", function () {
    const expected = ["where:x", "location:x", "loc:x"];
    assert.sameMembers(tagSynonymNames("loc:x"), expected);
    assert.sameMembers(tagSynonymNames("where:x"), expected);
    assert.sameMembers(tagSynonymNames("stuck"), ["stuck", "is:stuck"]);
    assert.sameMembers(tagSynonymNames("is:stuck"), ["stuck", "is:stuck"]);
  });

  it("is just the name for a tag without synonyms", function () {
    assert.deepEqual(tagSynonymNames("group:events"), ["group:events"]);
    assert.deepEqual(tagSynonymNames("Loc:x"), ["Loc:x"]);
  });

  it("follows a table it is given", function () {
    const synonyms: TagSynonymRule[] = [
      { kind: "prefix", match: "round:", to: "group:" },
      { kind: "tag", match: "meta", to: "is:meta" },
    ];
    assert.sameMembers(tagSynonymNames("round:1", synonyms), [
      "round:1",
      "group:1",
    ]);
    assert.sameMembers(tagSynonymNames("group:1", synonyms), [
      "round:1",
      "group:1",
    ]);
    assert.sameMembers(tagSynonymNames("is:meta", synonyms), [
      "meta",
      "is:meta",
    ]);
    assert.deepEqual(tagSynonymNames("loc:x", synonyms), ["loc:x"]);
  });

  it("is just the name with an empty table", function () {
    assert.deepEqual(tagSynonymNames("loc:x", []), ["loc:x"]);
    assert.deepEqual(tagSynonymNames("stuck", []), ["stuck"]);
  });
});

describe("tagSynonymMatcher", function () {
  it("matches any synonym, ignoring case", function () {
    const matcher = tagSynonymMatcher("loc:atrium");
    for (const name of ["where:atrium", "Location:Atrium", "LOC:atrium"]) {
      assert.isTrue(matcher.test(name), name);
    }
    assert.isFalse(matcher.test("where:atrium2"));
    assert.isFalse(matcher.test("where:"));
  });

  it("matches the name literally", function () {
    const matcher = tagSynonymMatcher("needs:extraction?");
    assert.isTrue(matcher.test("needs:extraction?"));
    assert.isFalse(matcher.test("needs:extractio"));
  });
});

describe("tagKind", function () {
  it("reads each kind", function () {
    const cases: [string, TagKind][] = [
      ["group:events", "group"],
      ["group:", "group"],
      ["meta-for:events", "metaFor"],
      ["where:atrium", "location"],
      ["loc:atrium", "location"],
      ["location:atrium", "location"],
      ["is:meta", "meta"],
      ["is:metameta", "metameta"],
      ["is:stuck", "stuck"],
      ["stuck", "stuck"],
      ["needs:extraction", "needs"],
      ["priority:high", "priority"],
      ["administrivia", "administrivia"],
      ["wordplay", "plain"],
      ["type:crossword", "plain"],
      ["Group:events", "plain"],
      ["is:metametameta", "plain"],
      ["", "plain"],
    ];
    for (const [name, kind] of cases) {
      assert.equal(tagKind(name), kind, name);
    }
  });

  it("gives the value after a kind's prefix", function () {
    assert.equal(tagPrefixValue("group:events"), "events");
    assert.equal(tagPrefixValue("loc:atrium"), "atrium");
    assert.equal(tagPrefixValue("needs:"), "");
    assert.isUndefined(tagPrefixValue("is:meta"));
    assert.isUndefined(tagPrefixValue("type:crossword"));
  });
});

describe("tag kind helpers", function () {
  it("read canonical names", function () {
    assert.isTrue(isGroupTag("group:events"));
    assert.isFalse(isGroupTag("meta-for:events"));
    assert.isTrue(isMetaForTag("meta-for:events"));
    assert.isFalse(isMetaForTag("is:meta"));
    assert.isTrue(isLocationTag("where:atrium"));
    assert.isFalse(isLocationTag("group:where:atrium"));
    assert.isTrue(isMetaTag("is:meta"));
    assert.isTrue(isMetaTag("meta-for:events"));
    assert.isFalse(isMetaTag("is:metameta"));
    assert.isTrue(isMetametaTag("is:metameta"));
    assert.isFalse(isMetametaTag("is:meta"));
    assert.isTrue(isStuckTag("is:stuck"));
    assert.isFalse(isStuckTag("needs:unsticking"));
  });

  it("read synonyms as their canonical names", function () {
    assert.isTrue(isLocationTag("loc:atrium"));
    assert.isTrue(isLocationTag("location:atrium"));
    assert.isFalse(isLocationTag("locale:fr"));
    assert.isTrue(isStuckTag("stuck"));
    assert.isFalse(isStuckTag("Stuck"));
  });

  it("call any prefixed tag functional", function () {
    for (const name of [
      "group:events",
      "needs:extraction",
      "type:crossword",
      "where:atrium",
      // A synonym for is:stuck
      "stuck",
    ]) {
      assert.isTrue(isFunctionalTag(name), name);
    }
    for (const name of ["wordplay", "administrivia", ""]) {
      assert.isFalse(isFunctionalTag(name), name);
    }
  });
});

describe("compareTagNames", function () {
  it("sorts A to Z ignoring case", function () {
    assert.deepEqual(
      ["needs:b", "Group:c", "group:a", "administrivia"].toSorted(
        compareTagNames,
      ),
      ["administrivia", "group:a", "Group:c", "needs:b"],
    );
    assert.equal(compareTagNames("Logic", "logic"), 0);
    assert.isBelow(compareTagNames("a", "B"), 0);
    assert.isAbove(compareTagNames("b", "A"), 0);
  });
});

describe("tag helpers given a synonym table", function () {
  it("read names through it in place of the built-in one", function () {
    const custom: TagSynonymRule[] = [
      { kind: "prefix", match: "round:", to: "group:" },
    ];
    assert.equal(canonicalTagName("round:1", custom), "group:1");
    assert.equal(canonicalTagName("loc:x", custom), "loc:x");
    assert.equal(tagKind("round:1", custom), "group");

    assert.equal(canonicalTagName("stuck", []), "stuck");
    assert.isFalse(isStuckTag("stuck", []));

    assert.equal(canonicalTagName("loc:x"), "where:x");
    assert.isTrue(isStuckTag("stuck"));
  });
});

describe("cleanTagSynonymRules", function () {
  it("normalises both names as tag names are", function () {
    assert.deepEqual(
      cleanTagSynonymRules([
        { kind: "prefix", match: "  loc: ", to: "where:" },
        { kind: "tag", match: "very  stuck", to: " is:stuck" },
      ]),
      [
        { kind: "prefix", match: "loc:", to: "where:" },
        { kind: "tag", match: "very stuck", to: "is:stuck" },
      ],
    );
  });
});

describe("tagSynonymRuleProblems", function () {
  const problems = (rules: TagSynonymRule[]) => [
    ...tagSynonymRuleProblems(rules),
  ];

  it("accepts the built-in table, an empty one and a custom one", function () {
    assert.deepEqual(problems([...TAG_SYNONYMS]), []);
    assert.deepEqual(problems([]), []);
    assert.deepEqual(
      problems([
        { kind: "prefix", match: "round:", to: "group:" },
        { kind: "prefix", match: "r:", to: "group:" },
        { kind: "tag", match: "meta", to: "is:meta" },
        { kind: "tag", match: "loc:", to: "where:" },
      ]),
      [],
    );
  });

  it("refuses an empty name", function () {
    assert.deepEqual(problems([{ kind: "tag", match: "", to: "is:stuck" }]), [
      [0, "empty"],
    ]);
    assert.deepEqual(problems([{ kind: "prefix", match: "loc:", to: "" }]), [
      [0, "empty"],
    ]);
  });

  it("refuses a prefix rule whose names don't end in a colon", function () {
    assert.deepEqual(
      problems([
        { kind: "prefix", match: "loc", to: "where:" },
        { kind: "prefix", match: "loc:", to: "where" },
        { kind: "tag", match: "stuck", to: "is:stuck" },
      ]),
      [
        [0, "prefixColon"],
        [1, "prefixColon"],
      ],
    );
  });

  it("refuses a rule that maps a name to itself", function () {
    assert.deepEqual(problems([{ kind: "tag", match: "x", to: "x" }]), [
      [0, "self"],
    ]);
  });

  it("refuses a canonical name that another rule rewrites", function () {
    assert.deepEqual(
      problems([
        { kind: "prefix", match: "loc:", to: "where:" },
        { kind: "prefix", match: "where:", to: "place:" },
      ]),
      [[0, "chain"]],
    );
    assert.deepEqual(
      problems([
        { kind: "tag", match: "stuck", to: "is:stuck" },
        { kind: "tag", match: "is:stuck", to: "help" },
      ]),
      [[0, "chain"]],
    );
    // A whole tag pointing into a rewritten prefix is a chain too
    assert.deepEqual(
      problems([
        { kind: "tag", match: "atrium", to: "loc:atrium" },
        { kind: "prefix", match: "loc:", to: "where:" },
      ]),
      [[0, "chain"]],
    );
    // As is a prefix rule whose canonical prefix starts with its own
    assert.deepEqual(problems([{ kind: "prefix", match: "a:", to: "a:b:" }]), [
      [0, "chain"],
    ]);
    // A prefix rule's canonical names run on past its prefix, so a rule
    // matching a longer name under it rewrites some of them
    assert.deepEqual(
      problems([
        { kind: "prefix", match: "loc:", to: "where:" },
        { kind: "prefix", match: "where:room:", to: "room:" },
      ]),
      [[0, "chain"]],
    );
    assert.deepEqual(
      problems([
        { kind: "prefix", match: "loc:", to: "where:" },
        { kind: "tag", match: "where:x", to: "x" },
      ]),
      [[0, "chain"]],
    );
    assert.deepEqual(
      problems([{ kind: "prefix", match: "where:a:", to: "where:" }]),
      [[0, "chain"]],
    );
  });

  it("refuses a rule repeating an earlier one's kind and match", function () {
    assert.deepEqual(
      problems([
        { kind: "prefix", match: "loc:", to: "where:" },
        { kind: "prefix", match: "loc:", to: "place:" },
        { kind: "tag", match: "loc:", to: "where:" },
      ]),
      [[1, "duplicate"]],
    );
  });

  it("matches case-sensitively", function () {
    assert.deepEqual(
      problems([
        { kind: "prefix", match: "loc:", to: "where:" },
        { kind: "prefix", match: "Where:", to: "place:" },
        { kind: "prefix", match: "Loc:", to: "where:" },
      ]),
      [],
    );
  });
});
