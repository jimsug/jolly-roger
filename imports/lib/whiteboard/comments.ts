import type {
  ChatMessageCommentAnchorType,
  ChatMessageType,
} from "../models/ChatMessages";
import type { Point, Rect } from "./layout";

type CommentMessage = Pick<
  ChatMessageType,
  "_id" | "sender" | "timestamp" | "thread" | "comment"
>;

export interface CommentThread<M extends CommentMessage = CommentMessage> {
  root: M;
  // Replies (reactions excluded), oldest first.
  replies: M[];
  reactions: M[];
  // Everyone who has posted, starting with whoever left the comment.
  participants: string[];
  lastActivity: Date;
  resolved: boolean;
}

// Gathers a board's comment messages into threads keyed by the root's id.
// Messages whose root isn't among them (e.g. it was deleted) are dropped.
export function groupThreads<M extends CommentMessage>(
  messages: M[],
  isReaction: (message: M) => boolean,
): Map<string, CommentThread<M>> {
  const threads = new Map<string, CommentThread<M>>();
  messages
    .filter((m) => m.comment)
    .forEach((root) => {
      threads.set(root._id, {
        root,
        replies: [],
        reactions: [],
        participants: root.sender ? [root.sender] : [],
        lastActivity: root.timestamp,
        resolved: !!root.comment?.resolvedAt,
      });
    });

  messages
    .filter((m) => !m.comment && m.thread)
    .toSorted((a, b) => +a.timestamp - +b.timestamp)
    .forEach((message) => {
      const thread = message.thread && threads.get(message.thread);
      if (!thread) return;
      if (isReaction(message)) {
        thread.reactions.push(message);
        return;
      }
      thread.replies.push(message);
      if (message.sender && !thread.participants.includes(message.sender)) {
        thread.participants.push(message.sender);
      }
      if (+message.timestamp > +thread.lastActivity) {
        thread.lastActivity = message.timestamp;
      }
    });
  return threads;
}

// Where a comment's pin goes on the board. A pin on a node stays on it even
// if the node has since been made smaller.
export function commentPosition(
  anchor: ChatMessageCommentAnchorType,
  node: Rect | undefined,
): Point | undefined {
  if (!anchor.node) return { x: anchor.x, y: anchor.y };
  if (!node) return undefined;
  return {
    x: node.x + Math.min(Math.max(anchor.x, 0), node.width),
    y: node.y + Math.min(Math.max(anchor.y, 0), node.height),
  };
}

// Whether a thread has activity since the viewer last opened it.
export function isUnread(
  thread: CommentThread,
  seenAt: number | undefined,
  selfId: string | undefined,
): boolean {
  const latest = [thread.root, ...thread.replies]
    .filter((m) => m.sender !== selfId)
    .reduce((max, m) => Math.max(max, +m.timestamp), 0);
  return latest > (seenAt ?? 0);
}

export interface ThreadListRow<T extends CommentThread = CommentThread> {
  thread: T;
  unread: boolean;
}

// A board's threads as its Comments panel lists them: unread first, then the
// most recent activity first, leaving out resolved threads unless they're
// being shown. seen holds when the viewer last read each thread.
export function threadList<T extends CommentThread>(
  threads: Iterable<T>,
  {
    seen,
    selfId,
    showResolved,
  }: {
    seen: Record<string, number>;
    selfId: string | undefined;
    showResolved: boolean;
  },
): ThreadListRow<T>[] {
  return [...threads]
    .filter((thread) => showResolved || !thread.resolved)
    .map((thread) => ({
      thread,
      unread: isUnread(thread, seen[thread.root._id], selfId),
    }))
    .toSorted(
      (a, b) =>
        Number(b.unread) - Number(a.unread) ||
        +b.thread.lastActivity - +a.thread.lastActivity ||
        a.thread.root._id.localeCompare(b.thread.root._id),
    );
}

// The unread thread to go to after `current`, taking threads newest activity
// first and starting again from the newest after the oldest. With no current
// thread (or one not listed) it's the newest unread one.
export function nextUnread(
  rows: ThreadListRow[],
  current: string | undefined,
): string | undefined {
  const byActivity = rows.toSorted(
    (a, b) =>
      +b.thread.lastActivity - +a.thread.lastActivity ||
      a.thread.root._id.localeCompare(b.thread.root._id),
  );
  const start = byActivity.findIndex((r) => r.thread.root._id === current);
  for (let step = 1; step <= byActivity.length; step++) {
    const row = byActivity[(start + step) % byActivity.length];
    if (row?.unread && row.thread.root._id !== current) {
      return row.thread.root._id;
    }
  }
  return undefined;
}
