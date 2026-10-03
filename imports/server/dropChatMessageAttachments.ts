import ChatMessages from "../lib/models/ChatMessages";

// The Palindrome fork wrote an attachments array (always empty: nothing ever
// uploaded one) on every chat message, and null for an unset pinTs or
// parentId. The schema declares neither the array nor a null, so a message
// still carrying them would fail validation on its next update (a pin, a bare
// /unpin, or the account-merge job rewriting its sender). One pipeline update
// per message, validation bypassed, raw collection so soft-deleted messages
// are fixed too.
export default async function dropChatMessageAttachments() {
  await ChatMessages.collection.rawCollection().updateMany(
    {
      $or: [
        { attachments: { $exists: true } },
        // $type matches an explicit null, not a missing field
        { pinTs: { $type: "null" } },
        { parentId: { $type: "null" } },
      ],
    },
    [
      { $unset: "attachments" },
      {
        $set: {
          pinTs: { $ifNull: ["$pinTs", "$$REMOVE"] },
          parentId: { $ifNull: ["$parentId", "$$REMOVE"] },
        },
      },
    ],
    { bypassDocumentValidation: true },
  );
}
