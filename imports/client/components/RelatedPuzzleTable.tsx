import React from "react";
import { indexedById } from "../../lib/listUtils";
import type { PuzzleType } from "../../lib/models/Puzzles";
import type { TagType } from "../../lib/models/Tags";
import { sortPuzzlesByRelevanceWithinPuzzleGroup } from "../../lib/puzzle-sort-and-group";
import useIsOffsite from "../hooks/useIsOffsite";
import useTagSynonyms from "../hooks/useTagSynonyms";
import PuzzleTable from "./PuzzleTable";

const RelatedPuzzleTable = React.memo(
  ({
    relatedPuzzles,
    allTags,
    sharedTag,
    segmentAnswers,
  }: {
    relatedPuzzles: PuzzleType[];
    allTags: TagType[];
    sharedTag: TagType | undefined;
    segmentAnswers?: boolean;
  }) => {
    // Puzzles that need someone on site sink for remote hunters, as on the
    // puzzle list
    const isOffsite = useIsOffsite();
    const tagSynonyms = useTagSynonyms();
    // Sort the puzzles within each tag group by interestingness.  For instance, metas
    // should probably be at the top of the group, then of the round puzzles, unsolved should
    // maybe sort above solved, and then perhaps by unlock order.
    const tagIndex = indexedById(allTags);
    const sortedPuzzles = sortPuzzlesByRelevanceWithinPuzzleGroup(
      relatedPuzzles,
      sharedTag,
      tagIndex,
      isOffsite,
      tagSynonyms,
    );
    return (
      <PuzzleTable puzzles={sortedPuzzles} segmentAnswers={segmentAnswers} />
    );
  },
);

export default RelatedPuzzleTable;
