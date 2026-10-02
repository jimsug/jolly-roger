import { z } from "zod";
import { allowedEmptyString, foreignKey, nonEmptyString } from "./customTypes";
import type { ModelType } from "./Model";
import SoftDeletedModel from "./SoftDeletedModel";
import withCommon from "./withCommon";

export interface ChatAttachmentType {
  url: string;
  filename: string;
  mimeType: string;
  size?: number;
}

const ChatAttachment = z.object({
  url: nonEmptyString,
  filename: nonEmptyString,
  mimeType: nonEmptyString,
  size: z.number().optional(),
});

const UserMentionBlock = z.object({
  type: z.literal("mention"),
  userId: foreignKey,
});
export type ChatMessageMentionNodeType = z.infer<typeof UserMentionBlock>;

const RoleMentionBlock = z.object({
  type: z.literal("role-mention"),
  roleId: z.literal("operator"), // expand this into a union if we add more roles
});
export type ChatMessageRoleMentionNodeType = z.infer<typeof RoleMentionBlock>;

const ImageBlock = z.object({
  type: z.literal("image"),
  url: z.string().url(),
});
export type ChatMessageImageNodeType = z.infer<typeof ImageBlock>;

const PuzzleBlock = z.object({
  type: z.literal("puzzle"),
  puzzleId: foreignKey,
});
export type ChatMessagePuzzleNodeType = z.infer<typeof PuzzleBlock>;

const TextBlock = z.object({
  text: allowedEmptyString,
});
export type ChatMessageTextNodeType = z.infer<typeof TextBlock>;

const ContentNode = z.union([
  UserMentionBlock,
  RoleMentionBlock,
  ImageBlock,
  PuzzleBlock,
  TextBlock,
]);
export type ChatMessageContentNodeType = z.infer<typeof ContentNode>;

export const ChatMessageContent = z.object({
  type: z.literal("message"),
  children: ContentNode.array(),
});
export type ChatMessageContentType = z.infer<typeof ChatMessageContent>;

export function contentFromMessage(msg: string): ChatMessageContentType {
  return {
    type: "message" as const,
    children: [{ text: msg }],
  };
}

// Where a whiteboard comment is pinned. With node, x and y are an offset from
// the node's top-left corner in board units; without, they're board
// coordinates.
const CommentAnchor = z.object({
  node: foreignKey.optional(),
  x: z.number(),
  y: z.number(),
  resolvedAt: z.date().optional(),
  resolvedBy: foreignKey.optional(),
});

const ChatMessage = withCommon(
  z.object({
    hunt: foreignKey,
    // The puzzle to which this chat was sent.
    puzzle: foreignKey,
    // The message contents.
    content: ChatMessageContent,
    // If absent, this message is considered a "system" message
    sender: foreignKey.optional(),
    // The date this message was sent.  Used for ordering chats in the log.
    timestamp: z.date(),
    pinTs: z.date().nullable().optional(),
    parentId: foreignKey.nullable().optional(),
    // Not really a foreign key, since this is always another message when present
    attachments: ChatAttachment.array().optional(),
    // Set on the message that starts a whiteboard comment thread. Replies are
    // ordinary chat replies to it.
    comment: CommentAnchor.optional(),
    // The id of the comment a reply (at any depth) belongs to. Written only by
    // the server.
    thread: foreignKey.optional(),
  }),
);
const ChatMessages = new SoftDeletedModel("jr_chatmessages", ChatMessage);
ChatMessages.addIndex({ deleted: 1, puzzle: 1 });
ChatMessages.addIndex({ hunt: 1, createdAt: 1 });
ChatMessages.addIndex(
  { thread: 1 },
  { partialFilterExpression: { thread: { $exists: true } } },
);
ChatMessages.addIndex(
  { puzzle: 1, "comment.node": 1 },
  { partialFilterExpression: { comment: { $exists: true } } },
);
export type ChatMessageType = ModelType<typeof ChatMessages>;

export default ChatMessages;
