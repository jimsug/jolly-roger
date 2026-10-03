import { Meteor } from "meteor/meteor";
import { useSubscribe, useTracker } from "meteor/react-meteor-data";
import { faClock } from "@fortawesome/free-regular-svg-icons/faClock";
import { faEye } from "@fortawesome/free-regular-svg-icons/faEye";
import { faEyeSlash } from "@fortawesome/free-regular-svg-icons/faEyeSlash";
import { faFolderOpen } from "@fortawesome/free-regular-svg-icons/faFolderOpen";
import { faCaretDown } from "@fortawesome/free-solid-svg-icons/faCaretDown";
import { faEraser } from "@fortawesome/free-solid-svg-icons/faEraser";
import { faMapPin } from "@fortawesome/free-solid-svg-icons/faMapPin";
import { faPencilAlt } from "@fortawesome/free-solid-svg-icons/faPencilAlt";
import { faPlus } from "@fortawesome/free-solid-svg-icons/faPlus";
import { faStar } from "@fortawesome/free-solid-svg-icons/faStar";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  type ComponentPropsWithRef,
  type FC,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import ButtonToolbar from "react-bootstrap/ButtonToolbar";
import type { FormControlProps } from "react-bootstrap/FormControl";
import FormControl from "react-bootstrap/FormControl";
import FormGroup from "react-bootstrap/FormGroup";
import FormLabel from "react-bootstrap/FormLabel";
import InputGroup from "react-bootstrap/InputGroup";
import Overlay from "react-bootstrap/Overlay";
import ToggleButton from "react-bootstrap/ToggleButton";
import ToggleButtonGroup from "react-bootstrap/ToggleButtonGroup";
import Tooltip from "react-bootstrap/Tooltip";
import { Trans, useTranslation } from "react-i18next";
import { useNavigate, useParams, useSearchParams } from "react-router";
import styled, { css } from "styled-components";
import { sortedBy } from "../../lib/listUtils";
import Bookmarks from "../../lib/models/Bookmarks";
import Hunts from "../../lib/models/Hunts";
import Peers from "../../lib/models/mediasoup/Peers";
import type { PuzzleType } from "../../lib/models/Puzzles";
import Puzzles from "../../lib/models/Puzzles";
import Tags from "../../lib/models/Tags";
import UserStatuses from "../../lib/models/UserStatuses";
import { userMayWritePuzzlesForHunt } from "../../lib/permission_stubs";
import puzzleActivityForHunt from "../../lib/publications/puzzleActivityForHunt";
import puzzleFeedbacksForHunt from "../../lib/publications/puzzleFeedbacksForHunt";
import puzzlesForPuzzleList from "../../lib/publications/puzzlesForPuzzleList";
import statusesForHuntUsers from "../../lib/publications/statusesForHuntUsers";
import {
  filteredPuzzleGroups,
  puzzleGroupsByRelevance,
} from "../../lib/puzzle-sort-and-group";
import computePuzzleSolvers, {
  type PuzzleSolvers,
} from "../../lib/puzzleSolvers";
import { findPuzzleForUrl } from "../../lib/puzzleUrl";
import { computeSolvedness } from "../../lib/solvedness";
import createPuzzle from "../../methods/createPuzzle";
import { useBreadcrumb } from "../hooks/breadcrumb";
import {
  useHuntPuzzleListCollapseGroups,
  useHuntPuzzleListDisplayMode,
  useHuntPuzzleListLockedDisplayMode,
  useHuntPuzzleListShowSolved,
  useHuntPuzzleListShowSolvers,
  useOperatorActionsHiddenForHunt,
} from "../hooks/persisted-state";
import useFocusRefOnFindHotkey from "../hooks/useFocusRefOnFindHotkey";
import useNow from "../hooks/useNow";
import useTypedSubscribe from "../hooks/useTypedSubscribe";
import indexedDisplayNames from "../indexedDisplayNames";
import { compilePuzzleMatcher } from "../search";
import { Subscribers } from "../subscribers";
import HuntNav from "./HuntNav";
import PuzzleList from "./PuzzleList";
import type {
  PuzzleModalFormHandle,
  PuzzleModalFormSubmitPayload,
} from "./PuzzleModalForm";
import PuzzleModalForm from "./PuzzleModalForm";
import RelatedPuzzleGroup, { PuzzleGroupDiv } from "./RelatedPuzzleGroup";
import RelatedPuzzleList from "./RelatedPuzzleList";
import { mediaBreakpointDown } from "./styling/responsive";

const ViewControls = styled.div<{ $canAdd?: boolean; $toggles: number }>`
  display: grid;
  grid-template-columns: ${(props) => "auto ".repeat(props.$toggles)}1fr;
  align-items: end;
  gap: 1em;
  margin-bottom: 1em;
  ${(props) =>
    props.$canAdd &&
    mediaBreakpointDown(
      "xs",
      css`
        grid-template-columns: 1fr 1fr;
      `,
    )}

  @media (width < 360px) {
    /* For very narrow viewports (like iPad Split View) */
    grid-template-columns: 100%;
  }

  .btn {
    /* Inputs and Button Toolbars are not quite the same height */
    padding-top: 7px;
    padding-bottom: 7px;
  }
`;

const SearchFormGroup = styled(FormGroup)<{ $column: number }>`
  grid-column: ${(props) => props.$column} / -1;
  ${mediaBreakpointDown(
    "sm",
    css`
      grid-column: 1 / -1;
    `,
  )}
`;

const SearchFormLabel = styled(FormLabel)<{ $canAdd?: boolean }>`
  display: ${(props) => (props.$canAdd ? "none" : "inline-block")};
  ${mediaBreakpointDown(
    "sm",
    css`
      display: none;
    `,
  )}
`;

const OperatorActionsFormGroup = styled(FormGroup)`
  ${mediaBreakpointDown(
    "xs",
    css`
      order: -1;
    `,
  )}
`;

const AddPuzzleFormGroup = styled(FormGroup)`
  justify-self: end;
  ${mediaBreakpointDown(
    "xs",
    css`
      justify-self: auto;
      order: -1;
    `,
  )}

  @media (width < 360px) {
    order: -2;
  }
`;

const StyledToggleButtonGroup = styled(ToggleButtonGroup)`
  @media (width < 360px) {
    width: 100%;
  }
`;

const StyledButton: FC<ComponentPropsWithRef<typeof Button>> = styled(Button)`
  @media (width < 360px) {
    width: 100%;
  }
`;

const PuzzleListToolbar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 0.5em;
`;

const ListHeading = styled.h5`
  margin-top: 1em;

  &:first-child {
    margin-top: 0;
  }
`;

const HuntNavWrapper = styled.div`
  display: none;
  ${mediaBreakpointDown(
    "sm",
    css`
      display: flex;
      width: 100%;
      margin-bottom: 8px;
    `,
  )}
`;

// The title goes in as a component rather than an interpolated value, so
// i18next neither escapes it nor parses it as markup.
export const PressEnterHint = ({ title }: { title: string }) => {
  const { t } = useTranslation();
  return (
    <Trans
      i18nKey="puzzleList.pressEnterToOpen"
      t={t}
      defaults="Press <kbd>Enter</kbd> to go to <title/>"
      components={{ kbd: <kbd />, title: <strong>{title}</strong> }}
    />
  );
};

const PuzzleListView = ({
  huntId,
  canAdd,
  canUpdate,
  loading,
}: {
  huntId: string;
  canAdd: boolean;
  canUpdate: boolean;
  loading: boolean;
}) => {
  const allPuzzles = useTracker(
    () => Puzzles.find({ hunt: huntId, kind: { $ne: "whiteboard" } }).fetch(),
    [huntId],
  );
  const allTags = useTracker(
    () => Tags.find({ hunt: huntId }).fetch(),
    [huntId],
  );
  const bookmarked = useTracker(() => {
    const bookmarks = Bookmarks.find({ hunt: huntId, user: Meteor.userId()! })
      .fetch()
      .map((b) => b.puzzle);
    return new Set(bookmarks);
  }, [huntId]);
  const allowUnlockablePuzzles = useTracker(
    () => Hunts.findOne(huntId)?.allowUnlockablePuzzles ?? false,
    [huntId],
  );

  const [operatorActionsHidden, setOperatorActionsHidden] =
    useOperatorActionsHiddenForHunt(huntId);
  const setOperatorActionsHiddenString = useCallback(
    (value: string) => {
      setOperatorActionsHidden(value === "hide");
    },
    [setOperatorActionsHidden],
  );

  const deletedPuzzles = useTracker(
    () =>
      !canUpdate || loading || operatorActionsHidden
        ? undefined
        : Puzzles.findDeleted({ hunt: huntId }).fetch(),
    [canUpdate, huntId, loading, operatorActionsHidden],
  );

  const [searchParams, setSearchParams] = useSearchParams();
  const searchString = searchParams.get("q") ?? "";
  const addModalRef = useRef<PuzzleModalFormHandle>(null);
  // A cancelled draft survives reopening the modal, except for tags that
  // came from "add puzzle here": those belong to the group the button was
  // on, not to whatever the plain Add button is used for next.
  const tagsPrefilledRef = useRef(false);
  const searchBarRef = useRef<HTMLInputElement>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [displayMode, setDisplayMode] = useHuntPuzzleListDisplayMode(huntId);
  const [showSolved, setShowSolved] = useHuntPuzzleListShowSolved(huntId);
  const [lockedDisplayMode, setLockedDisplayMode] =
    useHuntPuzzleListLockedDisplayMode(huntId);
  const [showSolvers, setShowSolvers] = useHuntPuzzleListShowSolvers(huntId);
  const solversShown = showSolvers === "viewers";
  const [huntPuzzleListCollapseGroups, setHuntPuzzleListCollapseGroups] =
    useHuntPuzzleListCollapseGroups(huntId);

  // Who is on each puzzle, from the hunt-wide presence publications (only
  // while the column is shown). The puzzle rows read the users themselves
  // from the display name and avatar subscriptions.
  useSubscribe(solversShown ? "subscribers.fetchAll" : undefined, huntId);
  useSubscribe(solversShown ? "mediasoup:metadataAll" : undefined, huntId);
  useTypedSubscribe(solversShown ? statusesForHuntUsers : undefined, {
    huntId,
  });
  useSubscribe(solversShown ? "displayNames" : undefined, huntId);
  useSubscribe(solversShown ? "avatars" : undefined, huntId);
  // Presence ages out, so recompute every minute even without new data
  const now = useNow(60 * 1000);
  // Any presence change in the hunt re-runs the tracker; the previous result
  // lets computePuzzleSolvers hand back the same objects for the puzzles
  // whose solvers didn't change, so their memoised rows don't re-render
  const previousSolvers = useRef<Record<string, PuzzleSolvers> | undefined>(
    undefined,
  );
  const solversByPuzzle = useTracker(() => {
    if (!solversShown) {
      previousSolvers.current = undefined;
      return undefined;
    }
    const topicPrefix = "puzzle:";
    const solvers = computePuzzleSolvers({
      previous: previousSolvers.current,
      callers: Peers.find({ hunt: huntId }).map((peer) => ({
        puzzle: peer.call,
        user: peer.createdBy,
      })),
      subscriptions: Subscribers.find({})
        .fetch()
        .filter((s) => s.name.startsWith(topicPrefix))
        .map((s) => ({
          puzzle: s.name.slice(topicPrefix.length),
          user: s.user,
          visible: s.visible ?? false,
          updatedAt: s.updatedAt,
        })),
      interactions: UserStatuses.find({
        hunt: huntId,
        type: "puzzleStatus",
        puzzle: { $exists: true },
      }).map((status) => ({
        puzzle: status.puzzle!,
        user: status.user,
        updatedAt: status.updatedAt,
      })),
      now,
    });
    previousSolvers.current = solvers;
    return solvers;
  }, [solversShown, huntId, now]);
  const displayNames = useTracker(
    () => (solversShown ? indexedDisplayNames() : new Map<string, string>()),
    [solversShown],
  );
  // Lets the filter box find puzzles by who is on them
  const solverNames = useMemo(() => {
    if (!solversByPuzzle) {
      return undefined;
    }
    return (puzzle: PuzzleType) => {
      const solvers = solversByPuzzle[puzzle._id];
      if (!solvers) {
        return [];
      }
      return [
        ...solvers.rtcViewers,
        ...solvers.activeViewers,
        ...solvers.passiveViewers,
      ].flatMap((userId) => displayNames.get(userId) ?? []);
    };
  }, [solversByPuzzle, displayNames]);
  const expandAllGroups = useCallback(() => {
    setHuntPuzzleListCollapseGroups({});
  }, [setHuntPuzzleListCollapseGroups]);
  const canExpandAllGroups =
    displayMode === "group" &&
    Object.values(huntPuzzleListCollapseGroups).some(Boolean);

  useFocusRefOnFindHotkey(searchBarRef);

  // Clicking a tag chip changes the search string, so put the cursor in the
  // filter box ready to refine it. Skipped on mount so loading the page
  // doesn't steal focus.
  const lastSearchString = useRef(searchString);
  useEffect(() => {
    if (searchString === lastSearchString.current) {
      return;
    }
    lastSearchString.current = searchString;
    const input = searchBarRef.current;
    if (input && document.activeElement !== input) {
      input.focus();
    }
  }, [searchString]);

  const onAdd = useCallback(
    (
      state: PuzzleModalFormSubmitPayload,
      callback: (error?: Error) => void,
    ) => {
      const { docType, ...rest } = state;
      if (!docType) {
        callback(new Error("No docType provided"));
        return;
      }

      function onAddComplete(error?: Error) {
        if (!error && addModalRef.current) {
          addModalRef.current.reset();
          tagsPrefilledRef.current = false;
        }
        callback(error);
      }

      createPuzzle.call({ docType, ...rest }, onAddComplete);
    },
    [],
  );

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

  const puzzlesMatchingSearchString = useCallback(
    (puzzles: PuzzleType[]): PuzzleType[] => {
      const searchKeys = searchString.split(" ");
      if (searchKeys.length === 1 && searchKeys[0] === "") {
        // No search query, so no need to do fancy search computation
        return puzzles;
      } else {
        const searchKeysWithEmptyKeysRemoved = searchKeys.filter((key) => {
          return key.length > 0;
        });
        const isInteresting = compilePuzzleMatcher(
          allTags,
          searchKeysWithEmptyKeysRemoved,
          solverNames,
        );
        return puzzles.filter(isInteresting);
      }
    },
    [searchString, allTags, solverNames],
  );

  const puzzlesMatchingSolvedFilter = useCallback(
    (puzzles: PuzzleType[]): PuzzleType[] => {
      if (showSolved) {
        return puzzles;
      } else {
        return puzzles.filter((puzzle) => {
          // Items with no expected answer are always shown, since they're
          // generally pinned administrivia.
          const solvedness = computeSolvedness(puzzle);
          return solvedness !== "solved";
        });
      }
    },
    [showSolved],
  );

  // The locked filter only applies in hunts that allow locked puzzles
  const lockedFilterActive =
    allowUnlockablePuzzles && lockedDisplayMode !== "all";
  const puzzlesMatchingLockedFilter = useCallback(
    (puzzles: PuzzleType[]): PuzzleType[] => {
      if (!lockedFilterActive) {
        return puzzles;
      }
      const wantLocked = lockedDisplayMode === "locked";
      return puzzles.filter(
        (puzzle) => (puzzle.locked ?? false) === wantLocked,
      );
    },
    [lockedFilterActive, lockedDisplayMode],
  );

  const matchingSearch = puzzlesMatchingSearchString(allPuzzles);
  const matchingSearchAndFilters = puzzlesMatchingLockedFilter(
    puzzlesMatchingSolvedFilter(matchingSearch),
  );
  // Normally, we'll just show matchingSearchAndFilters, but if that produces
  // no results, and there *is* a puzzle that is not being displayed due to
  // the solved or locked filters, then show that and a note that we're
  // showing filtered-out puzzles because nothing else matched.
  const filtersOverConstrain =
    matchingSearch.length > 0 && matchingSearchAndFilters.length === 0;
  const retainedPuzzles = filtersOverConstrain
    ? matchingSearch
    : matchingSearchAndFilters;
  const retainedDeletedPuzzles =
    deletedPuzzles && puzzlesMatchingSearchString(deletedPuzzles);

  const clearSearch = useCallback(() => {
    setSearchString("");
  }, [setSearchString]);

  const setShowSolvedString = useCallback(
    (value: string) => {
      setShowSolved(value === "show");
    },
    [setShowSolved],
  );

  const setShowSolversString = useCallback(
    (value: string) => {
      setShowSolvers(value === "hide" ? "hide" : "viewers");
    },
    [setShowSolvers],
  );

  const showAddModal = useCallback(() => {
    if (addModalRef.current) {
      if (tagsPrefilledRef.current) {
        addModalRef.current.populateForm({ tagIds: [] });
        tagsPrefilledRef.current = false;
      }
      addModalRef.current.show();
    }
  }, []);

  const showAddModalWithTags = useCallback((tagIds: string[]) => {
    if (addModalRef.current) {
      addModalRef.current.populateForm({ tagIds });
      tagsPrefilledRef.current = true;
      addModalRef.current.show();
    }
  }, []);
  const addPuzzleCallback =
    canAdd && !operatorActionsHidden ? showAddModalWithTags : undefined;

  const navigate = useNavigate();

  // The bookmarklet on the More page opens this page with the title and URL
  // of the hunt page it was clicked on: go to the puzzle if it's already
  // known, otherwise offer to add it.
  const bookmarkletUrl = searchParams.get("url");
  const bookmarkletTitle = searchParams.get("title");
  useEffect(() => {
    if (!bookmarkletUrl) {
      return;
    }
    const existing = findPuzzleForUrl(allPuzzles, bookmarkletUrl);
    if (existing) {
      void navigate(`/hunts/${huntId}/puzzles/${existing._id}`, {
        replace: true,
      });
      return;
    }
    // Only operators have the add form; for anyone else the list just loads
    if (addModalRef.current) {
      addModalRef.current.reset();
      addModalRef.current.populateForm({
        title: bookmarkletTitle ?? "",
        url: bookmarkletUrl,
      });
      tagsPrefilledRef.current = false;
      addModalRef.current.show();
    }
    setSearchParams(
      (prev) => {
        const u = new URLSearchParams(prev);
        u.delete("url");
        u.delete("title");
        return u;
      },
      { replace: true },
    );
  }, [
    allPuzzles,
    bookmarkletTitle,
    bookmarkletUrl,
    huntId,
    navigate,
    setSearchParams,
  ]);

  // With the filter narrowed down to one puzzle, Enter opens it
  const singleMatch =
    retainedPuzzles.length === 1 ? retainedPuzzles[0] : undefined;
  const onSearchKeyDown: NonNullable<FormControlProps["onKeyDown"]> =
    useCallback(
      (e) => {
        if (e.key === "Enter" && singleMatch) {
          e.preventDefault();
          void navigate(`/hunts/${huntId}/puzzles/${singleMatch._id}`);
        }
      },
      [singleMatch, navigate, huntId],
    );
  const onSearchFocus = useCallback(() => {
    setSearchFocused(true);
  }, []);
  const onSearchBlur = useCallback(() => {
    setSearchFocused(false);
  }, []);

  const { t } = useTranslation();

  const renderList = useCallback(
    (
      retainedPuzzles: PuzzleType[],
      retainedDeletedPuzzles: PuzzleType[] | undefined,
      filtersOverConstrain: boolean,
      allPuzzlesCount: number,
    ) => {
      const maybeMatchWarning = filtersOverConstrain && (
        <Alert variant="info">
          {lockedFilterActive
            ? t(
                "puzzleList.maybeMatchWarningFiltered",
                "No matches found with the current filters; showing every matching puzzle",
              )
            : t(
                "puzzleList.maybeMatchWarning",
                "No matches found in unsolved puzzles; showing matches from solved puzzles",
              )}
        </Alert>
      );
      const retainedIds = new Set(retainedPuzzles.map((puzzle) => puzzle._id));
      const filterMessage = t(
        "puzzleList.filteredPuzzleCountMessage",
        "Showing {{retainedCount}} of {{allPuzzlesCount}} items",
        {
          retainedCount: retainedPuzzles.length,
          allPuzzlesCount: allPuzzlesCount,
        },
      );

      const bookmarkedPuzzles = retainedPuzzles.filter((puzzle) =>
        bookmarked.has(puzzle._id),
      );

      let listTitle;
      if (searchString.trim() !== "") {
        listTitle = t("puzzleList.searchResults", "Search results");
      } else if (showSolved) {
        listTitle = t("puzzleList.allPuzzles", "All puzzles");
      } else {
        listTitle = t("puzzleList.unsolvedPuzzles", "Unsolved puzzles");
      }

      let listComponent;
      let listControls;
      switch (displayMode) {
        case "group": {
          // We group and sort first, and only filter afterward, to avoid losing the
          // relative group structure as a result of removing some puzzles from
          // consideration.
          const unfilteredGroups = puzzleGroupsByRelevance(allPuzzles, allTags);
          const puzzleGroups = filteredPuzzleGroups(
            unfilteredGroups,
            retainedIds,
          );
          listComponent = puzzleGroups.map((g) => {
            const suppressedTagIds = [];
            if (g.sharedTag) {
              suppressedTagIds.push(g.sharedTag._id);
            }
            return (
              <RelatedPuzzleGroup
                key={g.sharedTag ? g.sharedTag._id : "ungrouped"}
                huntId={huntId}
                group={g}
                noSharedTagLabel={`(${t("puzzleList.noGroupSpecified", "no group specified")})`}
                bookmarked={bookmarked}
                allTags={allTags}
                includeCount={false}
                canUpdate={canUpdate}
                suppressedTagIds={suppressedTagIds}
                trackPersistentExpand={searchString === ""}
                addPuzzleCallback={addPuzzleCallback}
                showSolvers={solversShown}
                solvers={solversByPuzzle}
              />
            );
          });
          listControls = (
            <Button
              variant="secondary"
              size="sm"
              disabled={!canExpandAllGroups}
              onClick={expandAllGroups}
            >
              <FontAwesomeIcon icon={faCaretDown} />{" "}
              {t("common.expandAll", "Expand all")}
            </Button>
          );
          break;
        }
        case "unlock": {
          const puzzlesByUnlock = sortedBy(allPuzzles, (p) => {
            return p.createdAt;
          });
          const retainedPuzzlesByUnlock = puzzlesByUnlock.filter((p) =>
            retainedIds.has(p._id),
          );
          listComponent = (
            <PuzzleList
              puzzles={retainedPuzzlesByUnlock}
              bookmarked={bookmarked}
              allTags={allTags}
              canUpdate={canUpdate}
              showSolvers={solversShown}
              solvers={solversByPuzzle}
            />
          );
          listControls = null;
          break;
        }
        // no default
      }
      return (
        <div>
          {maybeMatchWarning}
          <PuzzleListToolbar>
            <div>{listControls}</div>
            <div>{filterMessage}</div>
            <div>
              <FontAwesomeIcon icon={faFolderOpen} /> ={" "}
              {t("puzzleList.legend.group", "group")};{" "}
              <FontAwesomeIcon icon={faStar} /> ={" "}
              {t("puzzleList.legend.metaFor", "meta for")};{" "}
              <FontAwesomeIcon icon={faMapPin} /> ={" "}
              {t("puzzleList.legend.where", "where")}
            </div>
          </PuzzleListToolbar>
          {bookmarkedPuzzles.length > 0 && (
            <PuzzleGroupDiv>
              <ListHeading>
                {t("puzzleList.bookmarked", "Bookmarked")}
              </ListHeading>
              <RelatedPuzzleList
                key="bookmarked"
                relatedPuzzles={bookmarkedPuzzles}
                sharedTag={undefined}
                bookmarked={bookmarked}
                allTags={allTags}
                canUpdate={canUpdate}
                suppressedTagIds={[]}
                showSolvers={solversShown}
                solvers={solversByPuzzle}
              />
              <ListHeading>{listTitle}</ListHeading>
            </PuzzleGroupDiv>
          )}
          {listComponent}
          {retainedDeletedPuzzles && retainedDeletedPuzzles.length > 0 && (
            <RelatedPuzzleGroup
              key="deleted"
              huntId={huntId}
              group={{ puzzles: retainedDeletedPuzzles, subgroups: [] }}
              noSharedTagLabel={t(
                "puzzleList.deletedPuzzlesGroup",
                "Deleted puzzles (operator only)",
              )}
              bookmarked={bookmarked}
              allTags={allTags}
              includeCount={false}
              canUpdate={canUpdate}
              suppressedTagIds={[]}
              trackPersistentExpand={searchString === ""}
              showSolvers={solversShown}
              solvers={solversByPuzzle}
            />
          )}
        </div>
      );
    },
    [
      huntId,
      displayMode,
      allPuzzles,
      allTags,
      canUpdate,
      searchString,
      showSolved,
      lockedFilterActive,
      canExpandAllGroups,
      expandAllGroups,
      bookmarked,
      addPuzzleCallback,
      solversShown,
      solversByPuzzle,
      t,
    ],
  );

  const idPrefix = useId();

  const addPuzzleContent = canAdd && (
    <>
      <PuzzleModalForm
        huntId={huntId}
        tags={allTags}
        ref={addModalRef}
        onSubmit={onAdd}
      />
      <OperatorActionsFormGroup>
        <FormLabel>{t("puzzleList.viewMode.label", "View")}</FormLabel>
        <ButtonToolbar>
          <StyledToggleButtonGroup
            type="radio"
            name="operator-actions"
            defaultValue="show"
            value={operatorActionsHidden ? "hide" : "show"}
            onChange={setOperatorActionsHiddenString}
          >
            <ToggleButton
              id={`${idPrefix}-operator-actions-hide-button`}
              variant="outline-info"
              value="hide"
            >
              <FontAwesomeIcon icon={faPencilAlt} />{" "}
              {t("puzzleList.viewMode.solver", "Solver")}
            </ToggleButton>
            <ToggleButton
              id={`${idPrefix}-operator-actions-show-button`}
              variant="outline-info"
              value="show"
            >
              <FontAwesomeIcon icon={faStar} />{" "}
              {t("puzzleList.viewMode.deputy", "Deputy")}
            </ToggleButton>
          </StyledToggleButtonGroup>
        </ButtonToolbar>
      </OperatorActionsFormGroup>
      {!operatorActionsHidden && (
        <AddPuzzleFormGroup>
          <StyledButton variant="primary" onClick={showAddModal}>
            <FontAwesomeIcon icon={faPlus} />{" "}
            {t("puzzle.edit.addPuzzle", "Add a puzzle")}
          </StyledButton>
        </AddPuzzleFormGroup>
      )}
    </>
  );

  // Toggle groups before the operator controls and the search box
  const toggleCount = allowUnlockablePuzzles ? 4 : 3;

  return (
    <div>
      <ViewControls $canAdd={canAdd} $toggles={toggleCount + 1}>
        <FormGroup>
          <FormLabel>{t("puzzleList.organizeBy", "Organize by")}</FormLabel>
          <ButtonToolbar>
            <StyledToggleButtonGroup
              type="radio"
              name="puzzle-view"
              defaultValue="group"
              value={displayMode}
              onChange={setDisplayMode}
            >
              <ToggleButton
                id={`${idPrefix}-view-group-button`}
                variant="outline-info"
                value="group"
              >
                <FontAwesomeIcon icon={faFolderOpen} />{" "}
                {t("puzzleList.byGroup", "Group")}
              </ToggleButton>
              <ToggleButton
                id={`${idPrefix}-view-unlock-button`}
                variant="outline-info"
                value="unlock"
              >
                <FontAwesomeIcon icon={faClock} />{" "}
                {t("puzzleList.byUnlock", "When added")}
              </ToggleButton>
            </StyledToggleButtonGroup>
          </ButtonToolbar>
        </FormGroup>
        <FormGroup>
          <FormLabel>
            {t("puzzleList.solvedPuzzles", "Solved puzzles")}
          </FormLabel>
          <ButtonToolbar>
            <StyledToggleButtonGroup
              type="radio"
              name="show-solved"
              defaultValue="show"
              value={showSolved ? "show" : "hide"}
              onChange={setShowSolvedString}
            >
              <ToggleButton
                id={`${idPrefix}-solved-hide-button`}
                variant="outline-info"
                value="hide"
              >
                {t("common.hidden", "Hidden")}
              </ToggleButton>
              <ToggleButton
                id={`${idPrefix}-solved-show-button`}
                variant="outline-info"
                value="show"
              >
                {t("common.shown", "Shown")}
              </ToggleButton>
            </StyledToggleButtonGroup>
          </ButtonToolbar>
        </FormGroup>
        {allowUnlockablePuzzles && (
          <FormGroup>
            <FormLabel>
              {t("puzzleList.lockedPuzzles", "Locked puzzles")}
            </FormLabel>
            <ButtonToolbar>
              <StyledToggleButtonGroup
                type="radio"
                name="show-locked"
                defaultValue="all"
                value={lockedDisplayMode}
                onChange={setLockedDisplayMode}
              >
                <ToggleButton
                  id={`${idPrefix}-locked-hide-button`}
                  variant="outline-info"
                  value="unlocked"
                >
                  {t("puzzleList.lockedFilter.unlocked", "Unlocked")}
                </ToggleButton>
                <ToggleButton
                  id={`${idPrefix}-locked-only-button`}
                  variant="outline-info"
                  value="locked"
                >
                  {t("puzzleList.lockedFilter.locked", "Locked")}
                </ToggleButton>
                <ToggleButton
                  id={`${idPrefix}-locked-all-button`}
                  variant="outline-info"
                  value="all"
                >
                  {t("puzzleList.lockedFilter.all", "All")}
                </ToggleButton>
              </StyledToggleButtonGroup>
            </ButtonToolbar>
          </FormGroup>
        )}
        <FormGroup>
          <FormLabel>{t("puzzleList.hunters", "Hunters")}</FormLabel>
          <ButtonToolbar>
            <StyledToggleButtonGroup
              type="radio"
              name="show-solvers"
              defaultValue="viewers"
              value={showSolvers}
              onChange={setShowSolversString}
            >
              <ToggleButton
                id={`${idPrefix}-solvers-hide-button`}
                variant="outline-info"
                value="hide"
              >
                <FontAwesomeIcon icon={faEyeSlash} />{" "}
                {t("common.hidden", "Hidden")}
              </ToggleButton>
              <ToggleButton
                id={`${idPrefix}-solvers-show-button`}
                variant="outline-info"
                value="viewers"
              >
                <FontAwesomeIcon icon={faEye} /> {t("common.shown", "Shown")}
              </ToggleButton>
            </StyledToggleButtonGroup>
          </ButtonToolbar>
        </FormGroup>
        {addPuzzleContent}
        <SearchFormGroup
          $column={canAdd ? 1 : toggleCount + 1}
          controlId={`${idPrefix}-puzzle-search`}
        >
          <SearchFormLabel $canAdd={canAdd}>
            {t("common.search", "Search")}
          </SearchFormLabel>
          <InputGroup>
            <FormControl
              as="input"
              type="text"
              ref={searchBarRef}
              placeholder={
                solversShown
                  ? t(
                      "puzzleList.filterByPlaceholderWithSolvers",
                      "Filter by title, answer, tag, or solver",
                    )
                  : t(
                      "puzzleList.filterByPlaceholder",
                      "Filter by title, answer, or tag",
                    )
              }
              value={searchString}
              onChange={onSearchStringChange}
              onKeyDown={onSearchKeyDown}
              onFocus={onSearchFocus}
              onBlur={onSearchBlur}
            />
            <Button variant="secondary" onClick={clearSearch}>
              <FontAwesomeIcon icon={faEraser} />
            </Button>
          </InputGroup>
          <Overlay
            target={searchBarRef.current}
            show={searchFocused && singleMatch !== undefined}
            placement="bottom-start"
          >
            <Tooltip id={`${idPrefix}-single-match-tooltip`}>
              <PressEnterHint title={singleMatch?.title ?? ""} />
            </Tooltip>
          </Overlay>
        </SearchFormGroup>
      </ViewControls>
      {renderList(
        retainedPuzzles,
        retainedDeletedPuzzles,
        filtersOverConstrain,
        allPuzzles.length,
      )}
    </div>
  );
};

const PuzzleListPage = () => {
  const huntId = useParams<"huntId">().huntId!;
  const { t } = useTranslation();

  useBreadcrumb({
    title: t("puzzleList.breadcrumbTitle", "Puzzles"),
    path: `/hunts/${huntId}/puzzles`,
  });

  // Assertion is safe because hunt is already subscribed and checked by HuntApp
  const hunt = useTracker(() => Hunts.findOne(huntId)!, [huntId]);
  const { canAdd, canUpdate } = useTracker(() => {
    return {
      canAdd: userMayWritePuzzlesForHunt(Meteor.user(), hunt),
      canUpdate: userMayWritePuzzlesForHunt(Meteor.user(), hunt),
    };
  }, [hunt]);

  const puzzlesLoading = useTypedSubscribe(puzzlesForPuzzleList, {
    huntId,
    includeDeleted: canUpdate,
  });
  const loading = puzzlesLoading();

  // Don't bother including these in loading - it's ok if they trickle in
  useTypedSubscribe(puzzleActivityForHunt, { huntId });
  useTypedSubscribe(puzzleFeedbacksForHunt, { huntId });

  return loading ? (
    <span>{t("common.loading", "loading")}...</span>
  ) : (
    <div>
      <HuntNavWrapper>
        <HuntNav />
      </HuntNavWrapper>

      <PuzzleListView
        huntId={huntId}
        canAdd={canAdd}
        canUpdate={canUpdate}
        loading={loading}
      />
    </div>
  );
};

export default PuzzleListPage;
