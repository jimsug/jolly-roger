import TypedMethod from "./TypedMethod";

// Registers (or updates) the caller's interest in a locked puzzle.
export default new TypedMethod<
  {
    puzzleId: string;
    score: number;
    comment?: string;
  },
  void
>("Puzzles.methods.registerInterest");
