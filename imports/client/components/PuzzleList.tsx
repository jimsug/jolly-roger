import React from "react";
import type { PuzzleType } from "../../lib/models/Puzzles";
import type { TagType } from "../../lib/models/Tags";
import type { PuzzleSolvers } from "../../lib/puzzleSolvers";
import Puzzle from "./Puzzle";

const PuzzleList = React.memo(
  ({
    puzzles,
    bookmarked,
    allTags,
    canUpdate,
    suppressTags,
    segmentAnswers,
    showSolvers,
    solvers,
  }: {
    // The puzzles to show in this list
    puzzles: PuzzleType[];
    bookmarked: Set<string>;
    // All tags for this hunt, including those not used by any puzzles
    allTags: TagType[];
    canUpdate: boolean;
    suppressTags?: string[];
    segmentAnswers?: boolean;
    // Whether to show who is on each puzzle, and who that is (by puzzle id)
    showSolvers?: boolean;
    solvers?: Record<string, PuzzleSolvers>;
  }) => {
    // This component just renders the puzzles provided, in order.
    // Adjusting order based on tags, tag groups, etc. is to be done at
    // a higher layer.
    return (
      <div>
        {puzzles.map((puzzle) => {
          return (
            <Puzzle
              key={puzzle._id}
              puzzle={puzzle}
              bookmarked={bookmarked.has(puzzle._id)}
              allTags={allTags}
              canUpdate={canUpdate}
              suppressTags={suppressTags}
              segmentAnswers={segmentAnswers}
              showSolvers={showSolvers}
              solvers={solvers?.[puzzle._id]}
            />
          );
        })}
      </div>
    );
  },
);

export default PuzzleList;
