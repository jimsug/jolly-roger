import dropChatMessageAttachments from "../dropChatMessageAttachments";
import Migrations from "./Migrations";

Migrations.add({
  version: 58,
  name: "Drop attachments and null pin and parent fields from chat messages",
  async up() {
    await dropChatMessageAttachments();
  },
});
