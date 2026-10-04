import TypedMethod from "./TypedMethod";

// One chunk of a board version's gzipped payload. A version has chunkCount of
// them, fetched one call at a time and joined in order. Anyone in the hunt
// can read a board's history, archived or not.
export default new TypedMethod<
  { boardId: string; versionId: string; index: number },
  Uint8Array
>("Whiteboards.methods.fetchVersion");
