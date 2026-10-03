import type { ChatMessageCommentAnchorType } from "../lib/models/ChatMessages";
import TypedMethod from "./TypedMethod";

// Where a new whiteboard comment is pinned.
export type CommentAnchorInput = Pick<
  ChatMessageCommentAnchorType,
  "node" | "x" | "y"
>;

export default new TypedMethod<
  {
    puzzleId: string;
    content: string;
    // The message this one replies to, which must be on the same puzzle
    parentId?: string;
    // Only on a whiteboard's own puzzle, and never on a reply
    comment?: CommentAnchorInput;
  },
  void
>("ChatMessages.methods.send");
