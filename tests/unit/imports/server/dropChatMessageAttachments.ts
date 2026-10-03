import { Random } from "meteor/random";
import { assert } from "chai";
import ChatMessages from "../../../../imports/lib/models/ChatMessages";
import { dropChatMessageAttachments } from "../../../../imports/server/migrations/58-drop-chat-message-attachments";
import resetDatabase from "../../../lib/resetDatabase";

// Inserts a chat message shaped like one the fork wrote: null pin and parent
// fields plus an empty attachments array. Document validation is bypassed
// because that is the point.
async function insertLegacyMessage(extra: Record<string, unknown> = {}) {
  const _id = Random.id();
  await ChatMessages.collection.rawCollection().insertOne(
    {
      _id,
      hunt: Random.id(),
      puzzle: Random.id(),
      content: { type: "message", children: [{ text: "legacy" }] },
      sender: Random.id(),
      timestamp: new Date(),
      pinTs: null,
      parentId: null,
      attachments: [],
      deleted: false,
      createdAt: new Date(),
      createdBy: Random.id(),
      updatedAt: new Date(),
      ...extra,
    } as any,
    { bypassDocumentValidation: true },
  );
  return _id;
}

describe("dropChatMessageAttachments migration", function () {
  it("makes messages that carry attachments writable again", async function () {
    await resetDatabase("dropChatMessageAttachments legacy");
    const messageId = await insertLegacyMessage();

    // Without the migration, the schema validator rejects any update
    await assert.isRejected(
      ChatMessages.updateAsync(messageId, { $set: { pinTs: new Date() } }),
      /Document failed validation/,
    );

    await dropChatMessageAttachments();

    const message = await ChatMessages.findOneAsync(messageId);
    assert.notProperty(message ?? {}, "attachments");
    // The null pin and parent fields the fork wrote are still valid
    assert.isNull(message?.pinTs);
    assert.isNull(message?.parentId);

    await ChatMessages.updateAsync(messageId, { $set: { pinTs: new Date() } });
    assert.instanceOf(
      (await ChatMessages.findOneAsync(messageId))?.pinTs,
      Date,
    );
  });

  it("fixes deleted messages too", async function () {
    await resetDatabase("dropChatMessageAttachments deleted");
    const messageId = await insertLegacyMessage({ deleted: true });

    await dropChatMessageAttachments();

    const message = await ChatMessages.findOneDeletedAsync(messageId);
    assert.isDefined(message);
    assert.notProperty(message ?? {}, "attachments");

    await ChatMessages.undestroyAsync(messageId);
    assert.isDefined(await ChatMessages.findOneAsync(messageId));
  });
});
