import { check, Match } from "meteor/check";
import { Meteor } from "meteor/meteor";
import Logger from "../../Logger";
import MeteorUsers from "../../lib/models/MeteorUsers";
import Settings from "../../lib/models/Settings";
import { userMayConfigureTagSynonyms } from "../../lib/permission_stubs";
import {
  cleanTagSynonymRules,
  type TagSynonymProblem,
  tagSynonymRuleProblems,
} from "../../lib/tagNames";
import configureTagSynonyms from "../../methods/configureTagSynonyms";
import defineMethod from "./defineMethod";

const PROBLEM_MESSAGES: Record<TagSynonymProblem, string> = {
  empty: "needs both a name to match and a canonical name",
  prefixColon: "is a prefix rule, so both names must end in ':'",
  self: "maps a name to itself",
  chain: "has a canonical name that another rule rewrites",
  duplicate: "repeats an earlier rule",
};

defineMethod(configureTagSynonyms, {
  validate(arg) {
    check(arg, {
      rules: [
        {
          kind: Match.OneOf("prefix" as const, "tag" as const),
          match: String,
          to: String,
        },
      ],
    });
    return arg;
  },

  async run({ rules }) {
    check(this.userId, String);
    if (
      !userMayConfigureTagSynonyms(await MeteorUsers.findOneAsync(this.userId))
    ) {
      throw new Meteor.Error(401, "Must be admin to configure tag synonyms");
    }

    const cleaned = cleanTagSynonymRules(rules);
    const [problem] = tagSynonymRuleProblems(cleaned);
    if (problem) {
      const [index, kind] = problem;
      throw new Meteor.Error(
        400,
        `Rule ${index + 1} ${PROBLEM_MESSAGES[kind]}`,
      );
    }

    Logger.info("Configuring tag synonyms", { rules: cleaned.length });
    await Settings.upsertAsync(
      { name: "tag.synonyms" },
      { $set: { value: { rules: cleaned } } },
    );
  },
});
