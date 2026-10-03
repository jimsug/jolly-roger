import React from "react";
import type { PuzzleType } from "../../lib/models/Puzzles";
import type { TagType } from "../../lib/models/Tags";
import type { PuzzleViewers } from "../../lib/puzzleViewers";
import Puzzle from "./Puzzle";

const PuzzleList = React.memo(
  ({
    puzzles,
    bookmarked,
    allTags,
    canUpdate,
    suppressTags,
    segmentAnswers,
    showViewers,
    viewers,
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
    showViewers?: boolean;
    viewers?: Record<string, PuzzleViewers>;
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
              showViewers={showViewers}
              viewers={viewers?.[puzzle._id]}
            />
          );
        })}
      </div>
    );
  },
);

export default PuzzleList;
