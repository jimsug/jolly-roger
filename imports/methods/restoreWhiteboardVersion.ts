import TypedMethod from "./TypedMethod";

// Puts the board back as a version has it. Needs edit access.
export default new TypedMethod<{ boardId: string; versionId: string }, void>(
  "Whiteboards.methods.restoreVersion",
);
