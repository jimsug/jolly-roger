import TypedMethod from "./TypedMethod";

// Unlocks a locked puzzle, optionally setting its URL at the same time.
export default new TypedMethod<
  {
    puzzleId: string;
    url?: string;
  },
  void
>("Puzzles.methods.unlock");
