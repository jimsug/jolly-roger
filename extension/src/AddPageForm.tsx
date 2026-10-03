import { faExternalLinkAlt } from "@fortawesome/free-solid-svg-icons/faExternalLinkAlt";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import React, { useCallback, useEffect, useId, useMemo, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Col from "react-bootstrap/Col";
import Form from "react-bootstrap/Form";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Row from "react-bootstrap/Row";
import Spinner from "react-bootstrap/Spinner";
import Tooltip from "react-bootstrap/Tooltip";
import type { ActionMeta, MultiValue } from "react-select";
import Creatable from "react-select/creatable";
import styled from "styled-components";
import type { GdriveMimeTypesType, JollyRogerClient, Puzzle } from "./api";
import { HttpError } from "./api";
import { storedRecentTags } from "./storage";

export type TagSelectOption = { value: string; label: string };

/** A puzzle the form created, for the popup's status dialog. */
export interface CreatedPuzzle {
  puzzleId: string;
  title: string;
}

interface TagSelectProps {
  inputId: string;
  options: TagSelectOption[];
  tags: string[];
  disabled: boolean;
  onTagsChange: (tags: string[]) => void;
}

/** The tag picker on both the add page and bulk add forms. */
export const TagSelect = ({
  inputId,
  options,
  tags,
  disabled,
  onTagsChange,
}: TagSelectProps) => {
  const value = useMemo(
    () => tags.map((tag) => ({ label: tag, value: tag })),
    [tags],
  );

  const onChange = useCallback(
    (
      newValue: MultiValue<TagSelectOption>,
      action: ActionMeta<TagSelectOption>,
    ) => {
      switch (action.action) {
        case "clear":
        case "create-option":
        case "deselect-option":
        case "pop-value":
        case "remove-value":
        case "select-option":
          onTagsChange(newValue.map((v) => v.value));
          break;
        default:
          break;
      }
    },
    [onTagsChange],
  );

  return (
    <Creatable
      inputId={inputId}
      options={options}
      isMulti
      isDisabled={disabled}
      onChange={onChange}
      value={value}
    />
  );
};

interface RecentTagButtonProps {
  tag: string;
  onTagClicked: (tag: string) => void;
}

const RecentTagButton = ({ tag, onTagClicked }: RecentTagButtonProps) => {
  const onClick = useCallback(() => {
    onTagClicked(tag);
  }, [tag, onTagClicked]);

  return (
    <Button variant="link" size="sm" onClick={onClick}>
      {tag}
    </Button>
  );
};

const UrlCol = styled(Col)`
  position: relative;
`;

const UrlCheckSpinner = styled(Spinner)`
  position: absolute;
  right: 20px;
  top: 8px;
`;

interface AddPageFormProps {
  client: JollyRogerClient;
  hunt: string;
  tagOptions: TagSelectOption[];
  loadingTags: boolean;
  initialRecentTags: string[];
  initialTitle: string;
  url: string;
  saving: boolean;
  onSavingChange: (saving: boolean) => void;
  onResult: (result: CreatedPuzzle | Error) => void;
}

const AddPageForm = ({
  client,
  hunt,
  tagOptions,
  loadingTags,
  initialRecentTags,
  initialTitle,
  url,
  saving,
  onSavingChange,
  onResult,
}: AddPageFormProps) => {
  const idPrefix = useId();

  const [title, setTitle] = useState<string>(initialTitle);
  const [recentTags, setRecentTags] = useState<string[]>(initialRecentTags);
  const [tags, setTags] = useState<string[]>([]);
  const [allowDuplicateUrls, setAllowDuplicateUrls] = useState<boolean>(false);
  const [docType, setDocType] = useState<GdriveMimeTypesType>("spreadsheet");
  const [expectedAnswerCount, setExpectedAnswerCount] = useState<number>(1);

  const [isCheckingUrl, setIsCheckingUrl] = useState<boolean>(false);
  const [existingPuzzleUrl, setExistingPuzzleUrl] = useState<
    string | undefined
  >();
  const [checkError, setCheckError] = useState<string>();

  const disableForm = loadingTags || saving;

  // Check whether the hunt already has a puzzle with this URL.
  useEffect(() => {
    if (!url || !hunt) {
      return;
    }

    setIsCheckingUrl(true);
    setExistingPuzzleUrl(undefined);
    setCheckError(undefined);
    void (async () => {
      try {
        const [existingPuzzle] = await client.findPuzzlesByUrl(url, hunt);
        if (existingPuzzle) {
          setExistingPuzzleUrl(existingPuzzle.jollyRogerUrl);
        }
      } catch (error) {
        // A 404 only means there's nothing to find
        if (!(error instanceof HttpError && error.getStatus() === 404)) {
          setCheckError(
            error instanceof HttpError
              ? `Unable to check for an existing puzzle with this URL: ${error.message}.`
              : "Unable to check for an existing puzzle with this URL.",
          );
        }
      } finally {
        setIsCheckingUrl(false);
      }
    })();
  }, [client, url, hunt]);

  const onTitleChange: React.ChangeEventHandler<HTMLInputElement> = useCallback(
    (event) => {
      setTitle(event.target.value);
    },
    [],
  );

  const onAllowDuplicateUrlsChange: React.ChangeEventHandler<HTMLInputElement> =
    useCallback((event) => {
      setAllowDuplicateUrls(event.target.checked);
    }, []);

  const addTag = useCallback(
    (tag: string) => {
      setTags([...tags, tag]);
    },
    [tags],
  );

  const onDocTypeChange: React.ChangeEventHandler<HTMLSelectElement> =
    useCallback((event) => {
      setDocType(event.currentTarget.value as GdriveMimeTypesType);
    }, []);

  const onExpectedAnswerCountChange: React.ChangeEventHandler<HTMLInputElement> =
    useCallback((event) => {
      const string = event.currentTarget.value;
      const value = Number(string);
      setExpectedAnswerCount(value);
    }, []);

  const addPuzzle: React.SubmitEventHandler<HTMLFormElement> = useCallback(
    (e: React.SubmitEvent<HTMLFormElement>) => {
      e.preventDefault();
      onSavingChange(true);
      const puzzle: Puzzle = {
        title,
        url,
        tags,
        expectedAnswerCount,
        docType,
        allowDuplicateUrls,
      };
      void (async () => {
        let puzzleId: string;
        try {
          puzzleId = await client.addPuzzle(hunt, puzzle);
        } catch (error) {
          let errorMsg: string;
          if (error instanceof HttpError) {
            if (error.getStatus() === 409) {
              errorMsg =
                "A puzzle already exists with this URL - did someone else already add this " +
                'puzzle? To force creation anyway, check the "Allow puzzles with identical URLs" ' +
                "box and try again.";
            } else {
              errorMsg = `Unable to create puzzle: ${error.message}.`;
            }
          } else {
            errorMsg = `Unable to create puzzle.`;
          }
          onResult(new Error(errorMsg));
          onSavingChange(false);
          return;
        }

        setRecentTags(await storedRecentTags.put(tags));
        onResult({ puzzleId, title });
        onSavingChange(false);
      })();
    },
    [
      client,
      hunt,
      title,
      url,
      tags,
      expectedAnswerCount,
      docType,
      allowDuplicateUrls,
      onSavingChange,
      onResult,
    ],
  );

  return (
    <Form onSubmit={addPuzzle}>
      {existingPuzzleUrl && (
        <Alert variant="info">
          A puzzle with this URL already exists.{" "}
          <a href={existingPuzzleUrl} target="_blank" rel="noreferrer">
            View existing puzzle <FontAwesomeIcon icon={faExternalLinkAlt} />
          </a>
        </Alert>
      )}
      {checkError && <Alert variant="warning">{checkError}</Alert>}
      <Form.Group as={Row} className="mb-3" controlId={`${idPrefix}-title`}>
        <Form.Label column xs={3}>
          Title
        </Form.Label>
        <Col xs={9}>
          <Form.Control
            type="text"
            onChange={onTitleChange}
            value={title}
            disabled={disableForm}
          />
        </Col>
      </Form.Group>
      <Form.Group as={Row} className="mb-3" controlId={`${idPrefix}-url`}>
        <Form.Label column xs={3}>
          URL
        </Form.Label>
        <UrlCol xs={9}>
          <Form.Control type="text" disabled readOnly defaultValue={url} />
          {isCheckingUrl && <UrlCheckSpinner animation="border" size="sm" />}
          <Form.Check
            id={`${idPrefix}-allow-duplicate-urls`}
            label="Allow puzzles with identical URLs"
            type="checkbox"
            className="mt-1"
            onChange={onAllowDuplicateUrlsChange}
            disabled={disableForm}
          />
        </UrlCol>
      </Form.Group>

      <Form.Group as={Row} className="mb-3" controlId={`${idPrefix}-tags`}>
        <Form.Label column xs={3}>
          Tags
        </Form.Label>
        <Col xs={9}>
          <TagSelect
            inputId={`${idPrefix}-tags`}
            options={tagOptions}
            tags={tags}
            disabled={disableForm}
            onTagsChange={setTags}
          />
          {recentTags.map((recentTag) => {
            return (
              <RecentTagButton
                key={recentTag}
                tag={recentTag}
                onTagClicked={addTag}
              />
            );
          })}
        </Col>
      </Form.Group>

      <Form.Group as={Row} className="mb-3" controlId={`${idPrefix}-doc-type`}>
        <Form.Label column xs={3}>
          Document type{" "}
          <OverlayTrigger
            overlay={
              <Tooltip>
                This can&apos;t be changed once a puzzle has been created.
                Unless you&apos;re absolutely sure, use a spreadsheet. We only
                expect to use documents for administrivia.
              </Tooltip>
            }
          >
            <span>(?)</span>
          </OverlayTrigger>
        </Form.Label>
        <Col xs={9}>
          <Form.Select
            defaultValue={docType}
            onChange={onDocTypeChange}
            disabled={disableForm}
          >
            <option value="spreadsheet">Spreadsheet</option>
            <option value="document">Document</option>
          </Form.Select>
        </Col>
      </Form.Group>

      <Form.Group
        as={Row}
        className="mb-3"
        controlId={`${idPrefix}-expected-answer-count`}
      >
        <Form.Label column xs={3}>
          Expected # of answers
        </Form.Label>
        <Col xs={9}>
          <Form.Control
            type="number"
            disabled={disableForm}
            onChange={onExpectedAnswerCountChange}
            value={expectedAnswerCount}
            min={0}
            step={1}
          />
        </Col>
      </Form.Group>
      <Form.Group className="mt-3 text-end">
        <Button variant="light" onClick={window.close} disabled={disableForm}>
          Close
        </Button>
        <Button
          type="submit"
          className="ms-2"
          disabled={disableForm || (!!existingPuzzleUrl && !allowDuplicateUrls)}
        >
          Save
        </Button>
      </Form.Group>
    </Form>
  );
};

export default AddPageForm;
