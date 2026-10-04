import TypedMethod from "./TypedMethod";

// Lays the board's cards and round frames out again from the puzzle list,
// leaving everything else where it is. The board as it was is recorded first,
// so History can undo it. putBack also brings back cards, round frames and
// feeder arrows someone took off the board. Needs edit access and history
// turned on.
export default new TypedMethod<{ boardId: string; putBack: boolean }, void>(
  "Whiteboards.methods.resetLayout",
);
