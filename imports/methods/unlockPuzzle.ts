import TypedMethod from "./TypedMethod";

export default new TypedMethod<
  {
    puzzleId: string;
    url?: string;
  },
  void
>("Puzzles.methods.unlock");
