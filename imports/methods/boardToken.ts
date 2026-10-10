import TypedMethod from "./TypedMethod";

// A short-lived token for the caller to open the hunt's board (or the
// puzzle's) with
export default new TypedMethod<{ huntId: string; puzzleId?: string }, string>(
  "Hunts.methods.boardToken",
);
