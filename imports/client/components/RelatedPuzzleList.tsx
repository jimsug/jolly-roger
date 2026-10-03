import React from "react";
import { indexedById } from "../../lib/listUtils";
import type { PuzzleType } from "../../lib/models/Puzzles";
import type { TagType } from "../../lib/models/Tags";
import { sortPuzzlesByRelevanceWithinPuzzleGroup } from "../../lib/puzzle-sort-and-group";
import type { PuzzleViewers } from "../../lib/puzzleViewers";
import useIsOffsite from "../hooks/useIsOffsite";
import PuzzleList from "./PuzzleList";

const RelatedPuzzleList = React.memo(
  ({
    relatedPuzzles,
    bookmarked,
    allTags,
    canUpdate,
    sharedTag,
    suppressedTagIds,
    segmentAnswers,
    showViewers,
    viewers,
  }: {
    relatedPuzzles: PuzzleType[];
    bookmarked: Set<string>;
    allTags: TagType[];
    canUpdate: boolean;
    sharedTag: TagType | undefined;
    suppressedTagIds: string[];
    segmentAnswers?: boolean;
    showViewers?: boolean;
    viewers?: Record<string, PuzzleViewers>;
  }) => {
    // Puzzles that need someone on site sink for remote hunters
    const isOffsite = useIsOffsite();
    // Sort the puzzles within each tag group by interestingness.  For instance, metas
    // should probably be at the top of the group, then of the round puzzles, unsolved should
    // maybe sort above solved, and then perhaps by unlock order.
    const tagIndex = indexedById(allTags);
    const sortedPuzzles = sortPuzzlesByRelevanceWithinPuzzleGroup(
      relatedPuzzles,
      sharedTag,
      tagIndex,
      isOffsite,
    );
    return (
      <PuzzleList
        puzzles={sortedPuzzles}
        bookmarked={bookmarked}
        allTags={allTags}
        canUpdate={canUpdate}
        suppressTags={suppressedTagIds}
        segmentAnswers={segmentAnswers}
        showViewers={showViewers}
        viewers={viewers}
      />
    );
  },
);

export default RelatedPuzzleList;
export { RelatedPuzzleList };
