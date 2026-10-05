import TypedMethod from "./TypedMethod";

// Deletes one of the caller's own messages, leaving a "Message deleted"
// placeholder in its place. A whiteboard comment goes through
// deleteWhiteboardComment instead, and a reaction through removeChatReaction.
export default new TypedMethod<{ messageId: string }, void>(
  "ChatMessages.methods.delete",
);
