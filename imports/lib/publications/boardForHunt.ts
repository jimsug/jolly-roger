import TypedPublication from "./TypedPublication";

// The hunt's board documents, and whether a board service is set up
export default new TypedPublication<{ huntId: string }>(
  "Documents.publications.boardForHunt",
);
