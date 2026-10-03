import { z } from "zod";
import { allowedEmptyString, foreignKey } from "../typedModel/customTypes";
import type { ModelType } from "../typedModel/Model";
import { Url } from "../typedModel/regexes";
import SoftDeletedModel from "../typedModel/SoftDeletedModel";
import withCommon from "../typedModel/withCommon";

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
  url: z.string().regex(Url),
});
export type ChatMessageImageNodeType = z.infer<typeof ImageBlock>;

// A link to another puzzle in the same hunt, rendered with its current title
// and solvedness.
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
    // When set, the message is pinned to the top of the puzzle's chat.
    pinTs: z.date().nullable().optional(),
    // The message this one replies to (or, for a reaction, the message it
    // reacts to). Always another message on the same puzzle.
    parentId: foreignKey.nullable().optional(),
  }),
);
const ChatMessages = new SoftDeletedModel("jr_chatmessages", ChatMessage);
ChatMessages.addIndex({ deleted: 1, puzzle: 1 });
ChatMessages.addIndex({ hunt: 1, createdAt: 1 });
// The puzzle history publications read everything a user sent or was
// mentioned in across their hunts
ChatMessages.addIndex({ hunt: 1, sender: 1 });
ChatMessages.addIndex({ hunt: 1, "content.children.userId": 1 });
export type ChatMessageType = ModelType<typeof ChatMessages>;

export default ChatMessages;
