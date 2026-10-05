import TypedMethod from "./TypedMethod";

// Replaces the content of one of the caller's own messages. Reactions, system
// messages and deleted messages can't be edited.
export default new TypedMethod<
  {
    messageId: string;
    // A JSON string, as sendChatMessage takes it
    content: string;
  },
  void
>("ChatMessages.methods.edit");
