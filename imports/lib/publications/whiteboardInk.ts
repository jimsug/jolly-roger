import TypedPublication from "./TypedPublication";

export default new TypedPublication<{ boardId: string; outlines: boolean }>(
  "Whiteboards.publications.inkForBoard",
);
