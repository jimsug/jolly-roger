import type { ChatAttachmentType } from "../lib/models/ChatMessages";
import TypedMethod from "./TypedMethod";

// Pins a new whiteboard comment. With node, x and y are an offset from the
// node's top-left corner; without, they're board coordinates.
export type CommentAnchorInput = { node?: string; x: number; y: number };

export default new TypedMethod<
  {
    puzzleId: string;
    content: string;
    parentId?: string | null;
    attachments?: ChatAttachmentType[];
    // Only on a whiteboard's own puzzle, and never on a reply.
    comment?: CommentAnchorInput;
  },
  void
>("ChatMessages.methods.send");
