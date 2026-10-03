import ChatMessages from "../../lib/models/ChatMessages";
import Migrations from "./Migrations";

// The Palindrome fork wrote an attachments array (always empty: nothing ever
// uploaded one) on every chat message, which the schema no longer declares,
// so a message still carrying it would fail validation on its next update (a
// pin, a bare /unpin, or the account-merge job rewriting its sender). Same
// pattern as migration 54: validation bypassed, raw collection so soft-deleted
// messages are fixed too.
export async function dropChatMessageAttachments() {
  await ChatMessages.collection
    .rawCollection()
    .updateMany(
      { attachments: { $exists: true } },
      { $unset: { attachments: "" } },
      { bypassDocumentValidation: true },
    );
}

Migrations.add({
  version: 58,
  name: "Drop attachments from chat messages",
  up: dropChatMessageAttachments,
});
