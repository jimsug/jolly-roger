import TypedMethod from "./TypedMethod";

export default new TypedMethod<
  {
    puzzleId: string;
    content: string;
    // The message this one replies to, which must be on the same puzzle
    parentId?: string;
  },
  void
>("ChatMessages.methods.send");
