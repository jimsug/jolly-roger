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
    // Omitted leaves the lock alone; false unlocks (without the unlock
    // announcement that Puzzles.methods.unlock posts to chat).
    locked?: boolean;
    lockedSummary?: string;
  },
  void
>("Puzzles.methods.update");
