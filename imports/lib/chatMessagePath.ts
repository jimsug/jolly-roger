import type { ChatMessageType } from "./models/ChatMessages";

// The comment thread a message belongs to: its root's id, which for the root
// itself is its own.
export function commentThreadOf(
  message: Pick<ChatMessageType, "_id" | "thread" | "comment">,
): string | undefined {
  return message.thread ?? (message.comment ? message._id : undefined);
}

// Where a link to a chat message goes. A message on an ordinary puzzle opens
// the puzzle at that message. A message on the whiteboard's hidden puzzle
// opens the board instead, at its comment thread if it's in one, with chat
// scrolled to the message itself.
export default function chatMessagePath({
  hunt,
  puzzle,
  whiteboard,
  message,
  thread,
}: {
  hunt: string;
  puzzle: string;
  whiteboard: boolean;
  message?: string;
  // The comment thread the message belongs to (see commentThreadOf).
  thread?: string;
}): string {
  const hash = message ? `#msg=${encodeURIComponent(message)}` : "";
  if (!whiteboard) {
    return `/hunts/${hunt}/puzzles/${puzzle}${hash}`;
  }
  const query = thread ? `?comment=${encodeURIComponent(thread)}` : "";
  return `/hunts/${hunt}/whiteboard${query}${hash}`;
}
