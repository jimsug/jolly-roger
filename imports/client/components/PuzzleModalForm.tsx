import { Meteor } from "meteor/meteor";
import { useTracker } from "meteor/react-meteor-data";
import React, {
  Suspense,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import Alert from "react-bootstrap/Alert";
import Col from "react-bootstrap/Col";
import FormCheck from "react-bootstrap/FormCheck";
import type { FormControlProps } from "react-bootstrap/FormControl";
import FormControl from "react-bootstrap/FormControl";
import FormGroup from "react-bootstrap/FormGroup";
import FormLabel from "react-bootstrap/FormLabel";
import FormText from "react-bootstrap/FormText";
import Row from "react-bootstrap/Row";
import { Trans, useTranslation } from "react-i18next";
import type { ActionMeta } from "react-select";
import { useTheme } from "styled-components";
import type { GdriveMimeTypesType } from "../../lib/GdriveMimeTypes";
import guessTitleFromUrl from "../../lib/guessTitleFromUrl";
import Hunts from "../../lib/models/Hunts";
import type { PuzzleType } from "../../lib/models/Puzzles";
import type { TagType } from "../../lib/models/Tags";
import { compareTagNames, isFunctionalTag } from "../../lib/tagNames";
import LabelledRadioGroup from "./LabelledRadioGroup";
import Loading from "./Loading";
import type { ModalFormHandle } from "./ModalForm";
import ModalForm from "./ModalForm";

// Casting away the React.lazy because otherwise we lose access to the generic parameter
const Creatable = React.lazy(
  () => import("react-select/creatable"),
) as typeof import("react-select/creatable").default;

type TagSelectOption = { value: string; label: string };

export interface PuzzleModalFormSubmitPayload {
  huntId: string;
  title: string;
  url: string | undefined;
  tags: string[];
  docType?: GdriveMimeTypesType;
  expectedAnswerCount: number;
  allowDuplicateUrls?: boolean;
  completedWithNoAnswer?: boolean;
  locked?: boolean;
  lockedSummary?: string;
}

enum PuzzleModalFormSubmitState {
  IDLE = "idle",
  SUBMITTING = "submitting",
  FAILED = "failed",
}

// Fields to fill in as the form opens, e.g. a group's tags when adding a
// puzzle to it, or the page the bookmarklet was clicked on
export type PuzzleModalFormPrefill = {
  title?: string;
  url?: string;
  tagIds?: string[];
};

export type PuzzleModalFormHandle = {
  reset: () => void;
  show: (prefill?: PuzzleModalFormPrefill) => void;
};

const sortTagNames = (names: Iterable<string>) =>
  [...new Set(names)].filter(Boolean).sort(compareTagNames);

const PuzzleModalForm = ({
  huntId,
  puzzle,
  tags: propsTags,
  onSubmit,
  showOnMount,
  ref,
}: {
  huntId: string;
  puzzle?: PuzzleType;
  // All known tags for this hunt
  tags: TagType[];
  onSubmit: (
    payload: PuzzleModalFormSubmitPayload,
    callback: (error?: Error) => void,
  ) => void;
  showOnMount?: boolean;
  ref: React.Ref<PuzzleModalFormHandle>;
}) => {
  const tagNamesForIds = useCallback(
    (tagIds: string[]) => {
      const tagNames: Record<string, string> = {};
      propsTags.forEach((t) => {
        tagNames[t._id] = t.name;
      });
      return tagIds.map((t) => tagNames[t] ?? t);
    },
    [propsTags],
  );

  const allowLocked = useTracker(
    () => Hunts.findOne(huntId)?.allowUnlockablePuzzles ?? false,
    [huntId],
  );

  const [title, setTitle] = useState(puzzle?.title ?? "");
  const [url, setUrl] = useState(puzzle?.url ?? "");
  const [tags, setTags] = useState(puzzle ? tagNamesForIds(puzzle.tags) : []);
  const [docType, setDocType] = useState<GdriveMimeTypesType | undefined>(
    puzzle ? undefined : "spreadsheet",
  );
  const [expectedAnswerCount, setExpectedAnswerCount] = useState(
    puzzle ? puzzle.expectedAnswerCount : 1,
  );
  const [considerCompletedWithNoAnswer, setConsiderCompletedWithNoAnswer] =
    useState(puzzle?.completedWithNoAnswer);
  const [locked, setLocked] = useState(puzzle?.locked ?? false);
  const [lockedSummary, setLockedSummary] = useState(
    puzzle?.lockedSummary ?? "",
  );
  const [confirmingDuplicateUrl, setConfirmingDuplicateUrl] = useState(false);
  const [allowDuplicateUrls, setAllowDuplicateUrls] = useState(
    puzzle ? undefined : false,
  );
  const [submitState, setSubmitState] = useState(
    PuzzleModalFormSubmitState.IDLE,
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [titleDirty, setTitleDirty] = useState(false);
  const [urlDirty, setUrlDirty] = useState(false);
  const [tagsDirty, setTagsDirty] = useState(false);
  const [expectedAnswerCountDirty, setExpectedAnswerCountDirty] =
    useState(false);
  const [
    considerCompletedWithNoAnswerDirty,
    setConsiderCompletedWithNoAnswerDirty,
  ] = useState(false);
  const [lockedDirty, setLockedDirty] = useState(false);
  const [lockedSummaryDirty, setLockedSummaryDirty] = useState(false);
  // The title last guessed from the URL, so a later URL can replace it but a
  // title someone typed is left alone. Editing a puzzle never replaces a
  // title, so this only follows guesses made in this form.
  const lastGuessedTitle = useRef<string | undefined>(undefined);
  // Whether the tags came from a prefill, which belongs to whatever opened
  // the form with it: the next show() without tags clears them.
  const tagsPrefilled = useRef(false);
  // show() reads the tag names through a ref so that it stays the same
  // function, as otherwise showOnMount would reopen the form whenever the
  // hunt's tags change.
  const tagNamesForIdsRef = useRef(tagNamesForIds);
  useEffect(() => {
    tagNamesForIdsRef.current = tagNamesForIds;
  }, [tagNamesForIds]);

  // show() can be asked for before ModalForm has mounted (the tag selector
  // below is lazy-loaded), e.g. by the bookmarklet on page load, so it is
  // replayed once the form is there.
  const formRef = useRef<ModalFormHandle | null>(null);
  const showPending = useRef(false);
  const setFormRef = useCallback((handle: ModalFormHandle | null) => {
    formRef.current = handle;
    if (handle && showPending.current) {
      showPending.current = false;
      handle.show();
    }
  }, []);

  const onTitleChange: NonNullable<FormControlProps["onChange"]> = useCallback(
    (event) => {
      setTitle(event.currentTarget.value);
      setTitleDirty(true);
    },
    [],
  );

  const onDocTypeChange = useCallback((newValue: string) => {
    setDocType(newValue as GdriveMimeTypesType);
  }, []);

  const onExpectedAnswerCountChange: NonNullable<FormControlProps["onChange"]> =
    useCallback((event) => {
      const string = event.currentTarget.value;
      const value = Number(string);
      setExpectedAnswerCount(value);
      setExpectedAnswerCountDirty(true);
      if (value === 0) {
        setConsiderCompletedWithNoAnswer(false);
      } else {
        setConsiderCompletedWithNoAnswer(undefined);
      }
      setConsiderCompletedWithNoAnswerDirty(true);
    }, []);

  const onAllowDuplicateUrlsChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setAllowDuplicateUrls(event.currentTarget.checked);
    },
    [],
  );

  const onConsiderSolvedWithNoAnswerChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setConsiderCompletedWithNoAnswer(event.currentTarget.checked);
      setConsiderCompletedWithNoAnswerDirty(true);
    },
    [],
  );

  const onLockedChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setLocked(event.currentTarget.checked);
      setLockedDirty(true);
    },
    [],
  );

  const onLockedSummaryChange: NonNullable<FormControlProps["onChange"]> =
    useCallback((event) => {
      setLockedSummary(event.currentTarget.value);
      setLockedSummaryDirty(true);
    }, []);

  const { t } = useTranslation();

  const currentLocked = useMemo(() => {
    if (!lockedDirty && puzzle) {
      return puzzle.locked ?? false;
    } else {
      return locked;
    }
  }, [lockedDirty, puzzle, locked]);

  const currentLockedSummary = useMemo(() => {
    if (!lockedSummaryDirty && puzzle) {
      return puzzle.lockedSummary ?? "";
    } else {
      return lockedSummary;
    }
  }, [lockedSummaryDirty, puzzle, lockedSummary]);

  const onFormSubmit = useCallback(
    (callback: () => void) => {
      setSubmitState(PuzzleModalFormSubmitState.SUBMITTING);
      const payload: PuzzleModalFormSubmitPayload = {
        huntId,
        title,
        url: url !== "" ? url : undefined, // Make sure we send undefined if url is falsy
        tags,
        expectedAnswerCount,
        completedWithNoAnswer: considerCompletedWithNoAnswer,
      };
      if (docType) {
        payload.docType = docType;
      }
      if (allowDuplicateUrls) {
        payload.allowDuplicateUrls = allowDuplicateUrls;
      }
      if (allowLocked) {
        payload.locked = currentLocked;
        const trimmedSummary = currentLockedSummary.trim();
        if (currentLocked && trimmedSummary !== "") {
          payload.lockedSummary = trimmedSummary;
        }
      }
      onSubmit(payload, (error) => {
        if (error) {
          if (
            error instanceof Meteor.Error &&
            typeof error.error === "number" &&
            error.error === 409
          ) {
            setErrorMessage(
              t(
                "puzzle.edit.duplicateUrlWarning",
                `A puzzle already exists with this URL - did someone else
                    already add this puzzle? To force creation anyway, check
                  the "Allow puzzles with identical URLs" box above and try
                  again.`,
              ),
            );
            setConfirmingDuplicateUrl(true);
          } else {
            setErrorMessage(error.message);
          }
          setSubmitState(PuzzleModalFormSubmitState.FAILED);
        } else {
          setSubmitState(PuzzleModalFormSubmitState.IDLE);
          setErrorMessage("");
          setTitleDirty(false);
          setUrlDirty(false);
          setTagsDirty(false);
          setExpectedAnswerCountDirty(false);
          setConsiderCompletedWithNoAnswerDirty(false);
          setLockedDirty(false);
          setLockedSummaryDirty(false);
          setConfirmingDuplicateUrl(false);
          setAllowDuplicateUrls(false);
          callback();
        }
      });
    },
    [
      onSubmit,
      huntId,
      title,
      url,
      tags,
      expectedAnswerCount,
      docType,
      allowDuplicateUrls,
      considerCompletedWithNoAnswer,
      allowLocked,
      currentLocked,
      currentLockedSummary,
      t,
    ],
  );

  const show = useCallback((prefill?: PuzzleModalFormPrefill) => {
    if (prefill?.title !== undefined) {
      setTitle(prefill.title);
      setTitleDirty(true);
    }
    if (prefill?.url !== undefined) {
      setUrl(prefill.url);
      setUrlDirty(true);
      const guessed = guessTitleFromUrl(prefill.url);
      if (guessed !== undefined) {
        if (!prefill.title) {
          setTitle(guessed);
          setTitleDirty(true);
        }
        lastGuessedTitle.current = guessed;
      }
    }
    if (prefill?.tagIds !== undefined) {
      setTags(tagNamesForIdsRef.current([...new Set(prefill.tagIds)]));
      setTagsDirty(true);
      tagsPrefilled.current = true;
    } else if (tagsPrefilled.current) {
      setTags([]);
      setTagsDirty(true);
      tagsPrefilled.current = false;
    }

    if (formRef.current) {
      formRef.current.show();
    } else {
      showPending.current = true;
    }
  }, []);

  const reset = useCallback(() => {
    setTitle("");
    setUrl("");
    setTags([]);
    setExpectedAnswerCount(1);
    setDocType("spreadsheet");
    setLocked(false);
    setLockedSummary("");
    lastGuessedTitle.current = undefined;
    tagsPrefilled.current = false;
  }, []);

  const currentTitle = useMemo(() => {
    if (!titleDirty && puzzle) {
      return puzzle.title;
    } else {
      return title;
    }
  }, [titleDirty, puzzle, title]);

  // Fills in a title from the URL while the title is blank or, when adding a
  // puzzle, still the one guessed from the previous URL. Editing a puzzle's
  // URL leaves a title it has alone.
  const onUrlChange: NonNullable<FormControlProps["onChange"]> = useCallback(
    (event) => {
      const newUrl = event.currentTarget.value;
      setUrl(newUrl);
      setUrlDirty(true);
      const guessed = guessTitleFromUrl(newUrl);
      if (guessed === undefined) {
        return;
      }
      if (
        currentTitle === "" ||
        (!puzzle && currentTitle === lastGuessedTitle.current)
      ) {
        setTitle(guessed);
        setTitleDirty(true);
      }
      lastGuessedTitle.current = guessed;
    },
    [currentTitle, puzzle],
  );

  const currentUrl = useMemo(() => {
    if (!urlDirty && puzzle) {
      // Always make this a string so that currentUrl is not undefined, which
      // makes React confused about whether the input is controller or not.
      // If the string is empty, we'll turn it back into undefined in onFormSubmit.
      return puzzle.url ?? "";
    } else {
      return url;
    }
  }, [urlDirty, puzzle, url]);

  const currentTags = useMemo(() => {
    if (!tagsDirty && puzzle) {
      return tagNamesForIds(puzzle.tags);
    } else {
      return tags;
    }
  }, [tagsDirty, puzzle, tagNamesForIds, tags]);
  const currentFunctionalTags = useMemo(
    () => currentTags.filter(isFunctionalTag),
    [currentTags],
  );
  const currentContentTags = useMemo(
    () => currentTags.filter((name) => !isFunctionalTag(name)),
    [currentTags],
  );

  // Each tag input replaces its own half of the tag list and keeps the other.
  const onTagHalfChange = useCallback(
    (
      value: readonly TagSelectOption[],
      action: ActionMeta<TagSelectOption>,
      otherHalf: string[],
    ) => {
      switch (action.action) {
        case "clear":
        case "create-option":
        case "deselect-option":
        case "pop-value":
        case "remove-value":
        case "select-option":
          setTags([...otherHalf, ...value.map((v) => v.value)]);
          setTagsDirty(true);
          break;
        default:
          break;
      }
    },
    [],
  );

  const onFunctionalTagsChange = useCallback(
    (
      value: readonly TagSelectOption[],
      action: ActionMeta<TagSelectOption>,
    ) => {
      onTagHalfChange(value, action, currentContentTags);
    },
    [onTagHalfChange, currentContentTags],
  );

  const onContentTagsChange = useCallback(
    (
      value: readonly TagSelectOption[],
      action: ActionMeta<TagSelectOption>,
    ) => {
      onTagHalfChange(value, action, currentFunctionalTags);
    },
    [onTagHalfChange, currentFunctionalTags],
  );

  const currentExpectedAnswerCount = useMemo(() => {
    if (!expectedAnswerCountDirty && puzzle) {
      return puzzle.expectedAnswerCount;
    } else {
      return expectedAnswerCount;
    }
  }, [expectedAnswerCountDirty, puzzle, expectedAnswerCount]);

  const currentConsiderCompletedWithNoAnswer = useMemo(() => {
    if (!considerCompletedWithNoAnswerDirty && puzzle) {
      return puzzle.completedWithNoAnswer ?? false;
    } else {
      return considerCompletedWithNoAnswer ?? false;
    }
  }, [
    considerCompletedWithNoAnswerDirty,
    puzzle,
    considerCompletedWithNoAnswer,
  ]);

  useImperativeHandle(ref, () => ({
    show,
    reset,
  }));

  useEffect(() => {
    if (showOnMount) {
      show();
    }
  }, [showOnMount, show]);

  const disableForm = submitState === PuzzleModalFormSubmitState.SUBMITTING;

  const selectOptions: TagSelectOption[] = sortTagNames([
    ...propsTags.map((t) => t.name),
    ...currentTags,
  ]).map((t) => {
    return { value: t, label: t };
  });
  const functionalSelectOptions = selectOptions.filter((o) =>
    isFunctionalTag(o.value),
  );
  const contentSelectOptions = selectOptions.filter(
    (o) => !isFunctionalTag(o.value),
  );
  const tagsPlaceholder = t(
    "puzzle.edit.tagsPlaceholder",
    "Type to search or create",
  );

  const idPrefix = useId();

  const docTypeSelector =
    !puzzle && docType ? (
      <FormGroup as={Row} className="mb-3">
        <FormLabel column xs={3}>
          {t("puzzle.edit.documentType", "Document type")}
        </FormLabel>
        <Col xs={9}>
          <LabelledRadioGroup
            header=""
            options={[
              {
                value: "spreadsheet",
                label: "Spreadsheet",
              },
              {
                value: "document",
                label: "Document",
              },
            ]}
            initialValue={docType}
            help={t(
              "puzzle.edit.documentTypeHelp",
              `This can't be changed once a puzzle has been created. Unless
                you're absolutely sure, use a spreadsheet. We only expect to
                use documents for administrivia.`,
            )}
            onChange={onDocTypeChange}
          />
        </Col>
      </FormGroup>
    ) : null;

  const allowDuplicateUrlsCheckbox =
    !puzzle && allowDuplicateUrls !== undefined && confirmingDuplicateUrl ? (
      <FormCheck
        id={`${idPrefix}-allow-duplicate-urls`}
        label={t(
          "puzzle.edit.allowDuplicateUrls",
          "Allow puzzles with identical URLs",
        )}
        type="checkbox"
        disabled={disableForm}
        onChange={onAllowDuplicateUrlsChange}
        className="mt-1"
      />
    ) : null;

  const theme = useTheme();

  return (
    <Suspense
      fallback={
        <div>
          <Loading />
        </div>
      }
    >
      <ModalForm
        ref={setFormRef}
        title={
          puzzle
            ? t("puzzle.edit.editPuzzle", "Edit puzzle")
            : t("puzzle.edit.addPuzzle", "Add puzzle")
        }
        onSubmit={onFormSubmit}
        submitting={disableForm}
      >
        <FormGroup
          as={Row}
          className="mb-3"
          controlId={`${idPrefix}-new-puzzle-title`}
        >
          <FormLabel column xs={3}>
            {t("puzzle.edit.title", "Title")}
          </FormLabel>
          <Col xs={9}>
            <FormControl
              type="text"
              autoFocus
              disabled={disableForm}
              onChange={onTitleChange}
              value={currentTitle}
            />
          </Col>
        </FormGroup>

        <FormGroup
          as={Row}
          className="mb-3"
          controlId={`${idPrefix}-new-puzzle-url`}
        >
          <FormLabel column xs={3}>
            {t("puzzle.edit.url", "URL")}
          </FormLabel>
          <Col xs={9}>
            <FormControl
              type="text"
              disabled={disableForm}
              onChange={onUrlChange}
              value={currentUrl}
            />
            {allowDuplicateUrlsCheckbox}
          </Col>
        </FormGroup>

        <hr />

        <FormGroup
          as={Row}
          className="mb-3"
          controlId={`${idPrefix}-new-puzzle-functional-tags`}
        >
          <FormLabel column xs={3}>
            {t("puzzle.edit.functionalTags", "Functional tags")}
          </FormLabel>
          <Col xs={9}>
            <Creatable
              inputId={`${idPrefix}-new-puzzle-functional-tags`}
              theme={theme.reactSelectTheme}
              options={functionalSelectOptions}
              isMulti
              placeholder={tagsPlaceholder}
              isDisabled={disableForm}
              onChange={onFunctionalTagsChange}
              value={currentFunctionalTags.map((t) => {
                return { label: t, value: t };
              })}
            />
            <FormText>
              <Trans
                i18nKey="puzzle.edit.functionalTagsHelp"
                t={t}
                defaults="Tags with a prefix, like <code>group:</code>, <code>meta-for:</code>, <code>priority:</code>, or <code>where:</code> (e.g. <code>priority:high</code>; <code>group:events</code>). A bare <code>stuck</code> counts as <code>is:stuck</code>."
                components={{ code: <code /> }}
              />
            </FormText>
          </Col>
        </FormGroup>

        <FormGroup
          as={Row}
          className="mb-3"
          controlId={`${idPrefix}-new-puzzle-content-tags`}
        >
          <FormLabel column xs={3}>
            {t("puzzle.edit.contentTags", "Content tags")}
          </FormLabel>
          <Col xs={9}>
            <Creatable
              inputId={`${idPrefix}-new-puzzle-content-tags`}
              theme={theme.reactSelectTheme}
              options={contentSelectOptions}
              isMulti
              placeholder={tagsPlaceholder}
              isDisabled={disableForm}
              onChange={onContentTagsChange}
              value={currentContentTags.map((t) => {
                return { label: t, value: t };
              })}
            />
            <FormText>
              <Trans
                i18nKey="puzzle.edit.contentTagsHelp"
                t={t}
                defaults="Tags that describe the mechanics, content, or skills involved (e.g. <code>cryptic</code>; <code>Pokémon</code>; <code>writing stuff</code>)"
                components={{ code: <code /> }}
              />
            </FormText>
          </Col>
        </FormGroup>

        <hr />

        {docTypeSelector}

        <FormGroup
          as={Row}
          className="mb-3"
          controlId={`${idPrefix}-new-puzzle-expected-answer-count`}
        >
          <FormLabel column xs={3}>
            {t("puzzle.edit.answerCount", "Expected # of answers")}
          </FormLabel>
          <Col xs={9}>
            <FormControl
              type="number"
              disabled={disableForm}
              onChange={onExpectedAnswerCountChange}
              value={currentExpectedAnswerCount}
              min={-1}
              step={1}
            />
            <FormText>
              <Trans
                i18nKey="puzzle.edit.answerCountHelp"
                t={t}
                defaults="For non-puzzle items, set to <code>0</code>. If the number of answers isn't known yet, set to <code>-1</code>: the puzzle won't show as solved until the count is corrected."
                components={{ code: <code /> }}
              />
            </FormText>
          </Col>
        </FormGroup>

        {currentExpectedAnswerCount === 0 ? (
          <FormCheck
            id={`${idPrefix}-solved-with-no-answers`}
            label={t(
              "puzzle.edit.considerSolvedWithNoAnswer",
              "Consider solved with no answers",
            )}
            type="checkbox"
            checked={currentConsiderCompletedWithNoAnswer}
            disabled={disableForm}
            onChange={onConsiderSolvedWithNoAnswerChange}
            className="mt-1"
          />
        ) : undefined}

        {allowLocked && (
          <>
            <hr />
            <FormGroup as={Row} className="mb-3">
              <Col xs={{ span: 9, offset: 3 }}>
                <FormCheck
                  id={`${idPrefix}-locked`}
                  label={t("puzzle.edit.locked", "Locked")}
                  type="checkbox"
                  checked={currentLocked}
                  disabled={disableForm}
                  onChange={onLockedChange}
                />
                <FormText>
                  {t(
                    "puzzle.edit.lockedHelp",
                    `A locked puzzle is one the team hasn't unlocked yet.
                    Members can register interest in it, and an operator
                    unlocks it here once it has been.`,
                  )}
                </FormText>
              </Col>
            </FormGroup>
            {currentLocked && (
              <FormGroup
                as={Row}
                className="mb-3"
                controlId={`${idPrefix}-locked-summary`}
              >
                <FormLabel column xs={3}>
                  {t("puzzle.edit.lockedSummary", "Locked summary")}
                </FormLabel>
                <Col xs={9}>
                  <FormControl
                    type="text"
                    disabled={disableForm}
                    onChange={onLockedSummaryChange}
                    value={currentLockedSummary}
                    placeholder={t(
                      "puzzle.edit.lockedSummaryPlaceholder",
                      "e.g. Pictures of two quizzes somewhere on campus",
                    )}
                  />
                </Col>
              </FormGroup>
            )}
          </>
        )}

        {submitState === PuzzleModalFormSubmitState.FAILED && (
          <Alert variant="danger">{errorMessage}</Alert>
        )}
      </ModalForm>
    </Suspense>
  );
};

export default PuzzleModalForm;
