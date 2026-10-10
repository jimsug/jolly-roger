import TypedMethod from "./TypedMethod";

// Removes the hunt's board (or the puzzle's when puzzleId is given) from
// the board service
export default new TypedMethod<{ huntId: string; puzzleId?: string }, void>(
  "Hunts.methods.deleteBoard",
);
