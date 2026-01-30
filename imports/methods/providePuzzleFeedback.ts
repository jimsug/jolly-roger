import TypedMethod from "./TypedMethod";

export default new TypedMethod<
  {
    puzzleId: string;
    score: number;
    comment?: string;
  },
  void
>("Puzzles.methods.provideFeedback");
