import TypedMethod from "./TypedMethod";

// Locks or unlocks every frame on a board at once, for when the map has
// settled. Only for the hunt's operators.
export default new TypedMethod<{ boardId: string; locked: boolean }, void>(
  "Whiteboards.methods.setLayoutLocked",
);
