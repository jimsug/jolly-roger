import TypedMethod from "./TypedMethod";

export default new TypedMethod<
  {
    puzzleId: string;
    title: string;
    url?: string;
    tags: string[];
    expectedAnswerCount: number;
    allowDuplicateUrls?: boolean;
    locked?: boolean;
    lockedSummary?: string;
  },
  void
>("Puzzles.methods.update");
