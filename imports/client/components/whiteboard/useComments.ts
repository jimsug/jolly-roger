import { useTracker } from "meteor/react-meteor-data";
import { useCallback, useMemo, useRef, useState } from "react";
import isReaction from "../../../lib/isReaction";
import type { ChatMessageType } from "../../../lib/models/ChatMessages";
import ChatMessages from "../../../lib/models/ChatMessages";
import chatMessagesForPuzzle from "../../../lib/publications/chatMessagesForPuzzle";
import type { CommentThread } from "../../../lib/whiteboard/comments";
import { groupThreads } from "../../../lib/whiteboard/comments";
import useTypedSubscribe from "../../hooks/useTypedSubscribe";
import { readLocal, writeLocal } from "./localStore";

export type BoardThread = CommentThread<ChatMessageType>;

// The board's comment threads, from its chat. The chat pane subscribes to
// the same messages, so this costs nothing extra.
export default function useComments(huntId: string, puzzleId: string) {
  useTypedSubscribe(chatMessagesForPuzzle, { puzzleId, huntId });
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
  const key = `whiteboard:commentsSeen:${boardId}`;
  const [seen, setSeen] = useState<Record<string, number>>(
    () => readLocal<Record<string, number>>(key) ?? {},
  );
  const threadsRef = useRef(threads);
  threadsRef.current = threads;

  const markSeen = useCallback(
    (threadId: string, at: number) => {
      setSeen((current) => {
        if ((current[threadId] ?? 0) >= at) return current;
        // Forget threads that have since been deleted.
        const next = Object.fromEntries(
          Object.entries(current).filter(([id]) => threadsRef.current.has(id)),
        );
        next[threadId] = at;
        writeLocal(key, next);
        return next;
      });
    },
    [key],
  );
  return [seen, markSeen] as const;
}
