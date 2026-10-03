import TypedMethod from "./TypedMethod";

export default new TypedMethod<
  {
    messageId: string;
    pinned: boolean;
  },
  void
>("ChatMessages.methods.setPin");
