import TypedMethod from "./TypedMethod";

// Resolved threads stay in chat but are hidden on the board by default. A new
// reply reopens one.
export default new TypedMethod<{ messageId: string; resolved: boolean }, void>(
  "Whiteboards.methods.setCommentResolved",
);
