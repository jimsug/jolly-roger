import TypedMethod from "./TypedMethod";

// Puts nodes back as a version has them, with everything in a frame and the
// lines touching them, leaving the rest of the board alone. An ordinary edit
// as far as history goes. Needs edit access. Says whether anything on the
// board changed.
export default new TypedMethod<
  { boardId: string; versionId: string; nodeIds: string[] },
  { restored: boolean }
>("Whiteboards.methods.restoreItems");
