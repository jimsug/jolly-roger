import { Meteor } from "meteor/meteor";
import isReaction, { reactionEmoji } from "../lib/isReaction";
import type { ChatMessageContentType } from "../lib/models/ChatMessages";
import ChatMessages from "../lib/models/ChatMessages";
import MeteorUsers from "../lib/models/MeteorUsers";
import Puzzles from "../lib/models/Puzzles";
import type { CommentAnchorInput } from "../methods/sendChatMessage";
import { assertPuzzleLinksInHunt } from "./chatMessageContent";
import GlobalHooks from "./GlobalHooks";
import withLock from "./withLock";

export async function assertHuntMember(userId: string, huntId: string) {
  const user = await MeteorUsers.findOneAsync(userId, {
    projection: { hunts: 1 },
  });
  if (!user?.hunts?.includes(huntId)) {
    throw new Meteor.Error(
      403,
      `User ${userId} is not a member of hunt ${huntId}`,
    );
  }
}

export default async function sendChatMessageInternal({
  puzzleId,
  content,
  sender,
  pinTs,
  parentId,
  comment,
}: {
  puzzleId: string;
  content: ChatMessageContentType;
  // A user's message has been checked for membership by the caller; without
  // a sender, it's a system message from the server itself.
  sender: string | undefined;
  pinTs?: Date;
  parentId?: string;
  // Starts a whiteboard comment thread. The caller checks the anchor (see
  // assertValidCommentAnchor) and that this isn't a reply.
  comment?: CommentAnchorInput;
}) {
  const puzzle = await Puzzles.findOneAsync(puzzleId);
  if (!puzzle) {
    throw new Meteor.Error(404, "Unknown puzzle");
  }

  // A reply at any depth in a whiteboard comment thread belongs to that
  // thread.
  let thread: string | undefined;
  if (parentId !== undefined) {
    const parent = await ChatMessages.findOneAsync(parentId, {
      projection: { puzzle: 1, comment: 1, thread: 1, deletedAt: 1 },
    });
    if (parent?.puzzle !== puzzleId) {
      throw new Meteor.Error(
        400,
        `Message ${parentId} is not on puzzle ${puzzleId}`,
      );
    }
    // A deleted message can still be replied to, but its reactions went with
    // its content and none are shown on it
    if (parent.deletedAt && isReaction({ content, parentId })) {
      throw new Meteor.Error(400, "That message has been deleted");
    }
    thread = parent.comment ? parent._id : parent.thread;
  }

  await assertPuzzleLinksInHunt(content, puzzle.hunt);

  const insert = () =>
    ChatMessages.insertAsync({
      puzzle: puzzleId,
      hunt: puzzle.hunt,
      content,
      sender,
      timestamp: new Date(),
      ...(pinTs ? { pinTs } : {}),
      ...(parentId ? { parentId } : {}),
      ...(comment ? { comment } : {}),
      ...(thread ? { thread } : {}),
    });

  let msgId: string;
  if (
    sender !== undefined &&
    parentId !== undefined &&
    isReaction({ content, parentId })
  ) {
    // One reaction per emoji per user on a message: a double click or a
    // second tab reacting again lands on the existing one. The lock keeps two
    // at once from both missing the other and inserting. The puzzle is in the
    // selector so the { deleted, puzzle } index serves the lookup.
    const emoji = reactionEmoji({ content, parentId });
    const reaction = await withLock(
      `chat-message:${parentId}:reactions:${sender}`,
      async () => {
        const existing = await ChatMessages.find(
          { puzzle: puzzleId, parentId, sender },
          { projection: { content: 1, parentId: 1 } },
        ).fetchAsync();
        const duplicate = existing.find(
          (message) => isReaction(message) && reactionEmoji(message) === emoji,
        );
        return duplicate
          ? { id: duplicate._id, isNew: false }
          : { id: await insert(), isNew: true };
      },
    );
    if (!reaction.isNew) {
      return reaction.id;
    }
    // A delete that set deletedAt after the check above may have looked for
    // reactions before this one was inserted, so it is taken back here
    // instead
    const parentNow = await ChatMessages.findOneAsync(parentId, {
      projection: { deletedAt: 1 },
    });
    if (parentNow?.deletedAt) {
      await ChatMessages.removeAsync(reaction.id);
      throw new Meteor.Error(400, "That message has been deleted");
    }
    msgId = reaction.id;
  } else {
    msgId = await insert();
  }

  // Replying to a resolved thread reopens it. Reacting to it doesn't.
  if (thread && !isReaction({ content, parentId })) {
    await ChatMessages.updateAsync(
      { _id: thread, "comment.resolvedAt": { $exists: true } },
      { $unset: { "comment.resolvedAt": 1, "comment.resolvedBy": 1 } },
    );
  }

  await GlobalHooks.runChatMessageCreatedHooks(msgId);

  return msgId;
}
