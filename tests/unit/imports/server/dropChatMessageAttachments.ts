import { Random } from "meteor/random";
import { assert } from "chai";
import ChatMessages from "../../../../imports/lib/models/ChatMessages";
import dropChatMessageAttachments from "../../../../imports/server/dropChatMessageAttachments";
import resetDatabase from "../../../lib/resetDatabase";

// Inserts a chat message shaped like one the fork wrote: null pin and parent
// fields plus an empty attachments array. Document validation is bypassed
// because that is the point, and the untyped collection takes the fields the
// schema no longer has.
async function insertLegacyMessage(extra: Record<string, unknown> = {}) {
  const _id = Random.id();
  await ChatMessages.collection
    .rawDatabase()
    .collection<{ _id: string; [field: string]: unknown }>("jr_chatmessages")
    .insertOne(
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
      },
      { bypassDocumentValidation: true },
    );
  return _id;
}

describe("dropChatMessageAttachments", function () {
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
    assert.isDefined(message);
    assert.notProperty(message, "attachments");
    // An unset pin or parent is left out, not null
    assert.notProperty(message, "pinTs");
    assert.notProperty(message, "parentId");

    await ChatMessages.updateAsync(messageId, { $set: { pinTs: new Date() } });
    assert.instanceOf(
      (await ChatMessages.findOneAsync(messageId))?.pinTs,
      Date,
    );
  });

  it("drops a null pin or parent from a message without attachments", async function () {
    await resetDatabase("dropChatMessageAttachments nulls");
    // Meteor's driver leaves undefined fields out of the document
    const messageId = await insertLegacyMessage({ attachments: undefined });
    assert.notProperty(
      await ChatMessages.collection.rawCollection().findOne({ _id: messageId }),
      "attachments",
    );

    // A null is as invalid as an undeclared field
    await assert.isRejected(
      ChatMessages.updateAsync(messageId, { $set: { pinTs: new Date() } }),
      /Document failed validation/,
    );

    await dropChatMessageAttachments();

    const message = await ChatMessages.findOneAsync(messageId);
    assert.isDefined(message);
    assert.notProperty(message, "pinTs");
    assert.notProperty(message, "parentId");
  });

  it("keeps a real pin and parent", async function () {
    await resetDatabase("dropChatMessageAttachments kept");
    const pinTs = new Date();
    const parentId = Random.id();
    const messageId = await insertLegacyMessage({ pinTs, parentId });

    await dropChatMessageAttachments();

    const message = await ChatMessages.findOneAsync(messageId);
    assert.isDefined(message);
    assert.notProperty(message, "attachments");
    assert.equal(message.pinTs?.getTime(), pinTs.getTime());
    assert.equal(message.parentId, parentId);
  });

  it("fixes deleted messages too", async function () {
    await resetDatabase("dropChatMessageAttachments deleted");
    const messageId = await insertLegacyMessage({ deleted: true });

    await dropChatMessageAttachments();

    const message = await ChatMessages.findOneDeletedAsync(messageId);
    assert.isDefined(message);
    assert.notProperty(message, "attachments");
    assert.notProperty(message, "pinTs");

    await ChatMessages.undestroyAsync(messageId);
    assert.isDefined(await ChatMessages.findOneAsync(messageId));
  });
});
