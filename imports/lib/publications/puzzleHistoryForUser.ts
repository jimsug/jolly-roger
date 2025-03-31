import TypedPublication from "./TypedPublication";

export default new TypedPublication<{ userId: string }>(
  "PuzzleHistory.publications.forUser",
);
