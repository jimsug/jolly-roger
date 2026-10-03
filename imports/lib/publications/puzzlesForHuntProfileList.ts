import TypedPublication from "./TypedPublication";

// Just enough of a hunt's puzzles for the hunter list's "last active on"
// links: titles, plus the whiteboard's hidden puzzle, whose link goes to the
// board. Members only.
export default new TypedPublication<{ huntId: string }>(
  "Puzzles.publications.forHuntProfileList",
);
