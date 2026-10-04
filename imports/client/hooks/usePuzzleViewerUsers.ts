import { useTracker } from "meteor/react-meteor-data";
import MeteorUsers from "../../lib/models/MeteorUsers";
import {
  type PuzzleViewers,
  puzzleViewerPeople,
} from "../../lib/puzzleViewers";

// One puzzle's callers and viewers as users to draw, for the puzzle list's
// row and the whiteboard's card. Display names and avatars come from the
// subscriptions usePuzzleViewers makes.
export default function usePuzzleViewerUsers(
  viewers: PuzzleViewers | undefined,
) {
  return useTracker(
    () => puzzleViewerPeople(viewers, (id) => MeteorUsers.findOne(id)),
    [viewers],
  );
}
