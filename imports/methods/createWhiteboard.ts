import TypedMethod from "./TypedMethod";

// Returns the board id. Creating a board that already exists returns the
// existing one.
export default new TypedMethod<{ huntId: string }, string>(
  "Whiteboards.methods.create",
);
