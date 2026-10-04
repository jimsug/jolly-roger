import TypedMethod from "./TypedMethod";

// Puts the board back as a version has it, undoing every edit since by
// anyone. The board as it was is recorded first, so the restore can itself be
// undone. Needs edit access.
export default new TypedMethod<{ boardId: string; versionId: string }, void>(
  "Whiteboards.methods.restoreVersion",
);
