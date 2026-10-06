import TypedMethod from "./TypedMethod";

// Locks or unlocks every frame on a board at once. Operators only.
export default new TypedMethod<{ boardId: string; locked: boolean }, void>(
  "Whiteboards.methods.setLayoutLocked",
);
