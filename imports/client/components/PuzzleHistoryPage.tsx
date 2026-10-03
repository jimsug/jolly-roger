import { Meteor } from "meteor/meteor";
import { useTracker } from "meteor/react-meteor-data";
import { faCircleQuestion as faCircleQuestionRegular } from "@fortawesome/free-regular-svg-icons/faCircleQuestion";
import { faBan } from "@fortawesome/free-solid-svg-icons/faBan";
import { faCaretDown } from "@fortawesome/free-solid-svg-icons/faCaretDown";
import { faCaretRight } from "@fortawesome/free-solid-svg-icons/faCaretRight";
import { faCircleQuestion } from "@fortawesome/free-solid-svg-icons/faCircleQuestion";
import { faMessage } from "@fortawesome/free-solid-svg-icons/faMessage";
import { faPencil } from "@fortawesome/free-solid-svg-icons/faPencil";
import { faPhone } from "@fortawesome/free-solid-svg-icons/faPhone";
import { faSortDown } from "@fortawesome/free-solid-svg-icons/faSortDown";
import { faSortUp } from "@fortawesome/free-solid-svg-icons/faSortUp";
import { faStar } from "@fortawesome/free-solid-svg-icons/faStar";
import { faThumbsDown } from "@fortawesome/free-solid-svg-icons/faThumbsDown";
import { faThumbsUp } from "@fortawesome/free-solid-svg-icons/faThumbsUp";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type React from "react";
import { useCallback, useId, useMemo, useState } from "react";
import FormControl from "react-bootstrap/FormControl";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Table from "react-bootstrap/Table";
import Tooltip from "react-bootstrap/Tooltip";
import { Trans, useTranslation } from "react-i18next";
import { Link } from "react-router";
import Select from "react-select";
import styled, { css, useTheme } from "styled-components";
import { calendarTimeFormat } from "../../lib/calendarTimeFormat";
import CallActivities from "../../lib/models/CallActivities";
import ChatMessages from "../../lib/models/ChatMessages";
import DocumentActivities from "../../lib/models/DocumentActivities";
import Puzzles from "../../lib/models/Puzzles";
import Tags from "../../lib/models/Tags";
import nodeIsMention from "../../lib/nodeIsMention";
import activitySummaryForUser from "../../lib/publications/activitySummaryForUser";
import puzzleHistoryForUser from "../../lib/publications/puzzleHistoryForUser";
import puzzleHistorySummaryForUser from "../../lib/publications/puzzleHistorySummaryForUser";
import {
  ACTIVITY_KINDS,
  GRAPHED_ACTIVITY_KINDS,
  type GraphedActivityKind,
  type PuzzleHistoryItem,
} from "../../lib/puzzleHistory";
import type { Solvedness } from "../../lib/solvedness";
import ActivityHistorySummaries from "../ActivityHistorySummaries";
import { useBreadcrumb } from "../hooks/breadcrumb";
import useDocumentTitle from "../hooks/useDocumentTitle";
import useTypedSubscribe from "../hooks/useTypedSubscribe";
import PuzzleHistorySummaries from "../PuzzleHistorySummaries";
import type { ActivityItem } from "./ContributionGraph";
import ContributionGraph from "./ContributionGraph";
import { mediaBreakpointDown } from "./styling/responsive";
import TagList from "./TagList";

const PuzzleHistoryTR = styled.tr<{ $solvedness: Solvedness }>`
  cursor: pointer;
  background-color: ${({ theme, $solvedness }) =>
    theme.colors.solvedness[$solvedness]};
`;

const FilterBar = styled.div`
  margin-bottom: 1rem;
  display: flex;
  flex-wrap: wrap;
`;

const FilterSection = styled.div<{ $grow?: boolean; $minWidth?: string }>`
  margin-right: 1rem;
  margin-bottom: 0.5rem;
  min-width: ${({ $minWidth }) => $minWidth ?? "150px"};
  flex-grow: ${({ $grow }) => ($grow ? 1 : 0)};

  &:last-child {
    margin-right: 0;
  }
`;

const NoHistoryMessage = styled.td`
  text-align: center;
  font-style: italic;
`;

const InteractionItem = styled.span<{ $active: boolean }>`
  margin-right: 0.5em;
  color: ${({ theme, $active }) =>
    $active ? theme.colors.historyActiveInteraction : theme.colors.secondary};
  white-space: nowrap;

  &:last-child {
    margin-right: 0;
  }
`;

const InteractionCount = styled.span`
  margin-left: 0.2em;
  font-size: 0.8em;

  ${mediaBreakpointDown(
    "md",
    css`
      display: none;
    `,
  )}
`;

const SortableHeader = styled.th`
  cursor: pointer;
`;

// Gives keyboard users something to focus in a clickable row or header cell.
// It has no handler of its own: its click, from a mouse or from Enter or
// Space, bubbles up to the row's or cell's.
const CellButton = styled.button`
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  text-align: inherit;
`;

type SelectOption = { value: string; label: string };

// The interaction filter: each kind of activity, plus correct guesses
const INTERACTION_TYPES = [...ACTIVITY_KINDS, "correctGuess"] as const;
type InteractionType = (typeof INTERACTION_TYPES)[number];

const isInteractionType = (value: string): value is InteractionType =>
  INTERACTION_TYPES.some((type) => type === value);

const isGraphedActivityKind = (kind: string): kind is GraphedActivityKind =>
  GRAPHED_ACTIVITY_KINDS.some((graphed) => graphed === kind);

const PuzzleInteractionSpan = ({
  item,
}: {
  item: Pick<
    PuzzleHistoryItem,
    | "bookmarkCounter"
    | "callCounter"
    | "documentCounter"
    | "chatCounter"
    | "guessCounter"
    | "correctGuessCounter"
  >;
}) => {
  const { t } = useTranslation();
  const tooltipId = useId();
  const yes = t("common.yes", "Yes");
  const no = t("common.no", "No");
  const yesNo = (count: number) => (count > 0 ? yes : no);

  const tooltip = (
    <Tooltip id={tooltipId}>
      <div>
        {t("history.interactions.bookmarked", "Bookmarked")}:{" "}
        {yesNo(item.bookmarkCounter)}
      </div>
      <div>
        {t("history.interactions.call", "Voice chat")}:{" "}
        {yesNo(item.callCounter)}
      </div>
      <div>
        {t("history.interactions.chat", "Text chat")}: {yesNo(item.chatCounter)}
      </div>
      <div>
        {t("history.interactions.document", "Edited the sheet")}:{" "}
        {yesNo(item.documentCounter)}
      </div>
      <div>
        {t("history.interactions.guess", "Submitted a guess")}:{" "}
        {yesNo(item.guessCounter)}
      </div>
      <div>
        {t("history.interactions.correctGuess", "Submitted a correct guess")}:{" "}
        {yesNo(item.correctGuessCounter)}
      </div>
    </Tooltip>
  );

  return (
    <OverlayTrigger placement="top" overlay={tooltip}>
      <span>
        <InteractionItem $active={item.bookmarkCounter > 0}>
          <FontAwesomeIcon icon={faStar} />
        </InteractionItem>
        <InteractionItem $active={item.callCounter > 0}>
          <FontAwesomeIcon icon={faPhone} />
          <InteractionCount>{item.callCounter}</InteractionCount>
        </InteractionItem>
        <InteractionItem $active={item.documentCounter > 0}>
          <FontAwesomeIcon icon={faPencil} />
          <InteractionCount>{item.documentCounter}</InteractionCount>
        </InteractionItem>
        <InteractionItem $active={item.chatCounter > 0}>
          <FontAwesomeIcon icon={faMessage} />
          <InteractionCount>{item.chatCounter}</InteractionCount>
        </InteractionItem>
        <InteractionItem $active={item.guessCounter > 0}>
          <FontAwesomeIcon
            icon={
              item.correctGuessCounter > 0
                ? faCircleQuestion
                : faCircleQuestionRegular
            }
          />
          <InteractionCount>
            {item.correctGuessCounter}/{item.guessCounter}
          </InteractionCount>
        </InteractionItem>
      </span>
    </OverlayTrigger>
  );
};

// Everything the user did on one puzzle, with a per-puzzle activity graph
const PuzzleDetail = ({
  historyItem,
  userId,
  timezoneOffset,
}: {
  historyItem: PuzzleHistoryItem;
  userId: string;
  timezoneOffset: number;
}) => {
  const { t } = useTranslation();
  const { puzzleId } = historyItem;
  const detailLoading = useTypedSubscribe(puzzleHistoryForUser, { puzzleId });
  const loading = detailLoading();

  const {
    puzzle,
    tags,
    sentMessages,
    mentions,
    callActivities,
    documentActivities,
  } = useTracker(() => {
    if (loading) {
      return {
        puzzle: undefined,
        tags: [],
        sentMessages: [],
        mentions: 0,
        callActivities: [],
        documentActivities: [],
      };
    }
    const messages = ChatMessages.find({ puzzle: puzzleId }).fetch();
    return {
      puzzle: Puzzles.findOne(puzzleId),
      tags: Tags.find({}).fetch(),
      sentMessages: messages.filter((m) => m.sender === userId),
      mentions: messages.filter((m) =>
        m.content.children.some(
          (child) => nodeIsMention(child) && child.userId === userId,
        ),
      ).length,
      callActivities: CallActivities.find({
        call: puzzleId,
        user: userId,
      }).fetch(),
      documentActivities: DocumentActivities.find({
        puzzle: puzzleId,
        user: userId,
      }).fetch(),
    };
  }, [loading, puzzleId, userId]);

  const contributions: ActivityItem[] = [
    ...sentMessages.map((m) => ({
      dayOfWeek: m.timestamp.getUTCDay(),
      hour: m.timestamp.getUTCHours(),
      count: 1,
      type: t("history.activityType.chat", "Chat"),
    })),
    ...callActivities.map((c) => ({
      dayOfWeek: c.ts.getUTCDay(),
      hour: c.ts.getUTCHours(),
      count: 1,
      type: t("history.activityType.call", "Call"),
    })),
    ...documentActivities.map((d) => ({
      dayOfWeek: d.ts.getUTCDay(),
      hour: d.ts.getUTCHours(),
      count: 1,
      type: t("history.activityType.document", "Document"),
    })),
  ];

  let guessLine = null;
  if (historyItem.guessCounter > 0) {
    guessLine = (
      <li>
        {historyItem.correctGuessCounter > 0 ? (
          <Trans
            i18nKey="history.detail.guessesWithCorrect"
            t={t}
            count={historyItem.guessCounter}
            values={{ correct: historyItem.correctGuessCounter }}
            defaults="You submitted <strong>{{count}} guesses</strong> (<strong>{{correct}} correct</strong>)"
            components={{ strong: <strong /> }}
          />
        ) : (
          <Trans
            i18nKey="history.detail.guesses"
            t={t}
            count={historyItem.guessCounter}
            defaults="You submitted <strong>{{count}} guesses</strong>"
            components={{ strong: <strong /> }}
          />
        )}
      </li>
    );
  }

  return (
    <tr>
      <td colSpan={8}>
        {loading ? (
          `${t("common.loading", "loading")}...`
        ) : (
          <>
            <ul>
              {sentMessages.length > 0 && (
                <li>
                  <Trans
                    i18nKey="history.detail.sentMessages"
                    t={t}
                    count={sentMessages.length}
                    defaults="You sent <strong>{{count}} messages</strong>"
                    components={{ strong: <strong /> }}
                  />
                </li>
              )}
              {mentions > 0 && (
                <li>
                  <Trans
                    i18nKey="history.detail.mentionedIn"
                    t={t}
                    count={mentions}
                    defaults="You were mentioned in <strong>{{count}} messages</strong>"
                    components={{ strong: <strong /> }}
                  />
                </li>
              )}
              {historyItem.documentCounter > 0 && (
                <li>
                  <Trans
                    i18nKey="history.detail.editedDocument"
                    t={t}
                    count={historyItem.documentCounter}
                    defaults="You edited the sheet <strong>{{count}} times</strong>"
                    components={{ strong: <strong /> }}
                  />
                </li>
              )}
              {guessLine}
            </ul>
            <strong>{t("history.columns.tags", "Tags")}</strong>
            <p>
              {puzzle ? (
                <TagList
                  puzzle={puzzle}
                  popoverRelated={false}
                  tags={tags.filter((tag) => puzzle.tags.includes(tag._id))}
                  emptyMessage={t(
                    "history.detail.noTags",
                    "This puzzle has no tags",
                  )}
                  linkToSearch={false}
                />
              ) : (
                t("history.detail.noTags", "This puzzle has no tags")
              )}
            </p>
            {contributions.length > 0 && (
              <ContributionGraph
                data={contributions}
                timezoneOffset={timezoneOffset}
                title={t(
                  "history.detail.graphTitle",
                  "Your activity on this puzzle",
                )}
                showCount
              />
            )}
          </>
        )}
      </td>
    </tr>
  );
};

const PuzzleHistoryRow = ({
  historyItem,
  userId,
  timezoneOffset,
}: {
  historyItem: PuzzleHistoryItem;
  userId: string;
  timezoneOffset: number;
}) => {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const [showDetail, setShowDetail] = useState(false);
  const toggleDetail = useCallback(() => {
    setShowDetail((shown) => !shown);
  }, []);

  const solvednessDisplay = {
    solved: {
      icon: faThumbsUp,
      color: theme.colors.historySolvedIcon,
      label: t("history.solvedness.solved", "Solved"),
    },
    unsolved: {
      icon: faThumbsDown,
      color: theme.colors.secondary,
      label: t("history.solvedness.unsolved", "Unsolved"),
    },
    noAnswers: {
      icon: faBan,
      color: theme.colors.secondary,
      label: t("history.solvedness.noAnswers", "No answers"),
    },
  }[historyItem.solvedness];

  const notAvailable = t("history.notAvailable", "N/A");

  return (
    <>
      <PuzzleHistoryTR
        $solvedness={historyItem.solvedness}
        onClick={toggleDetail}
      >
        <td>
          <CellButton
            type="button"
            aria-expanded={showDetail}
            aria-label={t("history.detail.toggle", "Details")}
          >
            <FontAwesomeIcon icon={showDetail ? faCaretDown : faCaretRight} />
          </CellButton>
        </td>
        <td>
          <Link to={`/hunts/${historyItem.huntId}/`}>
            {historyItem.huntName}
          </Link>
        </td>
        <td>
          <Link
            to={
              historyItem.whiteboard
                ? `/hunts/${historyItem.huntId}/whiteboard`
                : `/hunts/${historyItem.huntId}/puzzles/${historyItem.puzzleId}`
            }
          >
            {historyItem.name}
          </Link>
        </td>
        <td>{historyItem.answers.join(", ")}</td>
        <td>
          <FontAwesomeIcon
            icon={solvednessDisplay.icon}
            color={solvednessDisplay.color}
            aria-label={solvednessDisplay.label}
          />
        </td>
        <td>
          {historyItem.firstInteraction
            ? calendarTimeFormat(historyItem.firstInteraction, t, i18n.language)
            : notAvailable}
        </td>
        <td>
          {historyItem.lastInteraction
            ? calendarTimeFormat(historyItem.lastInteraction, t, i18n.language)
            : notAvailable}
        </td>
        <td>
          <PuzzleInteractionSpan item={historyItem} />
        </td>
      </PuzzleHistoryTR>
      {showDetail && (
        <PuzzleDetail
          historyItem={historyItem}
          userId={userId}
          timezoneOffset={timezoneOffset}
        />
      )}
    </>
  );
};

type SortColumn = keyof Pick<
  PuzzleHistoryItem,
  "huntName" | "name" | "solvedness" | "firstInteraction" | "lastInteraction"
>;
type SortDirection = "asc" | "desc";

const compareValues = (
  a: string | Date | undefined,
  b: string | Date | undefined,
): number => {
  // Missing dates sort after everything else
  if (a === undefined || b === undefined) {
    if (a === b) return 0;
    return a === undefined ? 1 : -1;
  }
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() - b.getTime();
  }
  return String(a).localeCompare(String(b));
};

const SortableHeaderCell = ({
  column,
  label,
  sortColumn,
  sortDirection,
  onSort,
}: {
  column: SortColumn;
  label: string;
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  onSort: (column: SortColumn) => void;
}) => {
  const sort = useCallback(() => onSort(column), [onSort, column]);
  const sorted = sortColumn === column;
  let ariaSort: "ascending" | "descending" | undefined;
  if (sorted) {
    ariaSort = sortDirection === "asc" ? "ascending" : "descending";
  }

  return (
    <SortableHeader aria-sort={ariaSort} onClick={sort}>
      <CellButton type="button">
        {label}
        {sorted && (
          <span>
            {" "}
            <FontAwesomeIcon
              icon={sortDirection === "asc" ? faSortUp : faSortDown}
            />
          </span>
        )}
      </CellButton>
    </SortableHeader>
  );
};

const PuzzleHistoryTable = ({ userId }: { userId: string }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  // The graphs come in UTC and are shifted into the browser's timezone (in
  // hours, fractional for a half-hour zone; the graph rounds)
  const timezoneOffset = useMemo(
    () => new Date().getTimezoneOffset() / -60,
    [],
  );

  const activityLoading = useTypedSubscribe(activitySummaryForUser);
  const historyLoading = useTypedSubscribe(puzzleHistorySummaryForUser);
  const loading = historyLoading();

  const [sortColumn, setSortColumn] = useState<SortColumn>("lastInteraction");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selectedHunts, setSelectedHunts] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSolvedness, setSelectedSolvedness] = useState<string[]>([]);
  const [selectedInteractions, setSelectedInteractions] = useState<
    InteractionType[]
  >([]);

  const interactionOptions: SelectOption[] = useMemo(() => {
    const labels: Record<InteractionType, string> = {
      bookmark: t("history.filter.bookmark", "Bookmark"),
      call: t("history.filter.call", "Call"),
      chat: t("history.filter.chat", "Chat"),
      document: t("history.filter.document", "Document"),
      guess: t("history.filter.guess", "Guess"),
      correctGuess: t("history.filter.correctGuess", "Correct guess"),
    };
    return INTERACTION_TYPES.map((type) => ({
      value: type,
      label: labels[type],
    }));
  }, [t]);
  const solvednessOptions: SelectOption[] = useMemo(
    () => [
      { value: "solved", label: t("history.solvedness.solved", "Solved") },
      {
        value: "unsolved",
        label: t("history.solvedness.unsolved", "Unsolved"),
      },
      {
        value: "noAnswers",
        label: t("history.solvedness.noAnswers", "No answers"),
      },
    ],
    [t],
  );

  const puzzleSummaries = useTracker(
    () => (loading ? [] : PuzzleHistorySummaries.find({}).fetch()),
    [loading],
  );

  // The hunts the user has history in, most recently active first
  const huntOptions: SelectOption[] = useMemo(() => {
    const hunts = new Map<string, { label: string; latest: number }>();
    for (const item of puzzleSummaries) {
      const latest = item.lastInteraction?.getTime() ?? 0;
      const hunt = hunts.get(item.huntId);
      if (!hunt || latest > hunt.latest) {
        hunts.set(item.huntId, { label: item.huntName, latest });
      }
    }
    return [...hunts]
      .toSorted(([, a], [, b]) => b.latest - a.latest)
      .map(([value, { label }]) => ({ value, label }));
  }, [puzzleSummaries]);

  // The overall graph follows the hunt and interaction filters (for the
  // interaction kinds that are activity)
  const activitySummaries: ActivityItem[] = useTracker(() => {
    if (activityLoading()) {
      return [];
    }
    const selectedActivityKinds = new Set(
      selectedInteractions.filter(isGraphedActivityKind),
    );
    const typeLabels: Record<GraphedActivityKind, string> = {
      call: t("history.activityType.call", "Call"),
      chat: t("history.activityType.chat", "Chat"),
      document: t("history.activityType.document", "Document"),
    };
    return ActivityHistorySummaries.find({})
      .fetch()
      .filter(
        (summary) =>
          (selectedHunts.length === 0 ||
            selectedHunts.includes(summary.huntId)) &&
          (selectedActivityKinds.size === 0 ||
            selectedActivityKinds.has(summary.type)),
      )
      .map((summary) => ({
        dayOfWeek: summary.dayOfWeek,
        hour: summary.hour,
        count: summary.count,
        type: typeLabels[summary.type],
      }));
  }, [activityLoading, selectedHunts, selectedInteractions, t]);

  const filteredHistory = useMemo(() => {
    const query = searchQuery.toLowerCase();
    const matches = puzzleSummaries.filter((item) => {
      if (selectedHunts.length > 0 && !selectedHunts.includes(item.huntId)) {
        return false;
      }
      if (
        selectedSolvedness.length > 0 &&
        !selectedSolvedness.includes(item.solvedness)
      ) {
        return false;
      }
      if (
        query !== "" &&
        !item.name.toLowerCase().includes(query) &&
        !item.huntName.toLowerCase().includes(query) &&
        !item.answers.some((a) => a.toLowerCase().includes(query)) &&
        !item.tags.some((tag) => tag.toLowerCase().includes(query))
      ) {
        return false;
      }
      return (
        selectedInteractions.length === 0 ||
        selectedInteractions.some((kind) => {
          switch (kind) {
            case "bookmark":
              return item.bookmarkCounter > 0;
            case "call":
              return item.callCounter > 0;
            case "chat":
              return item.chatCounter > 0;
            case "document":
              return item.documentCounter > 0;
            case "guess":
              return item.guessCounter > 0;
            case "correctGuess":
              return item.correctGuessCounter > 0;
            default:
              return kind satisfies never;
          }
        })
      );
    });
    return matches.toSorted((a, b) => {
      const comparison = compareValues(a[sortColumn], b[sortColumn]);
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [
    puzzleSummaries,
    searchQuery,
    selectedHunts,
    selectedSolvedness,
    selectedInteractions,
    sortColumn,
    sortDirection,
  ]);

  const handleSort = useCallback(
    (column: SortColumn) => {
      if (sortColumn === column) {
        setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
      } else {
        setSortColumn(column);
        setSortDirection("desc");
      }
    },
    [sortColumn],
  );

  const onSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.currentTarget.value);
    },
    [],
  );
  const onHuntsChange = useCallback((options: readonly SelectOption[]) => {
    setSelectedHunts(options.map((option) => option.value));
  }, []);
  const onSolvednessChange = useCallback((options: readonly SelectOption[]) => {
    setSelectedSolvedness(options.map((option) => option.value));
  }, []);
  const onInteractionsChange = useCallback(
    (options: readonly SelectOption[]) => {
      setSelectedInteractions(
        options.map((option) => option.value).filter(isInteractionType),
      );
    },
    [],
  );

  if (loading) {
    return <p>{t("common.loading", "loading")}...</p>;
  }

  return (
    <>
      <FilterBar>
        <FilterSection $minWidth="200px">
          <Select
            isMulti
            options={huntOptions}
            onChange={onHuntsChange}
            placeholder={t("history.filter.huntPlaceholder", "Filter by hunt")}
            theme={theme.reactSelectTheme}
          />
        </FilterSection>
        <FilterSection $grow>
          <FormControl
            type="text"
            placeholder={t(
              "history.filter.searchPlaceholder",
              "Search name, hunt, answer, tag...",
            )}
            value={searchQuery}
            onChange={onSearchChange}
          />
        </FilterSection>
        <FilterSection $minWidth="200px">
          <Select
            isMulti
            options={solvednessOptions}
            onChange={onSolvednessChange}
            placeholder={t(
              "history.filter.solvednessPlaceholder",
              "Filter by solvedness",
            )}
            theme={theme.reactSelectTheme}
          />
        </FilterSection>
        <FilterSection $minWidth="250px">
          <Select
            isMulti
            options={interactionOptions}
            onChange={onInteractionsChange}
            placeholder={t(
              "history.filter.interactionPlaceholder",
              "Filter by interaction",
            )}
            theme={theme.reactSelectTheme}
          />
        </FilterSection>
      </FilterBar>
      <ContributionGraph
        data={activitySummaries}
        timezoneOffset={timezoneOffset}
        title={t("history.graphTitle", "Your overall activity")}
        showCount
      />
      <Table striped bordered hover responsive size="sm">
        <thead>
          <tr>
            <th>
              <FontAwesomeIcon icon={faCaretRight} />
            </th>
            <SortableHeaderCell
              column="huntName"
              label={t("history.columns.hunt", "Hunt")}
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={handleSort}
            />
            <SortableHeaderCell
              column="name"
              label={t("history.columns.puzzle", "Puzzle")}
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={handleSort}
            />
            <th>{t("history.columns.answers", "Answer(s)")}</th>
            <SortableHeaderCell
              column="solvedness"
              label={t("history.columns.solvedness", "Solved?")}
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={handleSort}
            />
            <SortableHeaderCell
              column="firstInteraction"
              label={t("history.columns.firstInteraction", "First interaction")}
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={handleSort}
            />
            <SortableHeaderCell
              column="lastInteraction"
              label={t("history.columns.lastInteraction", "Last interaction")}
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={handleSort}
            />
            <th>{t("history.columns.interactions", "Interactions")}</th>
          </tr>
        </thead>
        <tbody>
          {filteredHistory.length > 0 ? (
            filteredHistory.map((historyItem) => (
              <PuzzleHistoryRow
                key={historyItem._id}
                historyItem={historyItem}
                userId={userId}
                timezoneOffset={timezoneOffset}
              />
            ))
          ) : (
            <tr>
              <NoHistoryMessage colSpan={8}>
                {t(
                  "history.noMatches",
                  "No puzzle history matches your filters.",
                )}
              </NoHistoryMessage>
            </tr>
          )}
        </tbody>
      </Table>
    </>
  );
};

const PuzzleHistoryPage = () => {
  const { t } = useTranslation();
  const title = t("history.title", "My puzzle history");
  useDocumentTitle(`${title} :: Jolly Roger`);
  useBreadcrumb({ title, path: "/history" });
  const userId = useTracker(() => Meteor.userId(), []);

  return (
    <>
      <h1>{title}</h1>
      {userId && <PuzzleHistoryTable userId={userId} />}
    </>
  );
};

export default PuzzleHistoryPage;
