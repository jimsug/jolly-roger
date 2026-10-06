import TypedMethod from "./TypedMethod";

// Puts some of a version's nodes back. Needs edit access.
export default new TypedMethod<
  { boardId: string; versionId: string; nodeIds: string[] },
  { restored: boolean }
>("Whiteboards.methods.restoreItems");
