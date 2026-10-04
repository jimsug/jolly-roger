import TypedPublication from "./TypedPublication";

// A board's history, without the payloads, for anyone in the hunt.
export default new TypedPublication<{ boardId: string }>(
  "Whiteboards.publications.versionsForBoard",
);
