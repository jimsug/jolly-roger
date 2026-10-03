import { z } from "zod";
import { foreignKey, nonEmptyString } from "../typedModel/customTypes";
import type { ModelType } from "../typedModel/Model";
import SoftDeletedModel from "../typedModel/SoftDeletedModel";
import withCommon from "../typedModel/withCommon";
import { ChatMessageContent } from "./ChatMessages";

// A notification triggered by a chat message sent by a user.
const ChatNotification = withCommon(
  z.object({
    // The userId of the user for whom this notification targets.
    user: foreignKey,

    // The sender of the chat message that tripped the user's dingwords.
    // System messages are forbidden from triggering dingword notifications.
    sender: foreignKey,

    // The puzzle to which this chat was sent.
    puzzle: foreignKey,
    // The hunt in which the puzzle resides.
    hunt: foreignKey,
    // The message content, if chat message v2.
    content: ChatMessageContent,
    // The date this message was sent.  Used for ordering chats in the log.
    timestamp: z.date(),
    // The chat message that triggered this notification, so the toast can
    // link straight to it. Rows written before this field existed lack it.
    message: foreignKey.optional(),
    // The user's dingwords that matched the message, so the toast can offer
    // to mute them. Absent when only an @-mention or role mention dinged.
    dingwords: nonEmptyString.array().optional(),
    // Whether an @-mention or role mention dinged the user (possibly as well
    // as dingwords), which a dingword mute must leave alone. Rows written
    // before this field existed lack it.
    mentioned: z.boolean().optional(),
    // The whiteboard comment thread the message belongs to (the root
    // comment's id), including when it is the root.
    thread: foreignKey.optional(),
  }),
);

const ChatNotifications = new SoftDeletedModel(
  "jr_chatnotifications",
  ChatNotification,
);
ChatNotifications.addIndex({ deleted: 1, user: 1 });
ChatNotifications.addIndex({ hunt: 1 });
ChatNotifications.addIndex(
  { thread: 1 },
  { partialFilterExpression: { thread: { $exists: true } } },
);
export type ChatNotificationType = ModelType<typeof ChatNotifications>;

export default ChatNotifications;
