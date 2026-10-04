import { faTimes } from "@fortawesome/free-solid-svg-icons/faTimes";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type React from "react";
import { useCallback } from "react";
import Button from "react-bootstrap/Button";
import FormControl from "react-bootstrap/FormControl";
import FormSelect from "react-bootstrap/FormSelect";
import { useTranslation } from "react-i18next";
import type { TagSynonymProblem, TagSynonymRule } from "../../lib/tagNames";

// One rule in the Setup page's synonym table, with what's wrong with it (if
// anything) underneath.
const TagSynonymRuleRow = ({
  index,
  rule,
  problem,
  disabled,
  onChange,
  onRemove,
}: {
  index: number;
  rule: TagSynonymRule;
  problem: TagSynonymProblem | undefined;
  disabled: boolean;
  onChange: (index: number, rule: TagSynonymRule) => void;
  onRemove: (index: number) => void;
}) => {
  const { t } = useTranslation();

  const onKindChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange(index, {
        ...rule,
        kind: e.currentTarget.value === "tag" ? "tag" : "prefix",
      });
    },
    [index, rule, onChange],
  );
  const onMatchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(index, { ...rule, match: e.currentTarget.value });
    },
    [index, rule, onChange],
  );
  const onToChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(index, { ...rule, to: e.currentTarget.value });
    },
    [index, rule, onChange],
  );
  const remove = useCallback(() => onRemove(index), [index, onRemove]);

  const messages: Record<TagSynonymProblem, string> = {
    empty: t("serverSetup.tagSynonyms.problem.empty", "Fill in both names."),
    prefixColon: t(
      "serverSetup.tagSynonyms.problem.prefixColon",
      "A prefix rule's names both end in a colon, like loc: and where:.",
    ),
    self: t(
      "serverSetup.tagSynonyms.problem.self",
      "The canonical name is the same as the name it replaces.",
    ),
    chain: t(
      "serverSetup.tagSynonyms.problem.chain",
      "Another rule rewrites this canonical name, or for a prefix, names that start with it. Point this rule straight at the final name instead.",
    ),
    duplicate: t(
      "serverSetup.tagSynonyms.problem.duplicate",
      "An earlier rule already matches this name.",
    ),
  };
  const message = problem && messages[problem];

  const ruleNumber = index + 1;
  return (
    <>
      <tr>
        <td>
          <FormSelect
            size="sm"
            aria-label={t(
              "serverSetup.tagSynonyms.kindLabel",
              "Kind of rule {{number}}",
              { number: ruleNumber },
            )}
            value={rule.kind}
            disabled={disabled}
            onChange={onKindChange}
          >
            <option value="prefix">
              {t("serverSetup.tagSynonyms.kindPrefix", "Prefix")}
            </option>
            <option value="tag">
              {t("serverSetup.tagSynonyms.kindTag", "Whole tag")}
            </option>
          </FormSelect>
        </td>
        <td>
          <FormControl
            size="sm"
            type="text"
            aria-label={t(
              "serverSetup.tagSynonyms.matchLabel",
              "Synonym in rule {{number}}",
              { number: ruleNumber },
            )}
            value={rule.match}
            isInvalid={problem !== undefined}
            disabled={disabled}
            onChange={onMatchChange}
          />
        </td>
        <td>
          <FormControl
            size="sm"
            type="text"
            aria-label={t(
              "serverSetup.tagSynonyms.toLabel",
              "Canonical name in rule {{number}}",
              { number: ruleNumber },
            )}
            value={rule.to}
            isInvalid={problem !== undefined}
            disabled={disabled}
            onChange={onToChange}
          />
        </td>
        <td>
          <Button
            size="sm"
            variant="outline-danger"
            aria-label={t(
              "serverSetup.tagSynonyms.remove",
              "Remove rule {{number}}",
              { number: ruleNumber },
            )}
            title={t(
              "serverSetup.tagSynonyms.remove",
              "Remove rule {{number}}",
              { number: ruleNumber },
            )}
            disabled={disabled}
            onClick={remove}
          >
            <FontAwesomeIcon icon={faTimes} />
          </Button>
        </td>
      </tr>
      {message && (
        <tr>
          <td colSpan={4} className="text-danger border-top-0 pt-0">
            {message}
          </td>
        </tr>
      )}
    </>
  );
};

export default TagSynonymRuleRow;
