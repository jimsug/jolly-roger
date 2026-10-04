import { useTracker } from "meteor/react-meteor-data";
import { faUserLock } from "@fortawesome/free-solid-svg-icons/faUserLock";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import React, { Suspense, useCallback, useId, useMemo, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import FormCheck from "react-bootstrap/FormCheck";
import FormGroup from "react-bootstrap/FormGroup";
import FormLabel from "react-bootstrap/FormLabel";
import FormText from "react-bootstrap/FormText";
import Modal from "react-bootstrap/Modal";
import { useTranslation } from "react-i18next";
import type { MultiValue } from "react-select";
import { useTheme } from "styled-components";
import Hunts from "../../../lib/models/Hunts";
import type { WhiteboardEditPolicy } from "../../../lib/models/Whiteboards";
import { WhiteboardEditPolicies } from "../../../lib/models/Whiteboards";
import { huntGrantsRoleByDefault } from "../../../lib/permission_stubs";
import setWhiteboardEditPolicy from "../../../methods/setWhiteboardEditPolicy";
import useSubscribeDisplayNames from "../../hooks/useSubscribeDisplayNames";
import indexedDisplayNames from "../../indexedDisplayNames";
import Loading from "../Loading";

// Casting away the React.lazy because otherwise we lose access to the generic
// parameter
const Select = React.lazy(
  () => import("react-select"),
) as typeof import("react-select").default;

// What each policy is called, in the dialog and on its toolbar button.
function useEditPolicyLabels(): Record<WhiteboardEditPolicy, string> {
  const { t } = useTranslation();
  return {
    members: t("whiteboard.editPolicy.members", "Everyone in the hunt"),
    operators: t("whiteboard.editPolicy.operators", "Operators only"),
    operatorsAndEditors: t(
      "whiteboard.editPolicy.operatorsAndEditors",
      "Operators and people they choose",
    ),
  };
}

// Opens the who-can-edit dialog, and says what the board is set to now.
export const EditPolicyButton = ({
  policy,
  onClick,
}: {
  policy: WhiteboardEditPolicy;
  onClick: () => void;
}) => {
  const { t } = useTranslation();
  const labels = useEditPolicyLabels();
  return (
    <Button
      size="sm"
      variant="outline-secondary"
      onClick={onClick}
      title={t(
        "whiteboard.editPolicy.buttonTitle",
        "Who can edit: {{policy}}",
        {
          policy: labels[policy],
          // React escapes attributes, so i18next's escaping would only show
          // entities. Goes once both i18n inits stop escaping.
          interpolation: { escapeValue: false },
        },
      )}
      aria-label={t("whiteboard.editPolicy.button", "Who can edit")}
    >
      <FontAwesomeIcon icon={faUserLock} />
    </Button>
  );
};

interface PersonOption {
  value: string;
  label: string;
}

const PolicyChoice = ({
  id,
  name,
  policy,
  label,
  checked,
  disabled,
  onChoose,
}: {
  id: string;
  name: string;
  policy: WhiteboardEditPolicy;
  label: string;
  checked: boolean;
  disabled: boolean;
  onChoose: (policy: WhiteboardEditPolicy) => void;
}) => {
  const onChange = useCallback(() => onChoose(policy), [onChoose, policy]);
  return (
    <FormCheck
      type="radio"
      id={id}
      name={name}
      label={label}
      checked={checked}
      disabled={disabled}
      onChange={onChange}
    />
  );
};

// Chooses who may edit the board. Starts from the board as it is when
// opened.
const EditPolicyModal = ({
  boardId,
  huntId,
  initialPolicy,
  initialEditors,
  onHide,
}: {
  boardId: string;
  huntId: string;
  initialPolicy: WhiteboardEditPolicy;
  initialEditors: string[];
  onHide: () => void;
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const idPrefix = useId();
  const [policy, setPolicy] = useState<WhiteboardEditPolicy>(initialPolicy);
  const [editors, setEditors] = useState<string[]>(initialEditors);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const namesLoading = useSubscribeDisplayNames(huntId)();
  const displayNames = useTracker(() => indexedDisplayNames(), []);
  const everyoneOperator = useTracker(() => {
    const hunt = Hunts.findOne(huntId);
    return !!hunt && huntGrantsRoleByDefault(hunt, "operator");
  }, [huntId]);

  const options: PersonOption[] = useMemo(
    () =>
      [...displayNames]
        .map(([value, label]) => ({ value, label }))
        .toSorted((a, b) => a.label.localeCompare(b.label)),
    [displayNames],
  );
  // Anyone listed without a name has left the hunt, once the names are in.
  const unnamed = namesLoading
    ? `${t("common.loading", "Loading")}…`
    : t("whiteboard.editPolicy.departed", "Someone no longer in the hunt");
  const selected: PersonOption[] = useMemo(
    () =>
      editors.map((id) => ({
        value: id,
        label: displayNames.get(id) ?? unnamed,
      })),
    [editors, displayNames, unnamed],
  );
  const onEditorsChange = useCallback(
    (value: MultiValue<PersonOption>) => setEditors(value.map((o) => o.value)),
    [],
  );

  const save = useCallback(() => {
    setSaving(true);
    setError(undefined);
    setWhiteboardEditPolicy.call(
      { boardId, editPolicy: policy, editors },
      (err) => {
        setSaving(false);
        if (err) {
          setError(err.reason ?? err.message);
        } else {
          onHide();
        }
      },
    );
  }, [boardId, policy, editors, onHide]);

  const labels = useEditPolicyLabels();
  const pickerId = `${idPrefix}-editors`;

  return (
    // Stays open until a save comes back, so a failure has somewhere to show.
    <Modal
      show
      onHide={onHide}
      backdrop={saving ? "static" : true}
      keyboard={!saving}
    >
      <Modal.Header closeButton={!saving}>
        <Modal.Title>
          {t("whiteboard.editPolicy.title", "Who can edit the board")}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <FormGroup className="mb-3">
          {WhiteboardEditPolicies.map((p) => (
            <PolicyChoice
              key={p}
              id={`${idPrefix}-${p}`}
              name={`${idPrefix}-policy`}
              policy={p}
              label={labels[p]}
              checked={policy === p}
              disabled={saving}
              onChoose={setPolicy}
            />
          ))}
          <FormText>
            {t(
              "whiteboard.editPolicy.help",
              "Everyone in the hunt can still view the board and comment.",
            )}
          </FormText>
        </FormGroup>
        <FormGroup className="mb-3">
          <FormLabel htmlFor={pickerId}>
            {t("whiteboard.editPolicy.pickPeople", "People who can edit")}
          </FormLabel>
          <Suspense fallback={<Loading inline />}>
            <Select
              inputId={pickerId}
              isMulti
              isLoading={namesLoading}
              isDisabled={saving || policy !== "operatorsAndEditors"}
              options={options}
              value={selected}
              onChange={onEditorsChange}
              theme={theme.reactSelectTheme}
            />
          </Suspense>
          <FormText>
            {t(
              "whiteboard.editPolicy.pickPeopleHelp",
              "Used when the board is set to operators and people they choose.",
            )}
          </FormText>
        </FormGroup>
        {everyoneOperator && (
          <Alert variant="info">
            {t(
              "whiteboard.editPolicy.everyoneOperator",
              "This hunt makes every member an operator, so whichever you choose, everyone can edit. Only operators assigned to the hunt can change this.",
            )}
          </Alert>
        )}
        {error && <Alert variant="danger">{error}</Alert>}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide} disabled={saving}>
          {t("common.cancel", "Cancel")}
        </Button>
        <Button variant="primary" onClick={save} disabled={saving}>
          {t("common.save", "Save")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default EditPolicyModal;
