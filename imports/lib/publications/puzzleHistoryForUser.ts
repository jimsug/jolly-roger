import TypedPublication from "./TypedPublication";

export default new TypedPublication<{ puzzleId: string }>(
  "Puzzles.publications.historyForUser",
);
