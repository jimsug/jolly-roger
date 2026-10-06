import TypedMethod from "./TypedMethod";

// Takes nodes off the board. Needs edit access.
export default new TypedMethod<{ boardId: string; nodeIds: string[] }, void>(
  "Whiteboards.methods.deleteNodes",
);
