import TypedMethod from "./TypedMethod";

export default new TypedMethod<
  {
    puzzleId: string;
    title: string;
    url?: string;
    tags: string[];
    expectedAnswerCount: number;
    allowDuplicateUrls?: boolean;
    completedWithNoAnswer?: boolean;
    markedComplete?: boolean;
  },
  void
>("Puzzles.methods.update");
