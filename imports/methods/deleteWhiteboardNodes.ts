import TypedMethod from "./TypedMethod";

// Puzzle cards and seeded frames are hidden rather than removed, so placement
// doesn't put them back. Deleting one segment of an ink stroke deletes the
// whole stroke.
export default new TypedMethod<{ boardId: string; nodeIds: string[] }, void>(
  "Whiteboards.methods.deleteNodes",
);
