import { faExternalLinkAlt } from "@fortawesome/free-solid-svg-icons/faExternalLinkAlt";
import { faPuzzlePiece } from "@fortawesome/free-solid-svg-icons/faPuzzlePiece";
import { faSearch } from "@fortawesome/free-solid-svg-icons/faSearch";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import React, { useCallback, useId, useMemo, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Col from "react-bootstrap/Col";
import Form from "react-bootstrap/Form";
import Row from "react-bootstrap/Row";
import Spinner from "react-bootstrap/Spinner";
import Table from "react-bootstrap/Table";
import styled from "styled-components";
import type { TagSelectOption } from "./AddPageForm";
import { TagSelect } from "./AddPageForm";
import type { GdriveMimeTypesType, JollyRogerClient, Puzzle } from "./api";
import { HttpError } from "./api";

/** A link on the current page, as a row of the bulk add table. */
export interface PageLink {
  id: number;
  url: string;
  guessedTitle: string;
  checked: boolean;
  existingPuzzleUrl?: string;
}

interface BulkAddStatus {
  success: number;
  failed: number;
  errors: string[];
}

const LinkTableWrapper = styled.div`
  max-height: 300px;
  overflow-y: auto;
`;

const AddColumn = styled.th`
  width: 5%;
`;

const TitleColumn = styled.th`
  width: 45%;
`;

const UrlColumn = styled.th`
  width: 50%;
`;

interface BulkLinkRowProps {
  link: PageLink;
  saving: boolean;
  onCheckedChange: (linkId: number, checked: boolean) => void;
  onTitleChange: (linkId: number, title: string) => void;
}

const BulkLinkRow = ({
  link,
  saving,
  onCheckedChange,
  onTitleChange,
}: BulkLinkRowProps) => {
  const onCheckChange: React.ChangeEventHandler<HTMLInputElement> = useCallback(
    (event) => {
      onCheckedChange(link.id, event.target.checked);
    },
    [link.id, onCheckedChange],
  );

  const onGuessedTitleChange: React.ChangeEventHandler<HTMLInputElement> =
    useCallback(
      (event) => {
        onTitleChange(link.id, event.target.value);
      },
      [link.id, onTitleChange],
    );

  return (
    <tr>
      <td className="text-center">
        <Form.Check
          type="checkbox"
          checked={link.checked}
          disabled={saving || !link.url || !!link.existingPuzzleUrl}
          onChange={onCheckChange}
        />
      </td>
      <td>
        <Form.Control
          type="text"
          size="sm"
          value={link.guessedTitle}
          disabled={saving}
          onChange={onGuessedTitleChange}
        />
      </td>
      <td>
        <div className="text-truncate" title={link.url}>
          {link.existingPuzzleUrl ? (
            <a href={link.existingPuzzleUrl} target="_blank" rel="noreferrer">
              {link.url} <FontAwesomeIcon icon={faExternalLinkAlt} />
            </a>
          ) : (
            link.url
          )}
        </div>
      </td>
    </tr>
  );
};

interface BulkAddFormProps {
  client: JollyRogerClient;
  hunt: string;
  tagOptions: TagSelectOption[];
  initialLinks: PageLink[];
  linksError: string | undefined;
  saving: boolean;
  onSavingChange: (saving: boolean) => void;
}

const BulkAddForm = ({
  client,
  hunt,
  tagOptions,
  initialLinks,
  linksError,
  saving,
  onSavingChange,
}: BulkAddFormProps) => {
  const idPrefix = useId();

  const [pageLinks, setPageLinks] = useState<PageLink[]>(initialLinks);
  const [filter, setFilter] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [docType, setDocType] = useState<GdriveMimeTypesType>("spreadsheet");
  const [expectedAnswerCount, setExpectedAnswerCount] = useState<number>(1);
  const [isChecking, setIsChecking] = useState(false);
  const [checkCompleted, setCheckCompleted] = useState(false);
  const [checkError, setCheckError] = useState<string>();
  const [status, setStatus] = useState<BulkAddStatus | null>(null);

  const filteredLinks = useMemo(() => {
    if (!filter) return pageLinks;
    const lowerFilter = filter.toLowerCase();
    return pageLinks.filter(
      (l) =>
        l.guessedTitle.toLowerCase().includes(lowerFilter) ||
        l.url?.toLowerCase().includes(lowerFilter),
    );
  }, [pageLinks, filter]);

  const puzzlesToCreateCount = useMemo(() => {
    return filteredLinks.filter((l) => l.checked && !l.existingPuzzleUrl)
      .length;
  }, [filteredLinks]);

  const onFilterChange: React.ChangeEventHandler<HTMLInputElement> =
    useCallback((event) => {
      setFilter(event.target.value);
      setCheckCompleted(false);
    }, []);

  const onFilterKeyDown: React.KeyboardEventHandler<HTMLInputElement> =
    useCallback((event) => {
      // Enter would submit the form, creating every checked puzzle
      if (event.key === "Enter") {
        event.preventDefault();
      }
    }, []);

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

  const onLinkTitleChange = useCallback((linkId: number, newTitle: string) => {
    setPageLinks((links) =>
      links.map((l) =>
        l.id === linkId ? { ...l, guessedTitle: newTitle } : l,
      ),
    );
  }, []);

  const onLinkCheckedChange = useCallback(
    (linkId: number, checked: boolean) => {
      setPageLinks((links) =>
        links.map((l) => (l.id === linkId ? { ...l, checked } : l)),
      );
    },
    [],
  );

  const onCheck = useCallback(() => {
    setIsChecking(true);
    setCheckCompleted(false);
    setCheckError(undefined);
    void (async () => {
      try {
        const urlsToCheck = pageLinks.map((link) => link.url);
        if (urlsToCheck.length === 0) {
          return;
        }

        const existingPuzzlesMap = await client.findExistingPuzzlesByUrl(
          urlsToCheck,
          hunt,
        );

        setPageLinks((currentLinks) =>
          currentLinks.map((link) => {
            const existingUrl = existingPuzzlesMap[link.url];
            if (existingUrl) {
              return {
                ...link,
                checked: false, // Uncheck if it already exists
                existingPuzzleUrl: existingUrl,
              };
            }
            return { ...link, existingPuzzleUrl: undefined };
          }),
        );
        setCheckCompleted(true);
      } catch (error) {
        setCheckCompleted(false);
        setCheckError(
          error instanceof HttpError
            ? `Unable to check for duplicates: ${error.message}.`
            : "Unable to check for duplicates.",
        );
      } finally {
        setIsChecking(false);
      }
    })();
  }, [client, pageLinks, hunt]);

  const onBulkAdd: React.SubmitEventHandler<HTMLFormElement> = useCallback(
    (e: React.SubmitEvent<HTMLFormElement>) => {
      e.preventDefault();
      onSavingChange(true);
      setStatus(null);

      const puzzlesToCreate = filteredLinks.filter(
        (l) => l.checked && l.url && !l.existingPuzzleUrl,
      );

      void (async () => {
        const results = await Promise.allSettled(
          puzzlesToCreate.map((link) => {
            const puzzle: Puzzle = {
              title: link.guessedTitle,
              url: link.url,
              tags,
              expectedAnswerCount,
              docType,
              allowDuplicateUrls: true, // Always allow for bulk add
            };
            return client.addPuzzle(hunt, puzzle);
          }),
        );

        const successCount = results.filter(
          (r) => r.status === "fulfilled",
        ).length;
        const failedCount = results.length - successCount;
        const errors = results
          .filter((r): r is PromiseRejectedResult => r.status === "rejected")
          .map((r) =>
            r.reason instanceof Error ? r.reason.message : String(r.reason),
          );

        setStatus({ success: successCount, failed: failedCount, errors });
        onSavingChange(false);
      })();
    },
    [
      client,
      hunt,
      filteredLinks,
      tags,
      docType,
      expectedAnswerCount,
      onSavingChange,
    ],
  );

  return (
    <Form onSubmit={onBulkAdd}>
      <Alert variant="warning" className="mb-3">
        <Alert.Heading>Duplicates allowed</Alert.Heading>
        This tool does not prevent the creation of puzzles with duplicate URLs.
        Use the &quot;Check for duplicates&quot; button below to identify
        existing puzzles first.
      </Alert>
      {linksError && <Alert variant="danger">{linksError}</Alert>}
      <Form.Group as={Row} className="mb-3" controlId={`${idPrefix}-tags`}>
        <Form.Label column xs={3}>
          Tags
        </Form.Label>
        <Col xs={9}>
          <TagSelect
            inputId={`${idPrefix}-tags`}
            options={tagOptions}
            tags={tags}
            disabled={saving}
            onTagsChange={setTags}
          />
        </Col>
      </Form.Group>
      <Form.Group as={Row} className="mb-3" controlId={`${idPrefix}-doc-type`}>
        <Form.Label column xs={3}>
          Document type
        </Form.Label>
        <Col xs={9}>
          <Form.Select
            defaultValue={docType}
            onChange={onDocTypeChange}
            disabled={saving}
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
            disabled={saving}
            onChange={onExpectedAnswerCountChange}
            value={expectedAnswerCount}
            min={0}
            step={1}
          />
        </Col>
      </Form.Group>
      <hr />
      <Form.Group className="mb-3" controlId={`${idPrefix}-filter`}>
        <Form.Label>Filter links</Form.Label>
        <Form.Control
          type="text"
          placeholder="Filter by title or URL"
          onChange={onFilterChange}
          onKeyDown={onFilterKeyDown}
          value={filter}
          disabled={saving}
        />
      </Form.Group>
      <Form.Group className="mb-3 d-flex align-items-center">
        <Button
          variant="secondary"
          onClick={onCheck}
          disabled={isChecking || filteredLinks.length === 0}
        >
          <Spinner
            as="span"
            animation="border"
            size="sm"
            aria-hidden="true"
            hidden={!isChecking}
          />{" "}
          <FontAwesomeIcon icon={faSearch} /> Check for duplicates
        </Button>
        {checkCompleted && !isChecking && (
          <span className="ms-2 text-success">✔ Current links checked</span>
        )}
      </Form.Group>
      {checkError && <Alert variant="danger">{checkError}</Alert>}
      <LinkTableWrapper>
        <Table striped bordered hover size="sm">
          <thead>
            <tr>
              <AddColumn>Add</AddColumn>
              <TitleColumn>Title</TitleColumn>
              <UrlColumn>URL</UrlColumn>
            </tr>
          </thead>
          <tbody>
            {filteredLinks.map((link) => (
              <BulkLinkRow
                key={link.id}
                link={link}
                saving={saving}
                onCheckedChange={onLinkCheckedChange}
                onTitleChange={onLinkTitleChange}
              />
            ))}
          </tbody>
        </Table>
      </LinkTableWrapper>
      {status && (
        <Alert
          variant={status.failed > 0 ? "warning" : "success"}
          className="mt-3"
        >
          <Alert.Heading>Bulk add complete</Alert.Heading>
          <p>
            Successfully created {status.success} puzzles.
            <br />
            Failed to create {status.failed} puzzles.
          </p>
          {status.errors.length > 0 && <hr />}
          {status.errors.map((err, i) => (
            <div key={i}>
              <small>{err}</small>
            </div>
          ))}
        </Alert>
      )}
      <Form.Group className="mt-3 text-end">
        {saving && <FontAwesomeIcon icon={faPuzzlePiece} spin />}
        <Button variant="light" onClick={window.close} disabled={saving}>
          Close
        </Button>
        <Button
          type="submit"
          className="ms-2"
          disabled={saving || puzzlesToCreateCount === 0}
        >
          Create all checked ({puzzlesToCreateCount})
        </Button>
      </Form.Group>
    </Form>
  );
};

export default BulkAddForm;
