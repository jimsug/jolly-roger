import { useTracker } from "meteor/react-meteor-data";
import { useCallback, useMemo } from "react";
import isReaction from "../../../lib/isReaction";
import type { ChatMessageType } from "../../../lib/models/ChatMessages";
import ChatMessages from "../../../lib/models/ChatMessages";
import type { CommentThread } from "../../../lib/whiteboard/comments";
import { groupThreads } from "../../../lib/whiteboard/comments";
import { useWhiteboardCommentsSeen } from "../../hooks/persisted-state";

type BoardThread = CommentThread<ChatMessageType>;

// The board's comment threads, from its chat (which the puzzle page around
// the board subscribes to).
export default function useComments(puzzleId: string) {
  const messages = useTracker(
    () =>
      ChatMessages.find(
        {
          puzzle: puzzleId,
          $or: [{ comment: { $exists: true } }, { thread: { $exists: true } }],
        },
        { sort: { timestamp: 1 } },
      ).fetch(),
    [puzzleId],
  );
  return useMemo(() => groupThreads(messages, isReaction), [messages]);
}

// When this viewer last read each thread, so pins can show what's new.
export function useSeenComments(
  boardId: string,
  threads: Map<string, BoardThread>,
) {
  const [seen, setSeen] = useWhiteboardCommentsSeen(boardId);

  const markSeen = useCallback(
    (threadId: string, at: number) => {
      if ((seen[threadId] ?? 0) >= at) return;
      // Forget threads that have since been deleted.
      setSeen((current) => ({
        ...Object.fromEntries(
          Object.entries(current).filter(([id]) => threads.has(id)),
        ),
        [threadId]: at,
      }));
    },
    [seen, setSeen, threads],
  );
  return [seen, markSeen] as const;
}
