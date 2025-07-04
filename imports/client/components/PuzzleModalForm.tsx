import { Meteor } from "meteor/meteor";
import React, {
  Suspense,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { FormText } from "react-bootstrap";
import Alert from "react-bootstrap/Alert";
import Col from "react-bootstrap/Col";
import FormCheck from "react-bootstrap/FormCheck";
import type { FormControlProps } from "react-bootstrap/FormControl";
import FormControl from "react-bootstrap/FormControl";
import FormGroup from "react-bootstrap/FormGroup";
import FormLabel from "react-bootstrap/FormLabel";
import Row from "react-bootstrap/Row";
import type { ActionMeta } from "react-select";
import { useTheme } from "styled-components";
import type { GdriveMimeTypesType } from "../../lib/GdriveMimeTypes";
import type { PuzzleType } from "../../lib/models/Puzzles";
import type { TagType } from "../../lib/models/Tags";
import LabelledRadioGroup from "./LabelledRadioGroup";
import Loading from "./Loading";
import type { ModalFormHandle } from "./ModalForm";
import ModalForm from "./ModalForm";

// Casting away the React.lazy because otherwise we lose access to the generic parameter
const Creatable = React.lazy(
  () => import("react-select/creatable"),
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
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
}

enum PuzzleModalFormSubmitState {
  IDLE = "idle",
  SUBMITTING = "submitting",
  FAILED = "failed",
}

export type PuzzleModalFormHandle = {
  show: () => void;
  populateForm: (data: {
    title: string;
    url: string;
    tagIds: string[] | null;
  }) => void;
  submitForm: () => void;
};

const PuzzleModalForm = React.forwardRef(
  (
    {
      huntId,
      puzzle,
      tags: propsTags,
      onSubmit,
      showOnMount,
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
    },
    forwardedRef: React.Ref<PuzzleModalFormHandle>,
  ) => {
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

    const [title, setTitle] = useState<string>(puzzle?.title ?? "");
    const [url, setUrl] = useState<string>(puzzle?.url ?? "");
    const [tags, setTags] = useState<string[]>(
      puzzle ? tagNamesForIds(puzzle.tags) : [],
    );
    const [functionTags, setFunctionTags] = useState<string[]>(
      puzzle ? tags.filter((x) => x.includes(":")) : [],
    );
    const [contentTags, setContentTags] = useState<string[]>(
      puzzle ? tags.filter((x) => !x.includes(":")) : [],
    );
    const [docType, setDocType] = useState<GdriveMimeTypesType | undefined>(
      puzzle ? undefined : "spreadsheet",
    );
    const [expectedAnswerCount, setExpectedAnswerCount] = useState<number>(
      puzzle ? puzzle.expectedAnswerCount : 1,
    );
    const [allowDuplicateUrls, setAllowDuplicateUrls] = useState<
      boolean | undefined
    >(puzzle ? undefined : false);
    const [submitState, setSubmitState] = useState<PuzzleModalFormSubmitState>(
      PuzzleModalFormSubmitState.IDLE,
    );
    const [errorMessage, setErrorMessage] = useState<string>("");
    const [titleDirty, setTitleDirty] = useState<boolean>(false);
    const [lastAutoPopulatedTitle, setLastAutoPopulatedTitle] =
      useState<string>("");
    const [urlDirty, setUrlDirty] = useState<boolean>(false);
    const [tagsDirty, setTagsDirty] = useState<boolean>(false);
    const [expectedAnswerCountDirty, setExpectedAnswerCountDirty] =
      useState<boolean>(false);

    const formRef = useRef<ModalFormHandle>(null);

    const onTitleChange: NonNullable<FormControlProps["onChange"]> =
      useCallback((event) => {
        setTitle(event.currentTarget.value);
        setTitleDirty(true);
      }, []);

    const onUrlChange: NonNullable<FormControlProps["onChange"]> = useCallback(
      (event) => {
        setUrl(event.currentTarget.value);
        setUrlDirty(true);
      },
      [],
    );

    const onFunctionTagsChange = useCallback(
      (
        value: readonly TagSelectOption[],
        action: ActionMeta<TagSelectOption>,
      ) => {
        let newTags: string[] = [];
        switch (action.action) {
          case "clear":
          case "deselect-option":
          case "pop-value":
          case "remove-value":
          case "select-option":
            newTags = value.map((v) => v.value);
            break;
          case "create-option":
            newTags = value.map((v) => v.label);
            break;
          default:
            return;
        }

        setFunctionTags(newTags);
        setTags(contentTags.concat(newTags));
        setTagsDirty(true);
      },
      [contentTags],
    );

    const onContentTagsChange = useCallback(
      (
        value: readonly TagSelectOption[],
        action: ActionMeta<TagSelectOption>,
      ) => {
        let newTags = [];
        switch (action.action) {
          case "clear":
          case "deselect-option":
          case "pop-value":
          case "remove-value":
          case "select-option":
            newTags = value.map((v) => v.value);
            break;
          case "create-option":
            newTags = value.map((v) => v.label);
            break;
          default:
            return;
        }

        setContentTags(newTags);
        setTags(functionTags.concat(newTags));
        setTagsDirty(true);
      },
      [functionTags],
    );

    const onDocTypeChange = useCallback((newValue: string) => {
      setDocType(newValue as GdriveMimeTypesType);
    }, []);

    const onExpectedAnswerCountChange: NonNullable<
      FormControlProps["onChange"]
    > = useCallback((event) => {
      const string = event.currentTarget.value;
      const value = Number(string);
      setExpectedAnswerCount(value);
      setExpectedAnswerCountDirty(true);
    }, []);

    const onAllowDuplicateUrlsChange = useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) => {
        setAllowDuplicateUrls(event.currentTarget.checked);
      },
      [],
    );

    const onFormSubmit = useCallback(
      (callback: () => void) => {
        setSubmitState(PuzzleModalFormSubmitState.SUBMITTING);
        const payload: PuzzleModalFormSubmitPayload = {
          huntId,
          title,
          url: url !== "" ? url : undefined, // Make sure we send undefined if url is falsy
          tags,
          expectedAnswerCount,
        };
        if (docType) {
          payload.docType = docType;
        }
        if (allowDuplicateUrls) {
          payload.allowDuplicateUrls = allowDuplicateUrls;
        }
        onSubmit(payload, (error) => {
          if (error) {
            if (
              error instanceof Meteor.Error &&
              typeof error.error === "number" &&
              error.error === 409
            ) {
              setErrorMessage(
                "A puzzle already exists with this URL - did someone else already add this" +
                  ' puzzle? To force creation anyway, check the "Allow puzzles with identical' +
                  ' URLs" box above and try again.',
              );
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
            window.location.hash = "";
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
      ],
    );

    const show = useCallback(() => {
      if (formRef.current) {
        formRef.current.show();
      }
    }, []);

    const currentTitle = useMemo(() => {
      if (!titleDirty && puzzle) {
        return puzzle.title;
      } else {
        return title;
      }
    }, [titleDirty, puzzle, title]);

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

    const currentExpectedAnswerCount = useMemo(() => {
      if (!expectedAnswerCountDirty && puzzle) {
        return puzzle.expectedAnswerCount;
      } else {
        return expectedAnswerCount;
      }
    }, [expectedAnswerCountDirty, puzzle, expectedAnswerCount]);

    useImperativeHandle(forwardedRef, () => ({
      show,
      populateForm: (data: {
        title: string;
        url: string;
        tagIds: string[] | null;
      }) => {
        setTitle(data.title);
        setUrl(data.url);
        if (data.tagIds) {
          const preTags = tagNamesForIds([...new Set(data.tagIds)]);
          setTags(preTags);
          setContentTags(preTags.filter((x) => !x.includes(":")));
          setFunctionTags(preTags.filter((x) => x.includes(":")));
        }
      },
      submitForm: () => {
        if (formRef.current) {
          formRef.current.submit();
        }
      },
    }));

    useEffect(() => {
      if (showOnMount) {
        show();
      }
    }, [showOnMount, show]);

    const disableForm = submitState === PuzzleModalFormSubmitState.SUBMITTING;

    const selectOptions: TagSelectOption[] = [
      ...propsTags.map((t) => t.name),
      ...tags,
    ]
      .filter(Boolean)
      .map((t) => {
        return { value: t, label: t };
      })
      .sort((a, b) => {
        const aLower = a.label.toLowerCase();
        const bLower = b.label.toLowerCase();
        return aLower.localeCompare(bLower);
      });

    const functionSelectOptions: TagSelectOption[] = selectOptions.filter((x) =>
      x.label.includes(":"),
    );
    const contentSelectOptions: TagSelectOption[] = selectOptions.filter(
      (x) => !x.label.includes(":"),
    );

    const docTypeSelector =
      !puzzle && docType ? (
        <FormGroup as={Row} className="mb-3">
          <FormLabel column xs={3} htmlFor="jr-new-puzzle-doc-type">
            Document type
          </FormLabel>
          <Col xs={9}>
            <LabelledRadioGroup
              header=""
              name="jr-new-puzzle-doc-type"
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
              help=""
              onChange={onDocTypeChange}
            />
            <FormText>
              You can attach other documents later, but this one will be opened
              by default.
            </FormText>
          </Col>
        </FormGroup>
      ) : null;

    useEffect(() => {
      // This tries to guess the puzzle title based on the URL entered
      // To keep things simple, we only populate the title if the title
      // is currently blank,
      try {
        const urlObject = new URL(url);
        const pathname = urlObject.pathname.replace(/^\/|\/$/g, "");
        if (!pathname) return;
        const pathParts = pathname.split("/");
        const lastPart = pathParts[pathParts.length - 1] ?? "";
        const decodedLastPart = decodeURI(lastPart);
        const formattedTitle = (
          decodedLastPart.includes("_")
            ? decodedLastPart.replace(/_/g, " ")
            : decodedLastPart.replace(/-/g, " ")
        ).replace(
          /\w\S*/g,
          (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase(),
        );

        if (title === lastAutoPopulatedTitle || title === "") {
          setTitle(formattedTitle);
          setTitleDirty(false);
        }
        setLastAutoPopulatedTitle(formattedTitle);
      } catch (error) {
        // console.debug("Invalid URL, probably there's no URL:", error);
      }
    }, [url]);

    const allowDuplicateUrlsCheckbox =
      !puzzle && typeof allowDuplicateUrls === "boolean" ? (
        <FormCheck
          label="Allow puzzles with identical URLs"
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
          ref={formRef}
          title={puzzle ? "Edit puzzle" : "Add puzzle"}
          onSubmit={onFormSubmit}
          submitDisabled={disableForm}
        >
          <FormGroup as={Row} className="mb-3">
            <FormLabel column xs={3} htmlFor="jr-new-puzzle-title">
              Title
            </FormLabel>
            <Col xs={9}>
              <FormControl
                id="jr-new-puzzle-title"
                type="text"
                autoFocus
                disabled={disableForm}
                onChange={onTitleChange}
                value={currentTitle}
              />
            </Col>
          </FormGroup>

          <FormGroup as={Row} className="mb-3">
            <FormLabel column xs={3} htmlFor="jr-new-puzzle-url">
              URL
            </FormLabel>
            <Col xs={9}>
              <FormControl
                id="jr-new-puzzle-url"
                type="text"
                disabled={disableForm}
                onChange={onUrlChange}
                value={currentUrl}
              />
              {allowDuplicateUrlsCheckbox}
            </Col>
          </FormGroup>
          <hr />
          <FormGroup as={Row} className="mb-3">
            <FormLabel column xs={3} htmlFor="jr-new-puzzle-tags-function">
              Functional Tags
            </FormLabel>
            <Col xs={9}>
              <Creatable
                theme={theme.reactSelectTheme}
                id="jr-new-puzzle-tags"
                options={functionSelectOptions}
                isMulti
                placeholder="Type to search/create"
                isDisabled={disableForm}
                onChange={onFunctionTagsChange}
                value={functionTags.map((t) => {
                  return { label: t, value: t };
                })}
              />
              <FormText>
                Tags with a prefix, like <code>group:</code>,{" "}
                <code>meta-for:</code>, <code>priority:</code>, or{" "}
                <code>where:</code> (e.g. <code>priority:high</code>;{" "}
                <code>where:Sydney</code>)
              </FormText>
            </Col>
          </FormGroup>

          <FormGroup as={Row} className="mb-3">
            <FormLabel column xs={3} htmlFor="jr-new-puzzle-tags-content">
              Content Tags
            </FormLabel>
            <Col xs={9}>
              <Creatable
                theme={theme.reactSelectTheme}
                id="jr-new-puzzle-tags"
                options={contentSelectOptions}
                isMulti
                placeholder="Type to search/create"
                isDisabled={disableForm}
                onChange={onContentTagsChange}
                value={contentTags.map((t) => {
                  return { label: t, value: t };
                })}
              />
              <FormText>
                Tags that describe the mechanics, content, or skills (e.g.{" "}
                <code>cryptic</code>; <code>Pokémon</code>;{" "}
                <code>writing stuff</code>)
              </FormText>
            </Col>
          </FormGroup>
          <hr />

          {docTypeSelector}

          <FormGroup as={Row} className="mb-3">
            <FormLabel
              column
              xs={3}
              htmlFor="jr-new-puzzle-expected-answer-count"
            >
              Expected # of answers
            </FormLabel>
            <Col xs={9}>
              <FormControl
                id="jr-new-puzzle-expected-answer-count"
                type="number"
                disabled={disableForm}
                onChange={onExpectedAnswerCountChange}
                value={currentExpectedAnswerCount}
                min={-1}
                step={1}
              />
              <FormText>
                For non-puzzle items, set to <code>0</code>. If answer count is
                unknown, set to <code>-1</code>.
              </FormText>
            </Col>
          </FormGroup>

          {submitState === PuzzleModalFormSubmitState.FAILED && (
            <Alert variant="danger">{errorMessage}</Alert>
          )}
        </ModalForm>
      </Suspense>
    );
  },
);

export default PuzzleModalForm;
