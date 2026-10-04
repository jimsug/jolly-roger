import TypedMethod from "./TypedMethod";

// Hands puzzle cards back to placement: they go into the frame their tags
// choose and follow their tags from then on. Takes card node ids, not puzzle
// ids. Needs edit access.
export default new TypedMethod<{ boardId: string; nodeIds: string[] }, void>(
  "Whiteboards.methods.placeByTags",
);
