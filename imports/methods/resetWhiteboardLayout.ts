import TypedMethod from "./TypedMethod";

// Lays the board out again as a new one's. Needs edit access and history.
export default new TypedMethod<{ boardId: string; putBack: boolean }, void>(
  "Whiteboards.methods.resetLayout",
);
