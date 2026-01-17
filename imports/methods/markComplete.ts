import TypedMethod from "./TypedMethod";

export default new TypedMethod<
  { puzzleId: string; markedComplete: boolean },
  void
>("Puzzles.methods.markComplete");
