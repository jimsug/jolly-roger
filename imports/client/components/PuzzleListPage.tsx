import { Meteor } from "meteor/meteor";
import { useTracker } from "meteor/react-meteor-data";
import { faClock } from "@fortawesome/free-regular-svg-icons/faClock";
import { faEye } from "@fortawesome/free-regular-svg-icons/faEye";
import { faEyeSlash } from "@fortawesome/free-regular-svg-icons/faEyeSlash";
import { faFolderOpen } from "@fortawesome/free-regular-svg-icons/faFolderOpen";
import { faCaretDown } from "@fortawesome/free-solid-svg-icons/faCaretDown";
import { faEraser } from "@fortawesome/free-solid-svg-icons/faEraser";
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
import Tooltip from "react-bootstrap/Tooltip";
import { Trans, useTranslation } from "react-i18next";
import { useNavigate, useParams, useSearchParams } from "react-router";
import styled, { css } from "styled-components";
import { sortedBy } from "../../lib/listUtils";
import Bookmarks from "../../lib/models/Bookmarks";
import Hunts from "../../lib/models/Hunts";
import type { PuzzleType } from "../../lib/models/Puzzles";
import Puzzles from "../../lib/models/Puzzles";
import Tags from "../../lib/models/Tags";
import { userMayWritePuzzlesForHunt } from "../../lib/permission_stubs";
import puzzleActivityForHunt from "../../lib/publications/puzzleActivityForHunt";
import puzzleInterestsForHunt from "../../lib/publications/puzzleInterestsForHunt";
import puzzlesForPuzzleList from "../../lib/publications/puzzlesForPuzzleList";
import {
  filteredPuzzleGroups,
  puzzleGroupsByRelevance,
} from "../../lib/puzzle-sort-and-group";
import { findPuzzleForUrl } from "../../lib/puzzleUrl";
import createPuzzle from "../../methods/createPuzzle";
import { useBreadcrumb } from "../hooks/breadcrumb";
import {
  useHuntPuzzleListCollapseGroups,
  useHuntPuzzleListDisplayMode,
  useHuntPuzzleListLockedDisplayMode,
  useHuntPuzzleListShowSolved,
  useHuntPuzzleListShowViewers,
  useOperatorActionsHiddenForHunt,
} from "../hooks/persisted-state";
import useFocusRefOnFindHotkey from "../hooks/useFocusRefOnFindHotkey";
import usePuzzleViewers from "../hooks/usePuzzleViewers";
import useTagSynonyms from "../hooks/useTagSynonyms";
import useTypedSubscribe from "../hooks/useTypedSubscribe";
import indexedDisplayNames from "../indexedDisplayNames";
import {
  puzzlesMatchingSearchString,
  puzzlesMatchingSolvedFilter,
} from "../search";
import HuntNav from "./HuntNav";
import PressEnterHint from "./PressEnterHint";
import PuzzleList from "./PuzzleList";
import type {
  PuzzleModalFormHandle,
  PuzzleModalFormSubmitPayload,
} from "./PuzzleModalForm";
import PuzzleModalForm from "./PuzzleModalForm";
import RelatedPuzzleGroup, { PuzzleGroupDiv } from "./RelatedPuzzleGroup";
import RelatedPuzzleList from "./RelatedPuzzleList";
import ResponsiveToggleButtonGroup from "./styling/ResponsiveToggleButtonGroup";
import { mediaBreakpointDown } from "./styling/responsive";
import { TAG_KIND_ICONS } from "./tagKindIcons";
import {
  HuntHasWhiteboardContext,
  useHuntHasWhiteboard,
} from "./whiteboard/ShowOnBoardLink";

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

const StyledButton: FC<ComponentPropsWithRef<typeof Button>> = styled(Button)`
  @media (width < 360px) {
    width: 100%;
  }
`;

const PuzzleListToolbar = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5em;
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
  const searchBarRef = useRef<HTMLInputElement>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [displayMode, setDisplayMode] = useHuntPuzzleListDisplayMode(huntId);
  const [showSolved, setShowSolved] = useHuntPuzzleListShowSolved(huntId);
  const [lockedDisplayMode, setLockedDisplayMode] =
    useHuntPuzzleListLockedDisplayMode(huntId);
  const [viewersShown, setViewersShown] = useHuntPuzzleListShowViewers(huntId);
  const [huntPuzzleListCollapseGroups, setHuntPuzzleListCollapseGroups] =
    useHuntPuzzleListCollapseGroups(huntId);

  // Who is on each puzzle, while the column is shown. The puzzle rows read
  // the users themselves from the display name and avatar subscriptions this
  // makes.
  const viewersByPuzzle = usePuzzleViewers(huntId, viewersShown);
  const displayNames = useTracker(
    () => (viewersShown ? indexedDisplayNames() : new Map<string, string>()),
    [viewersShown],
  );
  // Lets the filter box find puzzles by who is on them
  const viewerNames = useMemo(() => {
    if (!viewersByPuzzle) {
      return undefined;
    }
    return (puzzle: PuzzleType) => {
      const viewers = viewersByPuzzle[puzzle._id];
      if (!viewers) {
        return [];
      }
      return [
        ...viewers.rtcViewers,
        ...viewers.activeViewers,
        ...viewers.passiveViewers,
      ].flatMap((userId) => displayNames.get(userId) ?? []);
    };
  }, [viewersByPuzzle, displayNames]);
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

  const tagSynonyms = useTagSynonyms();
  const matchingSearch = puzzlesMatchingSearchString(
    allPuzzles,
    allTags,
    searchString,
    viewerNames,
    tagSynonyms,
  );
  const matchingSearchAndFilters = puzzlesMatchingLockedFilter(
    puzzlesMatchingSolvedFilter(matchingSearch, showSolved),
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
    deletedPuzzles &&
    puzzlesMatchingSearchString(
      deletedPuzzles,
      allTags,
      searchString,
      viewerNames,
      tagSynonyms,
    );

  const clearSearch = useCallback(() => {
    setSearchString("");
  }, [setSearchString]);

  const setShowSolvedString = useCallback(
    (value: string) => {
      setShowSolved(value === "show");
    },
    [setShowSolved],
  );

  const setViewersShownString = useCallback(
    (value: string) => {
      setViewersShown(value === "show");
    },
    [setViewersShown],
  );

  const showAddModal = useCallback(() => {
    if (addModalRef.current) {
      addModalRef.current.show();
    }
  }, []);

  const showAddModalWithTags = useCallback((tagIds: string[]) => {
    if (addModalRef.current) {
      addModalRef.current.show({ tagIds });
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
  // Read through a ref so that only a new bookmarklet visit runs the effect,
  // not every change to the puzzles
  const allPuzzlesRef = useRef(allPuzzles);
  useEffect(() => {
    allPuzzlesRef.current = allPuzzles;
  }, [allPuzzles]);
  useEffect(() => {
    if (!bookmarkletUrl) {
      return;
    }
    const existing = findPuzzleForUrl(allPuzzlesRef.current, bookmarkletUrl);
    if (existing) {
      void navigate(`/hunts/${huntId}/puzzles/${existing._id}`, {
        replace: true,
      });
      return;
    }
    // Only operators have the add form; for anyone else the list just loads
    if (addModalRef.current) {
      addModalRef.current.reset();
      addModalRef.current.show({
        title: bookmarkletTitle ?? "",
        url: bookmarkletUrl,
      });
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
  }, [bookmarkletTitle, bookmarkletUrl, huntId, navigate, setSearchParams]);

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
          const unfilteredGroups = puzzleGroupsByRelevance(
            allPuzzles,
            allTags,
            tagSynonyms,
          );
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
                showViewers={viewersShown}
                viewers={viewersByPuzzle}
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
              showViewers={viewersShown}
              viewers={viewersByPuzzle}
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
              <Trans
                i18nKey="puzzleList.legend"
                defaults="<group /> = group; <metaFor /> = meta for; <where /> = where"
                t={t}
                components={{
                  group: <FontAwesomeIcon icon={TAG_KIND_ICONS.group} />,
                  metaFor: <FontAwesomeIcon icon={TAG_KIND_ICONS.metaFor} />,
                  where: <FontAwesomeIcon icon={TAG_KIND_ICONS.location} />,
                }}
              />
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
                showViewers={viewersShown}
                viewers={viewersByPuzzle}
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
              showViewers={viewersShown}
              viewers={viewersByPuzzle}
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
      viewersShown,
      viewersByPuzzle,
      tagSynonyms,
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
          <ResponsiveToggleButtonGroup
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
          </ResponsiveToggleButtonGroup>
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
            <ResponsiveToggleButtonGroup
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
            </ResponsiveToggleButtonGroup>
          </ButtonToolbar>
        </FormGroup>
        <FormGroup>
          <FormLabel>
            {t("puzzleList.solvedPuzzles.label", "Solved puzzles")}
          </FormLabel>
          <ButtonToolbar>
            <ResponsiveToggleButtonGroup
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
                {t("puzzleList.solvedPuzzles.hide", "Hide")}
              </ToggleButton>
              <ToggleButton
                id={`${idPrefix}-solved-show-button`}
                variant="outline-info"
                value="show"
              >
                {t("puzzleList.solvedPuzzles.show", "Show")}
              </ToggleButton>
            </ResponsiveToggleButtonGroup>
          </ButtonToolbar>
        </FormGroup>
        {allowUnlockablePuzzles && (
          <FormGroup>
            <FormLabel>
              {t("puzzleList.lockedPuzzles", "Locked puzzles")}
            </FormLabel>
            <ButtonToolbar>
              <ResponsiveToggleButtonGroup
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
              </ResponsiveToggleButtonGroup>
            </ButtonToolbar>
          </FormGroup>
        )}
        <FormGroup>
          <FormLabel>{t("puzzleList.viewers.label", "Viewers")}</FormLabel>
          <ButtonToolbar>
            <ResponsiveToggleButtonGroup
              type="radio"
              name="show-viewers"
              defaultValue="show"
              value={viewersShown ? "show" : "hide"}
              onChange={setViewersShownString}
            >
              <ToggleButton
                id={`${idPrefix}-viewers-hide-button`}
                variant="outline-info"
                value="hide"
              >
                <FontAwesomeIcon icon={faEyeSlash} />{" "}
                {t("puzzleList.viewers.hide", "Hide")}
              </ToggleButton>
              <ToggleButton
                id={`${idPrefix}-viewers-show-button`}
                variant="outline-info"
                value="show"
              >
                <FontAwesomeIcon icon={faEye} />{" "}
                {t("puzzleList.viewers.show", "Show")}
              </ToggleButton>
            </ResponsiveToggleButtonGroup>
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
                viewersShown
                  ? t(
                      "puzzleList.filterByPlaceholderWithViewers",
                      "Filter by title, answer, tag, or viewer",
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
  useTypedSubscribe(puzzleInterestsForHunt, { huntId });
  const huntHasWhiteboard = useHuntHasWhiteboard(huntId);

  return loading ? (
    <span>{t("common.loading", "loading")}...</span>
  ) : (
    <div>
      <HuntNavWrapper>
        <HuntNav />
      </HuntNavWrapper>

      <HuntHasWhiteboardContext value={huntHasWhiteboard}>
        <PuzzleListView
          huntId={huntId}
          canAdd={canAdd}
          canUpdate={canUpdate}
          loading={loading}
        />
      </HuntHasWhiteboardContext>
    </div>
  );
};

export default PuzzleListPage;
