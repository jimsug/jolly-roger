import { useTracker } from "meteor/react-meteor-data";
import { faArrowsLeftRight } from "@fortawesome/free-solid-svg-icons/faArrowsLeftRight";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons/faChevronDown";
import { faChevronUp } from "@fortawesome/free-solid-svg-icons/faChevronUp";
import { faEraser } from "@fortawesome/free-solid-svg-icons/faEraser";
import { faList } from "@fortawesome/free-solid-svg-icons/faList";
import { faTable } from "@fortawesome/free-solid-svg-icons/faTable";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type React from "react";
import {
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Accordion from "react-bootstrap/Accordion";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import ButtonToolbar from "react-bootstrap/ButtonToolbar";
import Container from "react-bootstrap/Container";
import type { FormControlProps } from "react-bootstrap/FormControl";
import FormControl from "react-bootstrap/FormControl";
import FormGroup from "react-bootstrap/FormGroup";
import FormLabel from "react-bootstrap/FormLabel";
import InputGroup from "react-bootstrap/InputGroup";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Table from "react-bootstrap/Table";
import ToggleButton from "react-bootstrap/ToggleButton";
import Tooltip from "react-bootstrap/Tooltip";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";
import styled, { css } from "styled-components";
import { indexedById } from "../../lib/listUtils";
import type {
  PuzzleNoteContentType,
  PuzzleType,
} from "../../lib/models/Puzzles";
import Puzzles from "../../lib/models/Puzzles";
import type { TagType } from "../../lib/models/Tags";
import Tags from "../../lib/models/Tags";
import puzzlesForPuzzleList from "../../lib/publications/puzzlesForPuzzleList";
import { computeSolvedness } from "../../lib/solvedness";
import { useBreadcrumb } from "../hooks/breadcrumb";
import {
  type NotesPageViewMode,
  useNotesPageShowSolved,
  useNotesPageViewMode,
} from "../hooks/persisted-state";
import useTypedSubscribe from "../hooks/useTypedSubscribe";
import {
  puzzlesMatchingSearchString,
  puzzlesMatchingSolvedFilter,
} from "../search";
import RelativeTime from "./RelativeTime";
import ResponsiveToggleButtonGroup from "./styling/ResponsiveToggleButtonGroup";
import TagList from "./TagList";

const NoteTable = styled(Table)`
  color: ${({ theme }) => theme.colors.text};
`;

const ControlsContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1rem;
  align-items: flex-end;
`;

const SearchFormGroup = styled(FormGroup)`
  flex-grow: 1;
  min-width: 250px;
`;

const NotesToolbar = styled.div`
  display: flex;
  justify-content: flex-end;
  margin-bottom: 0.5em;
`;

const StickyHeaderTable = styled(Table)`
  thead th {
    position: sticky;
    top: 0;
    z-index: 10;
    box-shadow: 0 2px 2px -1px ${({ theme }) => theme.colors.notesHeaderShadow};
    border-bottom: 2px solid ${({ theme }) => theme.colors.border};
  }
`;

const NotesTableHeader = styled.th<{ $width: string }>`
  width: ${({ $width }) => $width};
`;

const UpdatedCell = styled.td`
  min-width: 120px;
`;

const ExpandableContent = styled.div<{
  $expanded: boolean;
  $clickable: boolean;
}>`
  position: relative;
  ${(props) =>
    props.$clickable &&
    css`
      cursor: pointer;

      &:hover {
        background-color: rgb(128 128 128 / 10%);
      }
    `}

  ${(props) =>
    !props.$expanded &&
    css`
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    `}
`;

const ExpandButton = styled(Button)`
  padding: 0;
  font-size: 0.8rem;
  margin-top: 0.25rem;
  text-decoration: none;
  vertical-align: baseline;
`;

const PEEK_HOLD_MS = 300;

// Long note text is clamped to a few lines. A click expands it for good; a
// press-and-hold peeks at it until the mouse is released.
const ExpandableCell = ({ text }: { text: string | undefined }) => {
  const { t } = useTranslation();
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const [peeking, setPeeking] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useLayoutEffect(() => {
    const checkOverflow = () => {
      const element = contentRef.current;
      if (element && !expanded) {
        setIsOverflowing(element.scrollHeight > element.clientHeight);
      }
    };
    checkOverflow();
    window.addEventListener("resize", checkOverflow);
    return () => window.removeEventListener("resize", checkOverflow);
  }, [expanded, text]);

  const clearHoldTimer = useCallback(() => {
    if (holdTimer.current !== undefined) {
      clearTimeout(holdTimer.current);
      holdTimer.current = undefined;
    }
  }, []);

  const onMouseDown = useCallback(() => {
    if (expanded) {
      return;
    }
    holdTimer.current = setTimeout(() => {
      setPeeking(true);
      setExpanded(true);
    }, PEEK_HOLD_MS);
  }, [expanded]);

  const onMouseUp = useCallback(() => {
    clearHoldTimer();
    if (peeking) {
      setPeeking(false);
      setExpanded(false);
    } else {
      setExpanded((prev) => !prev);
    }
  }, [clearHoldTimer, peeking]);

  const onMouseLeave = useCallback(() => {
    clearHoldTimer();
    if (peeking) {
      setPeeking(false);
      setExpanded(false);
    }
  }, [clearHoldTimer, peeking]);

  const onButtonClick = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    setExpanded((prev) => !prev);
  }, []);

  if (!text) {
    return null;
  }

  const interactive = isOverflowing || expanded;

  const content = (
    <ExpandableContent
      ref={contentRef}
      $expanded={expanded}
      $clickable={interactive}
      onMouseDown={interactive ? onMouseDown : undefined}
      onMouseUp={interactive ? onMouseUp : undefined}
      onMouseLeave={interactive ? onMouseLeave : undefined}
    >
      {text}
    </ExpandableContent>
  );

  let tooltipText;
  if (!expanded) {
    tooltipText = (
      <>
        {t("notes.clickToExpand", "Click to expand")}
        <br />
        <em>{t("notes.holdToPeek", "Hold to peek")}</em>
      </>
    );
  } else if (peeking) {
    tooltipText = t("notes.releaseToCollapse", "Release to collapse");
  } else {
    tooltipText = t("notes.clickToCollapse", "Click to collapse");
  }

  return (
    <div>
      {interactive ? (
        <OverlayTrigger
          placement="top"
          overlay={<Tooltip id={`${id}-expand`}>{tooltipText}</Tooltip>}
        >
          {content}
        </OverlayTrigger>
      ) : (
        content
      )}
      {interactive && (
        <ExpandButton variant="link" size="sm" onClick={onButtonClick}>
          {expanded ? (
            <>
              {t("notes.showLess", "Show less")}{" "}
              <FontAwesomeIcon icon={faChevronUp} />
            </>
          ) : (
            <>
              {t("notes.showMore", "Show more")}{" "}
              <FontAwesomeIcon icon={faChevronDown} />
            </>
          )}
        </ExpandButton>
      )}
    </div>
  );
};

const NoteLink = ({ note }: { note: PuzzleNoteContentType }) => {
  if (!note.externalLinkUrl) {
    return null;
  }
  return (
    <a target="_blank" href={note.externalLinkUrl} rel="noreferrer noopener">
      {note.externalLinkText ?? note.externalLinkUrl}
    </a>
  );
};

const NoteUpdatedAt = ({ puzzle }: { puzzle: PuzzleType }) => {
  const { t } = useTranslation();
  if (!puzzle.noteUpdateTs) {
    return (
      <Badge bg="danger" pill>
        {t("notes.neverUpdated", "Never")}
      </Badge>
    );
  }
  return (
    <RelativeTime
      date={puzzle.noteUpdateTs}
      minimumUnit="minute"
      maxElements={2}
    />
  );
};

const SolvedBadge = () => {
  const { t } = useTranslation();
  return (
    <Badge pill bg="success" className="me-2">
      {t("notes.solved", "Solved")}
    </Badge>
  );
};

const stopPropagation = (event: React.MouseEvent) => {
  event.stopPropagation();
};

const NotesAccordionItem = ({
  puzzle,
  tags,
}: {
  puzzle: PuzzleType;
  tags: TagType[];
}) => {
  const { t } = useTranslation();
  const note = puzzle.noteContent;
  const eventKey = `puzzle-accordion-${puzzle._id}`;

  return (
    <Accordion defaultActiveKey={puzzle.noteUpdateTs ? eventKey : null}>
      <Accordion.Item eventKey={eventKey}>
        <Accordion.Header>
          {computeSolvedness(puzzle) === "solved" && <SolvedBadge />}
          <Link to={`../puzzles/${puzzle._id}`} onClick={stopPropagation}>
            {puzzle.title}
          </Link>
          <span className="ms-2">
            {puzzle.noteUpdateTs ? (
              <>
                : {t("notes.lastUpdated", "Last updated")}{" "}
                <NoteUpdatedAt puzzle={puzzle} />
              </>
            ) : (
              <em>: {t("notes.noNotesRecorded", "No notes recorded")}</em>
            )}
          </span>
        </Accordion.Header>
        <Accordion.Body>
          {note ? (
            <NoteTable striped variant="secondary" responsive hover bordered>
              <tbody>
                <tr>
                  <td>{t("notes.fields.flavor", "Flavor text")}</td>
                  <td>{note.flavor}</td>
                </tr>
                <tr>
                  <td>
                    {t(
                      "notes.fields.contactPerson",
                      "Who should people contact?",
                    )}
                  </td>
                  <td>{note.contactPerson}</td>
                </tr>
                <tr>
                  <td>{t("notes.fields.summary", "What's going on?")}</td>
                  <td>{note.summary}</td>
                </tr>
                <tr>
                  <td>{t("notes.fields.theories", "Theories")}</td>
                  <td>{note.theories}</td>
                </tr>
                <tr>
                  <td>
                    {t(
                      "notes.fields.externalLink",
                      "Any other solving location?",
                    )}
                  </td>
                  <td>
                    <NoteLink note={note} />
                  </td>
                </tr>
                <tr>
                  <td>{t("notes.fields.tags", "Tags")}</td>
                  <td>
                    <TagList
                      puzzle={puzzle}
                      tags={tags}
                      linkToSearch
                      popoverRelated={false}
                    />
                  </td>
                </tr>
              </tbody>
            </NoteTable>
          ) : (
            t("notes.noNotes", "No notes")
          )}
        </Accordion.Body>
      </Accordion.Item>
    </Accordion>
  );
};

const NotesAccordion = ({
  puzzles,
  tagIndex,
}: {
  puzzles: PuzzleType[];
  tagIndex: Map<string, TagType>;
}) => {
  return (
    <div>
      {puzzles.map((puzzle) => (
        <NotesAccordionItem
          key={puzzle._id}
          puzzle={puzzle}
          tags={tagsForPuzzle(puzzle, tagIndex)}
        />
      ))}
    </div>
  );
};

const NotesTable = ({
  puzzles,
  tagIndex,
}: {
  puzzles: PuzzleType[];
  tagIndex: Map<string, TagType>;
}) => {
  const { t } = useTranslation();
  return (
    // Not `responsive`, so the sticky header works against the window scroll
    <StickyHeaderTable striped bordered hover size="sm">
      <thead>
        <tr>
          <NotesTableHeader $width="140px">
            {t("notes.columns.updated", "Updated")}
          </NotesTableHeader>
          <NotesTableHeader $width="20%">
            {t("notes.columns.puzzle", "Puzzle")}
          </NotesTableHeader>
          <th>{t("notes.columns.summary", "Summary")}</th>
          <th>{t("notes.columns.theories", "Theories")}</th>
          <NotesTableHeader $width="10%">
            {t("notes.columns.contact", "Contact")}
          </NotesTableHeader>
          <NotesTableHeader $width="10%">
            {t("notes.columns.link", "Link")}
          </NotesTableHeader>
          <NotesTableHeader $width="15%">
            {t("notes.columns.tags", "Tags")}
          </NotesTableHeader>
        </tr>
      </thead>
      <tbody>
        {puzzles.map((puzzle) => {
          const note = puzzle.noteContent;
          return (
            <tr key={puzzle._id}>
              <UpdatedCell>
                <NoteUpdatedAt puzzle={puzzle} />
              </UpdatedCell>
              <td>
                {computeSolvedness(puzzle) === "solved" && (
                  <div className="mb-1">
                    <SolvedBadge />
                  </div>
                )}
                <Link to={`../puzzles/${puzzle._id}`}>{puzzle.title}</Link>
              </td>
              <td>
                <ExpandableCell text={note?.summary} />
              </td>
              <td>
                <ExpandableCell text={note?.theories} />
              </td>
              <td>{note?.contactPerson}</td>
              <td>{note && <NoteLink note={note} />}</td>
              <td>
                <TagList
                  puzzle={puzzle}
                  tags={tagsForPuzzle(puzzle, tagIndex)}
                  linkToSearch
                  popoverRelated={false}
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </StickyHeaderTable>
  );
};

function tagsForPuzzle(
  puzzle: PuzzleType,
  tagIndex: Map<string, TagType>,
): TagType[] {
  return puzzle.tags
    .map((tagId) => tagIndex.get(tagId))
    .filter((tag): tag is TagType => tag !== undefined);
}

// Every puzzle's notes (as posted by the sheet-side script), stalest first so
// the ones needing attention are at the top.
const NotesPage = () => {
  const huntId = useParams<"huntId">().huntId!;
  const { t } = useTranslation();
  const idPrefix = useId();

  useBreadcrumb({
    title: t("notes.breadcrumbTitle", "Notes"),
    path: `/hunts/${huntId}/notes`,
  });

  const puzzlesLoading = useTypedSubscribe(puzzlesForPuzzleList, { huntId });
  const loading = puzzlesLoading();

  const [viewMode, setViewMode] = useNotesPageViewMode();
  const [showSolved, setShowSolved] = useNotesPageShowSolved();
  const [searchString, setSearchString] = useState("");

  const allPuzzles = useTracker(
    () =>
      loading
        ? []
        : Puzzles.find(
            { hunt: huntId, kind: { $ne: "whiteboard" } },
            { sort: { noteUpdateTs: 1, createdAt: 1 } },
          ).fetch(),
    [huntId, loading],
  );
  const allTags = useTracker(
    () => (loading ? [] : Tags.find({ hunt: huntId }).fetch()),
    [huntId, loading],
  );
  const tagIndex = useMemo(() => indexedById(allTags), [allTags]);

  const setShowSolvedString = useCallback(
    (value: string) => {
      setShowSolved(value === "show");
    },
    [setShowSolved],
  );

  const setViewModeString = useCallback(
    (value: NotesPageViewMode) => {
      setViewMode(value);
    },
    [setViewMode],
  );

  const onSearchStringChange: NonNullable<FormControlProps["onChange"]> =
    useCallback((e) => {
      setSearchString(e.currentTarget.value);
    }, []);

  const clearSearch = useCallback(() => {
    setSearchString("");
  }, []);

  const shownPuzzles = useMemo(
    () =>
      puzzlesMatchingSolvedFilter(
        puzzlesMatchingSearchString(allPuzzles, allTags, searchString),
        showSolved,
      ),
    [allPuzzles, allTags, searchString, showSolved],
  );

  if (loading) {
    return <span>{t("common.loading", "loading")}...</span>;
  }

  return (
    <Container fluid={viewMode === "fullwidth"}>
      <h1>{t("notes.title", "Notes")}</h1>
      <ControlsContainer>
        <FormGroup>
          <FormLabel>{t("notes.puzzlesLabel", "Puzzles")}</FormLabel>
          <ButtonToolbar>
            <ResponsiveToggleButtonGroup
              type="radio"
              name="notes-show-solved"
              value={showSolved ? "show" : "hide"}
              onChange={setShowSolvedString}
            >
              <ToggleButton
                id={`${idPrefix}-solved-hide-button`}
                variant="outline-info"
                value="hide"
              >
                {t("notes.unsolvedOnly", "Unsolved")}
              </ToggleButton>
              <ToggleButton
                id={`${idPrefix}-solved-show-button`}
                variant="outline-info"
                value="show"
              >
                {t("notes.allPuzzles", "All")}
              </ToggleButton>
            </ResponsiveToggleButtonGroup>
          </ButtonToolbar>
        </FormGroup>

        <FormGroup>
          <FormLabel>{t("notes.viewLabel", "View")}</FormLabel>
          <ButtonToolbar>
            <ResponsiveToggleButtonGroup
              type="radio"
              name="notes-view-mode"
              value={viewMode}
              onChange={setViewModeString}
            >
              <ToggleButton
                id={`${idPrefix}-view-list-button`}
                variant="outline-info"
                value="list"
              >
                <FontAwesomeIcon icon={faList} /> {t("notes.viewList", "List")}
              </ToggleButton>
              <ToggleButton
                id={`${idPrefix}-view-table-button`}
                variant="outline-info"
                value="table"
              >
                <FontAwesomeIcon icon={faTable} />{" "}
                {t("notes.viewTable", "Table")}
              </ToggleButton>
              <ToggleButton
                id={`${idPrefix}-view-full-width-button`}
                variant="outline-info"
                value="fullwidth"
              >
                <FontAwesomeIcon icon={faArrowsLeftRight} />{" "}
                {t("notes.viewFullWidth", "Full width")}
              </ToggleButton>
            </ResponsiveToggleButtonGroup>
          </ButtonToolbar>
        </FormGroup>

        <SearchFormGroup controlId={`${idPrefix}-notes-search`}>
          <FormLabel>{t("common.search", "Search")}</FormLabel>
          <InputGroup>
            <FormControl
              as="input"
              type="text"
              placeholder={t(
                "notes.filterByPlaceholder",
                "Filter by title, answer, or tag",
              )}
              value={searchString}
              onChange={onSearchStringChange}
            />
            <Button variant="secondary" onClick={clearSearch}>
              <FontAwesomeIcon icon={faEraser} />
            </Button>
          </InputGroup>
        </SearchFormGroup>
      </ControlsContainer>

      <NotesToolbar>
        <div>
          {t(
            "notes.filteredPuzzleCountMessage",
            "Showing {{retainedCount}} of {{allPuzzlesCount}} items",
            {
              retainedCount: shownPuzzles.length,
              allPuzzlesCount: allPuzzles.length,
            },
          )}
        </div>
      </NotesToolbar>
      {viewMode === "list" ? (
        <NotesAccordion puzzles={shownPuzzles} tagIndex={tagIndex} />
      ) : (
        <NotesTable puzzles={shownPuzzles} tagIndex={tagIndex} />
      )}
    </Container>
  );
};

export default NotesPage;
