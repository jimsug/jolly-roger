import { faCaretDown } from "@fortawesome/free-solid-svg-icons/faCaretDown";
import { faCaretRight } from "@fortawesome/free-solid-svg-icons/faCaretRight";
import { faPlus } from "@fortawesome/free-solid-svg-icons/faPlus";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import type { TagType } from "../../lib/models/Tags";
import type { PuzzleGroup } from "../../lib/puzzle-sort-and-group";
import { computeSolvedness } from "../../lib/solvedness";
import { useHuntPuzzleListCollapseGroup } from "../hooks/persisted-state";
import RelatedPuzzleList from "./RelatedPuzzleList";
import Tag from "./Tag";

export const PuzzleGroupDiv = styled.div`
  &:not(:last-child) {
    margin-bottom: 16px;
  }
`;

const PuzzleGroupHeader = styled.div`
  display: block;

  &:hover {
    cursor: pointer;
  }

  min-height: 32px;
`;

const PuzzleListWrapper = styled.div`
  padding-left: 1.25em;
`;

const NoSharedTagLabel = styled.div`
  display: inline-flex;
  align-items: center;
  line-height: 24px;
  margin: 2px 4px 2px 0;
  padding: 0 6px;
  border-radius: 4px;
  background-color: transparent;
  color: #808080;
`;

const UnsolvedCountBadge = styled(Badge)`
  display: inline-flex;
  align-items: center;
  line-height: 24px;
  margin: 2px 4px 2px 0;
  padding: 0 6px;
  border-radius: 4px;
  vertical-align: top;
`;

const AddPuzzleButton = styled(Button)`
  margin: 2px 4px 2px 0;
  padding: 2px 6px;
  border-radius: 4px;
  vertical-align: top;
`;

const RelatedPuzzleGroup = ({
  huntId,
  group,
  noSharedTagLabel = "(no tag)",
  allTags,
  bookmarked,
  includeCount,
  canUpdate,
  suppressedTagIds,
  trackPersistentExpand,
  addPuzzleCallback,
}: {
  huntId: string;
  group: PuzzleGroup;
  // noSharedTagLabel is used to label the group only if sharedTag is undefined.
  noSharedTagLabel?: string;
  bookmarked: Set<string>;
  allTags: TagType[];
  includeCount?: boolean;
  canUpdate: boolean;
  suppressedTagIds: string[];
  trackPersistentExpand: boolean;
  // If present, the group header offers to add a puzzle pre-tagged with the
  // group's tags (and those of any enclosing groups).
  addPuzzleCallback?: (tagIds: string[]) => void;
}) => {
  const [persistentCollapsed, setPersistentCollapsed] =
    useHuntPuzzleListCollapseGroup(
      huntId,
      group.sharedTag?._id ?? noSharedTagLabel,
    );
  const [nonPersistentCollapsed, setNonPersistentCollapsed] = useState(false);
  const lastTrackPersistentExpand = useRef(trackPersistentExpand);
  useEffect(() => {
    if (trackPersistentExpand !== lastTrackPersistentExpand.current) {
      lastTrackPersistentExpand.current = trackPersistentExpand;
      setNonPersistentCollapsed(false);
    }
  }, [trackPersistentExpand]);
  const toggleCollapse = useCallback(() => {
    if (trackPersistentExpand) {
      setPersistentCollapsed((prevCollapsed) => !prevCollapsed);
    } else {
      setNonPersistentCollapsed((prevCollapsed) => !prevCollapsed);
    }
  }, [setPersistentCollapsed, trackPersistentExpand]);
  const collapsed = trackPersistentExpand
    ? persistentCollapsed
    : nonPersistentCollapsed;

  const { puzzles: relatedPuzzles, sharedTag } = group;

  const allSuppressedTagIds = [...suppressedTagIds];
  if (sharedTag) {
    allSuppressedTagIds.push(sharedTag._id);
  }

  const onAddPuzzle = (event: React.MouseEvent<HTMLButtonElement>) => {
    // Don't also toggle the group.
    event.stopPropagation();
    addPuzzleCallback?.([...new Set(allSuppressedTagIds)]);
  };

  const { t } = useTranslation();

  const puzzlePlural = relatedPuzzles.length === 1 ? "puzzle" : "puzzles";
  const countString = `(${relatedPuzzles.length} other ${puzzlePlural})`;

  // Puzzles that can't be solved (administrivia) don't count either way.
  const unsolvedCount = relatedPuzzles.filter(
    (p) => computeSolvedness(p) === "unsolved",
  ).length;
  const solvedCount = relatedPuzzles.filter(
    (p) => computeSolvedness(p) === "solved",
  ).length;

  return (
    <PuzzleGroupDiv>
      <PuzzleGroupHeader
        data-group-name={sharedTag?.name}
        onClick={toggleCollapse}
      >
        <FontAwesomeIcon icon={collapsed ? faCaretRight : faCaretDown} />
        {sharedTag ? (
          <>
            <Tag tag={sharedTag} linkToSearch={false} popoverRelated={false} />
            {/* Only worth flagging while the group is mostly unsolved. */}
            {unsolvedCount > 0 && unsolvedCount > solvedCount && (
              <UnsolvedCountBadge bg="secondary">
                {t(
                  "puzzleList.unsolvedInGroup",
                  "{{unsolved}} of {{count}} puzzles unsolved",
                  {
                    unsolved: unsolvedCount,
                    count: unsolvedCount + solvedCount,
                  },
                )}
              </UnsolvedCountBadge>
            )}
            {addPuzzleCallback && (
              <AddPuzzleButton
                size="sm"
                variant="outline-secondary"
                onClick={onAddPuzzle}
              >
                <FontAwesomeIcon icon={faPlus} />{" "}
                {t("puzzleList.addPuzzleHere", "add puzzle here")}
              </AddPuzzleButton>
            )}
          </>
        ) : (
          <NoSharedTagLabel>{noSharedTagLabel}</NoSharedTagLabel>
        )}
        {includeCount && <span>{countString}</span>}
      </PuzzleGroupHeader>
      {collapsed ? null : (
        <PuzzleListWrapper>
          <RelatedPuzzleList
            relatedPuzzles={relatedPuzzles}
            bookmarked={bookmarked}
            allTags={allTags}
            canUpdate={canUpdate}
            sharedTag={sharedTag}
            suppressedTagIds={allSuppressedTagIds}
          />
          {group.subgroups.map((subgroup) => {
            const subgroupSuppressedTagIds = [...allSuppressedTagIds];
            if (subgroup.sharedTag) {
              subgroupSuppressedTagIds.push(subgroup.sharedTag._id);
            }
            return (
              <RelatedPuzzleGroup
                key={subgroup.sharedTag ? subgroup.sharedTag._id : "ungrouped"}
                huntId={huntId}
                group={subgroup}
                noSharedTagLabel={noSharedTagLabel}
                bookmarked={bookmarked}
                allTags={allTags}
                includeCount={includeCount}
                canUpdate={canUpdate}
                suppressedTagIds={subgroupSuppressedTagIds}
                trackPersistentExpand={trackPersistentExpand}
                addPuzzleCallback={addPuzzleCallback}
              />
            );
          })}
        </PuzzleListWrapper>
      )}
    </PuzzleGroupDiv>
  );
};

export default RelatedPuzzleGroup;
