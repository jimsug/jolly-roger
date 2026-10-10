import TypedMethod from "./TypedMethod";

// The hunt's board, or the puzzle's when puzzleId is given. Returns the
// board's Document id, creating the board on the service when there isn't
// one yet.
export default new TypedMethod<{ huntId: string; puzzleId?: string }, string>(
  "Hunts.methods.ensureBoard",
);
