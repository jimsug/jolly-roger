import TypedMethod from "./TypedMethod";

// Feeder arrows are hidden rather than removed, so they don't come back.
export default new TypedMethod<{ boardId: string; edgeIds: string[] }, void>(
  "Whiteboards.methods.deleteEdges",
);
