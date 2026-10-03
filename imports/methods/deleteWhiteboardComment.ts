import TypedMethod from "./TypedMethod";

// Deletes a comment and its whole thread. Its author can do this until someone
// else replies; operators always can.
export default new TypedMethod<{ messageId: string }, void>(
  "Whiteboards.methods.deleteComment",
);
