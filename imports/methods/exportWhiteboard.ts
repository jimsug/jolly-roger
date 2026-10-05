import TypedMethod from "./TypedMethod";

// One chunk of the board as it is now, gzipped in a version's payload format
// ({ format, nodes, edges }, ink included). A big board comes in chunkCount
// chunks, fetched one call at a time and joined in order. Chunk 0 starts an
// export; a later chunk names it by the hash chunk 0 returned, and comes
// from that same export while the server still has it. If not, the board is
// read afresh, and a different hash means the board changed in between.
// Anyone in the hunt can download the board, archived or not.
export default new TypedMethod<
  { boardId: string; index: number; hash?: string },
  { data: Uint8Array; chunkCount: number; hash: string }
>("Whiteboards.methods.exportBoard");
