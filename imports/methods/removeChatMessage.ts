import TypedMethod from "./TypedMethod";

// Removes one of the caller's own reactions; ordinary messages can't be
// removed.
export default new TypedMethod<
  {
    messageId: string;
  },
  void
>("ChatMessages.methods.remove");
