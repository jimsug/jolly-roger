import { useTracker } from "meteor/react-meteor-data";
import Puzzles from "../../lib/models/Puzzles";
import Tags from "../../lib/models/Tags";
import WhiteboardNodes from "../../lib/models/WhiteboardNodes";
import type { RoundState } from "../../lib/whiteboard/rounds";
import { roundStates } from "../../lib/whiteboard/rounds";

// How far along each frame's round is, kept up to date. Reads only the
// fields roundStates reads, so moving a card or renaming a puzzle doesn't
// recount every round.
export default function useRoundStates(
  boardId: string,
  huntId: string,
): Map<string, RoundState> {
  return useTracker(
    () =>
      roundStates(
        WhiteboardNodes.find(
          { board: boardId, type: { $in: ["frame", "puzzle"] } },
          {
            projection: { type: 1, parent: 1, puzzle: 1, tag: 1, hidden: 1 },
          },
        ).fetch(),
        Puzzles.find(
          { hunt: huntId, kind: { $ne: "whiteboard" } },
          {
            projection: {
              tags: 1,
              answers: 1,
              expectedAnswerCount: 1,
              completedWithNoAnswer: 1,
            },
          },
        ).fetch(),
        Tags.find({ hunt: huntId }, { projection: { name: 1 } }).fetch(),
      ),
    [boardId, huntId],
  );
}
