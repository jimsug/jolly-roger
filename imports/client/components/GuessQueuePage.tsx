import { Meteor } from "meteor/meteor";
import { useTracker } from "meteor/react-meteor-data";
import { faCopy } from "@fortawesome/free-solid-svg-icons/faCopy";
import { faEraser } from "@fortawesome/free-solid-svg-icons/faEraser";
import { faPuzzlePiece } from "@fortawesome/free-solid-svg-icons/faPuzzlePiece";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import React, { useCallback, useId, useMemo, useRef, useState } from "react";
import Button from "react-bootstrap/Button";
import ButtonToolbar from "react-bootstrap/ButtonToolbar";
import type { FormControlProps } from "react-bootstrap/FormControl";
import FormControl from "react-bootstrap/FormControl";
import FormGroup from "react-bootstrap/FormGroup";
import FormLabel from "react-bootstrap/FormLabel";
import InputGroup from "react-bootstrap/InputGroup";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import ToggleButton from "react-bootstrap/ToggleButton";
import ToggleButtonGroup from "react-bootstrap/ToggleButtonGroup";
import Tooltip from "react-bootstrap/Tooltip";
import { useTranslation } from "react-i18next";
import { Link, useParams, useSearchParams } from "react-router";
import styled, { css } from "styled-components";
import { calendarTimeFormat } from "../../lib/calendarTimeFormat";
import type { GuessQueueFilterableState } from "../../lib/guessQueueFilter";
import guessShownInQueue, {
  GUESS_QUEUE_FILTERABLE_STATES,
} from "../../lib/guessQueueFilter";
import { indexedById } from "../../lib/listUtils";
import type { GuessType } from "../../lib/models/Guesses";
import Guesses from "../../lib/models/Guesses";
import type { HuntType } from "../../lib/models/Hunts";
import Hunts from "../../lib/models/Hunts";
import type { PuzzleType } from "../../lib/models/Puzzles";
import Puzzles from "../../lib/models/Puzzles";
import { userMayUpdateGuessesForHunt } from "../../lib/permission_stubs";
import guessesForGuessQueue from "../../lib/publications/guessesForGuessQueue";
import setGuessState from "../../methods/setGuessState";
import { guessURL } from "../../model-helpers";
import { useBreadcrumb } from "../hooks/breadcrumb";
import useFocusRefOnFindHotkey from "../hooks/useFocusRefOnFindHotkey";
import useTypedSubscribe from "../hooks/useTypedSubscribe";
import indexedDisplayNames from "../indexedDisplayNames";
import { compileGuessMatcher } from "../search";
import CopyToClipboardButton from "./CopyToClipboardButton";
import GuessState from "./GuessState";
import {
  formatGuessDirection,
  GuessConfidenceBadge,
  GuessDirectionBadge,
} from "./guessDetails";
import Markdown from "./Markdown";
import PuzzleAnswer from "./PuzzleAnswer";
import Breakable from "./styling/Breakable";
import type { Breakpoint } from "./styling/responsive";
import { mediaBreakpointDown } from "./styling/responsive";

const compactViewBreakpoint: Breakpoint = "md";

const StyledToggleButtonGroup = styled(ToggleButtonGroup)`
  @media (width < 360px) {
    width: 100%;
  }
`;

const StyledTable = styled.div<{ $hasGuessQueue: boolean }>`
  display: grid;
  grid-template-columns:
    [timestamp] auto
    [submitter] minmax(auto, 8em)
    [puzzle] minmax(10em, auto)
    [answer] minmax(10em, auto)
    ${(props) => props.$hasGuessQueue && "[direction] minmax(6em, auto)"}
    ${(props) => props.$hasGuessQueue && "[confidence] minmax(6em, auto)"}
    [status] auto
    ${(props) => props.$hasGuessQueue && "[actions] auto"};
  border-bottom: 1px solid #ddd;
  ${mediaBreakpointDown(
    compactViewBreakpoint,
    css`
      grid-template-columns: 100%;
    `,
  )}
`;

const StyledHeaderRow = styled.div`
  display: contents;
`;

const StyledHeader = styled.div`
  position: sticky;
  top: 0;
  background-color: ${({ theme }) => theme.colors.background};
  font-weight: bold;
  ${mediaBreakpointDown(
    compactViewBreakpoint,
    css`
      display: none;
    `,
  )}
`;

const StyledRow = styled.div<{ $state: GuessType["state"] }>`
  display: contents;
  margin-bottom: 8px;
  background-color: ${({ theme, $state }) => theme.colors.guess[$state].background};

  &::before {
    content: " ";
    border-top: 1px solid #ddd;
    grid-column: 1 / -1;
  }

  :hover {
    background-color: ${({ theme, $state }) =>
      theme.colors.guess[$state].hoverBackground};
  }
`;

const StyledCell = styled.div`
  overflow: hidden;
  padding: 4px;
  background-color: inherit;
`;

const StyledCopyToClipboardButton = styled(CopyToClipboardButton)`
  padding: 0;
  vertical-align: baseline;
`;

const StyledPuzzleTimestampAndSubmitter = styled.div`
  display: contents;
  background-color: inherit;
  ${mediaBreakpointDown(
    compactViewBreakpoint,
    css`
      padding: 4px;
      display: flex;

      & > * {
        padding: 0;
      }
    `,
  )}
`;

const StyledPuzzleTimestamp = styled(StyledCell)`
  ${mediaBreakpointDown(
    compactViewBreakpoint,
    css`
      ::after {
        content: " submitted by ";
        white-space: pre;
      }
    `,
  )}
`;

const StyledPuzzleCell = styled(StyledCell)`
  display: flex;
  align-items: start;
  ${mediaBreakpointDown(
    compactViewBreakpoint,
    css`
      &::before {
        content: "Puzzle: ";
        white-space: pre;
      }
    `,
  )}
`;

const StyledGuessCell = styled(StyledCell)`
  display: flex;
  align-items: start;
  overflow: hidden;
  ${mediaBreakpointDown(
    compactViewBreakpoint,
    css`
      &::before {
        content: "Guess: ";
        white-space: pre;
      }
    `,
  )}
`;

const StyledGuessDetails = styled.div`
  display: contents;
  background-color: inherit;
  ${mediaBreakpointDown(
    compactViewBreakpoint,
    css`
      display: flex;
    `,
  )}
`;

const StyledAdditionalNotes = styled(StyledCell)`
  grid-column: 1 / -1;
  overflow: hidden;

  p {
    margin-bottom: 0;
  }
`;

const GuessBlock = React.memo(
  ({
    canEdit,
    hunt,
    guess,
    createdByDisplayName,
    puzzle,
  }: {
    canEdit: boolean;
    hunt: HuntType;
    guess: GuessType;
    createdByDisplayName: string;
    puzzle: PuzzleType;
  }) => {
    const markPending = useCallback(() => {
      setGuessState.call({ guessId: guess._id, state: "pending" });
    }, [guess._id]);

    const idPrefix = useId();

    const { t, i18n } = useTranslation();

    const puzzleTooltip = (
      <Tooltip id={`${idPrefix}-puzzle-tooltip`}>
        {t("guessQueue.openPuzzleTooltip", "Open original puzzle")}
      </Tooltip>
    );
    const discussionTooltip = (
      <Tooltip id={`${idPrefix}-discussion-tooltip`}>
        {t("guessQueue.openDiscussionTooltip", "Open Jolly Roger discussion")}
      </Tooltip>
    );
    const requeueTooltip = (
      <Tooltip id={`${idPrefix}-requeue-tooltip`}>
        {t("guessQueue.returnToQueueTooltip", "Return this guess to the queue")}
      </Tooltip>
    );
    return (
      <StyledRow $state={guess.state}>
        <StyledPuzzleTimestampAndSubmitter>
          <StyledPuzzleTimestamp>
            {calendarTimeFormat(guess.createdAt, t, i18n.language)}
          </StyledPuzzleTimestamp>
          <StyledCell>
            <Breakable>{createdByDisplayName}</Breakable>
          </StyledCell>
        </StyledPuzzleTimestampAndSubmitter>
        <StyledPuzzleCell>
          <OverlayTrigger placement="top" overlay={puzzleTooltip}>
            <a
              href={guessURL(hunt, puzzle)}
              target="_blank"
              rel="noopener noreferrer"
              aria-labelledby={`${idPrefix}-puzzle-tooltip`}
            >
              <FontAwesomeIcon icon={faPuzzlePiece} />
            </a>
          </OverlayTrigger>{" "}
          <OverlayTrigger placement="top" overlay={discussionTooltip}>
            <Link to={`/hunts/${puzzle.hunt}/puzzles/${puzzle._id}`}>
              <Breakable>{puzzle.title}</Breakable>
            </Link>
          </OverlayTrigger>
        </StyledPuzzleCell>
        <StyledGuessCell>
          <StyledCopyToClipboardButton
            variant="link"
            aria-label="Copy"
            text={guess.guess}
          >
            <FontAwesomeIcon icon={faCopy} />
          </StyledCopyToClipboardButton>
          <PuzzleAnswer answer={guess.guess} breakable indented />
        </StyledGuessCell>
        {hunt.hasGuessQueue && (
          <StyledGuessDetails>
            <StyledCell>
              <GuessDirectionBadge value={guess.direction} />
            </StyledCell>
            <StyledCell>
              {/* A legacy guess with no confidence recorded reads as low
                  here (the guess history and toast read it as medium) */}
              <GuessConfidenceBadge value={guess.confidence ?? 0} />
            </StyledCell>
          </StyledGuessDetails>
        )}
        <StyledCell>
          <GuessState state={guess.state} />
        </StyledCell>
        {hunt.hasGuessQueue && (
          <StyledCell>
            {canEdit && guess.state !== "pending" && (
              <OverlayTrigger placement="top" overlay={requeueTooltip}>
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={markPending}
                >
                  {t("guessQueue.returnToQueue", "Re-queue")}
                </Button>
              </OverlayTrigger>
            )}
          </StyledCell>
        )}
        {guess.additionalNotes && (
          <Markdown as={StyledAdditionalNotes} text={guess.additionalNotes} />
        )}
      </StyledRow>
    );
  },
);

const GuessQueuePage = () => {
  const huntId = useParams<"huntId">().huntId!;
  const [searchParams, setSearchParams] = useSearchParams();
  const searchString = searchParams.get("q") ?? "";
  // Which non-pending states to list; pending guesses are always shown
  const [shownStates, setShownStates] = useState<GuessQueueFilterableState[]>([
    ...GUESS_QUEUE_FILTERABLE_STATES,
  ]);

  const guessesLoading = useTypedSubscribe(guessesForGuessQueue, { huntId });
  const loading = guessesLoading();

  const { t } = useTranslation();

  const data = useTracker(() => {
    if (loading) {
      return undefined;
    }
    const hunt = Hunts.findOne({ _id: huntId });
    return {
      hunt,
      guesses: Guesses.find(
        { hunt: huntId },
        { sort: { createdAt: -1 } },
      ).fetch(),
      puzzles: indexedById(Puzzles.find({ hunt: huntId }).fetch()),
      displayNames: indexedDisplayNames(),
      canEdit: userMayUpdateGuessesForHunt(Meteor.user(), hunt),
    };
  }, [huntId, loading]);
  const hunt = data?.hunt;

  const pageTitle = useMemo(() => {
    if (!hunt) {
      return `${t("common.loading", "loading")}...`;
    } else if (hunt.hasGuessQueue) {
      return t("guessQueue.title.guess", "Guess queue");
    } else {
      return t("guessQueue.title.answer", "Answer log");
    }
  }, [hunt, t]);

  useBreadcrumb({ title: pageTitle, path: `/hunts/${huntId}/guesses` });

  const searchBarRef = useRef<HTMLInputElement>(null);
  useFocusRefOnFindHotkey(searchBarRef);

  const setSearchString = useCallback(
    (val: string) => {
      const u = new URLSearchParams(searchParams);
      if (val) {
        u.set("q", val);
      } else {
        u.delete("q");
      }
      setSearchParams(u);
    },
    [searchParams, setSearchParams],
  );

  const onSearchStringChange: NonNullable<FormControlProps["onChange"]> =
    useCallback(
      (e) => {
        setSearchString(e.currentTarget.value);
      },
      [setSearchString],
    );

  const clearSearch = useCallback(() => {
    setSearchString("");
  }, [setSearchString]);

  const filteredGuesses = useMemo(() => {
    if (!data) {
      return [];
    }
    const searchKeys = searchString.split(" ").filter((key) => key.length > 0);
    const matchesSearch =
      searchKeys.length > 0
        ? compileGuessMatcher(data.puzzles, data.displayNames, searchKeys)
        : () => true;
    return data.guesses.filter(
      (guess) =>
        data.puzzles.has(guess.puzzle) &&
        guessShownInQueue(guess, shownStates) &&
        matchesSearch(guess),
    );
  }, [data, searchString, shownStates]);

  const idPrefix = useId();

  if (!data || !hunt) {
    return <div>{t("common.loading", "loading")}...</div>;
  }

  const directionTooltip = (
    <Tooltip id={`${idPrefix}-direction-tooltip`}>
      Direction this puzzle was solved, ranging from completely backsolved (
      {formatGuessDirection(-10)}) to completely forward solved (
      {formatGuessDirection(10)})
    </Tooltip>
  );
  const confidenceTooltip = (
    <Tooltip id={`${idPrefix}-confidence-tooltip`}>
      {t(
        "tableHeader.confidenceTooltip",
        "Submitter-estimated likelihood that this answer is correct",
      )}
    </Tooltip>
  );

  return (
    <div>
      <h1>{pageTitle}</h1>
      <FormGroup className="mb-3" controlId={`${idPrefix}-guess-search`}>
        <InputGroup>
          <FormControl
            as="input"
            type="text"
            ref={searchBarRef}
            placeholder={t("guessQueue.filterBy", "Filter by title or answer")}
            value={searchString}
            onChange={onSearchStringChange}
          />
          <Button variant="secondary" onClick={clearSearch}>
            <FontAwesomeIcon icon={faEraser} />
          </Button>
        </InputGroup>
      </FormGroup>
      <FormGroup className="mb-3">
        <FormLabel>
          {t("guessQueue.stateFilter.label", "Guesses to show")}
        </FormLabel>
        <ButtonToolbar>
          <StyledToggleButtonGroup
            type="checkbox"
            value={shownStates}
            onChange={setShownStates}
          >
            <ToggleButton
              id={`${idPrefix}-state-filter-correct`}
              variant="outline-success"
              value="correct"
            >
              {t("guessQueue.stateFilter.correct", "Correct")}
            </ToggleButton>
            <ToggleButton
              id={`${idPrefix}-state-filter-intermediate`}
              variant="outline-warning"
              value="intermediate"
            >
              {t("guessQueue.stateFilter.intermediate", "Intermediate")}
            </ToggleButton>
            <ToggleButton
              id={`${idPrefix}-state-filter-incorrect`}
              variant="outline-danger"
              value="incorrect"
            >
              {t("guessQueue.stateFilter.incorrect", "Incorrect")}
            </ToggleButton>
            <ToggleButton
              id={`${idPrefix}-state-filter-rejected`}
              variant="outline-secondary"
              value="rejected"
            >
              {t("guessQueue.stateFilter.rejected", "Rejected")}
            </ToggleButton>
          </StyledToggleButtonGroup>
        </ButtonToolbar>
      </FormGroup>
      <StyledTable $hasGuessQueue={hunt.hasGuessQueue}>
        <StyledHeaderRow>
          <StyledHeader>
            {t("guessQueue.tableHeader.time", "Time")}
          </StyledHeader>
          <StyledHeader>
            {t("guessQueue.tableHeader.submitter", "Submitter")}
          </StyledHeader>
          <StyledHeader>
            {t("guessQueue.tableHeader.puzzle", "Puzzle")}
          </StyledHeader>
          <StyledHeader>
            {t("guessQueue.tableHeader.answer", "Answer")}
          </StyledHeader>
          {hunt.hasGuessQueue && (
            <>
              <OverlayTrigger placement="top" overlay={directionTooltip}>
                <StyledHeader>
                  {t("guessQueue.tableHeader.direction", "Direction")}
                </StyledHeader>
              </OverlayTrigger>
              <OverlayTrigger placement="top" overlay={confidenceTooltip}>
                <StyledHeader>
                  {t("guessQueue.tableHeader.confidence", "Confidence")}
                </StyledHeader>
              </OverlayTrigger>
            </>
          )}
          <StyledHeader>
            {t("guessQueue.tableHeader.status", "Status")}
          </StyledHeader>
          {hunt.hasGuessQueue && <StyledHeader>&nbsp;</StyledHeader>}
        </StyledHeaderRow>
        {filteredGuesses.map((guess) => {
          return (
            <GuessBlock
              key={guess._id}
              hunt={hunt}
              guess={guess}
              createdByDisplayName={
                data.displayNames.get(guess.createdBy) ?? "???"
              }
              puzzle={data.puzzles.get(guess.puzzle)!}
              canEdit={data.canEdit}
            />
          );
        })}
      </StyledTable>
    </div>
  );
};

export default GuessQueuePage;
