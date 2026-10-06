import TypedMethod from "./TypedMethod";

// One chunk of the board as it is now, for anyone in the hunt.
export default new TypedMethod<
  { boardId: string; index: number; hash?: string },
  { data: Uint8Array; chunkCount: number; hash: string }
>("Whiteboards.methods.exportBoard");
