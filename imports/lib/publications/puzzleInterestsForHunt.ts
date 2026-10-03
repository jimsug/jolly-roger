import TypedPublication from "./TypedPublication";

export default new TypedPublication<{
  huntId: string;
  // Narrows it to one puzzle's interest
  puzzleId?: string;
}>("PuzzleInterests.publications.forHunt");
