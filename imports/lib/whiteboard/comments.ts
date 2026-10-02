export interface CommentAnchor {
  // With a node, x/y are an offset from its top-left corner; without, they're
  // board coordinates.
  node?: string;
  x: number;
  y: number;
  resolvedAt?: Date;
  resolvedBy?: string;
}

export interface CommentMessage {
  _id: string;
  sender?: string;
  timestamp: Date;
  parentId?: string | null;
  thread?: string;
  comment?: CommentAnchor;
}

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
    .filter((m) => !m.comment && m.thread && threads.has(m.thread))
    .sort((a, b) => +a.timestamp - +b.timestamp)
    .forEach((message) => {
      const thread = threads.get(message.thread!)!;
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

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Where a comment's pin goes on the board. A pin on a node stays on it even
// if the node has since been made smaller.
export function commentPosition(
  anchor: CommentAnchor,
  node: Box | undefined,
): { x: number; y: number } | undefined {
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
