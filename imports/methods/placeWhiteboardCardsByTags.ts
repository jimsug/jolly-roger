import TypedMethod from "./TypedMethod";

// Hands cards (by node id, not puzzle id) back to placement. Needs edit access.
export default new TypedMethod<{ boardId: string; nodeIds: string[] }, void>(
  "Whiteboards.methods.placeByTags",
);
