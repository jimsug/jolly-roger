import { Meteor } from "meteor/meteor";
import isReaction, { reactionEmoji } from "../lib/isReaction";
import type { ChatMessageContentType } from "../lib/models/ChatMessages";
import ChatMessages from "../lib/models/ChatMessages";
import MeteorUsers from "../lib/models/MeteorUsers";
import Puzzles from "../lib/models/Puzzles";
import nodeIsPuzzle from "../lib/nodeIsPuzzle";
import GlobalHooks from "./GlobalHooks";

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
}: {
  puzzleId: string;
  content: ChatMessageContentType;
  sender: string | undefined;
  pinTs?: Date;
  parentId?: string;
}) {
  const puzzle = await Puzzles.findOneAsync(puzzleId);
  if (!puzzle) {
    throw new Meteor.Error(404, "Unknown puzzle");
  }

  // System messages (no sender) come from the server itself.
  if (sender !== undefined) {
    await assertHuntMember(sender, puzzle.hunt);
  }

  if (parentId !== undefined) {
    const parent = await ChatMessages.findOneAsync(parentId, {
      projection: { puzzle: 1 },
    });
    if (parent?.puzzle !== puzzleId) {
      throw new Meteor.Error(
        400,
        `Message ${parentId} is not on puzzle ${puzzleId}`,
      );
    }

    // One reaction per emoji per user on a message: a double click or a
    // second tab reacting again lands on the existing one. The puzzle is in
    // the selector so the { deleted, puzzle } index serves the lookup.
    if (sender !== undefined && isReaction({ content, parentId })) {
      const emoji = reactionEmoji({ content, parentId });
      const existing = await ChatMessages.find(
        { puzzle: puzzleId, parentId, sender },
        { projection: { content: 1, parentId: 1 } },
      ).fetchAsync();
      const duplicate = existing.find(
        (message) => isReaction(message) && reactionEmoji(message) === emoji,
      );
      if (duplicate) {
        return duplicate._id;
      }
    }
  }

  const mentionedPuzzles = content.children
    .filter(nodeIsPuzzle)
    .map((child) => child.puzzleId);
  if (mentionedPuzzles.length > 0) {
    const known = new Set(
      await Puzzles.find(
        { _id: { $in: mentionedPuzzles }, hunt: puzzle.hunt },
        { projection: { _id: 1 } },
      ).mapAsync((p) => p._id),
    );
    const unknown = mentionedPuzzles.find((id) => !known.has(id));
    if (unknown !== undefined) {
      throw new Meteor.Error(
        400,
        `Puzzle ${unknown} is not in hunt ${puzzle.hunt}`,
      );
    }
  }

  const msgId = await ChatMessages.insertAsync({
    puzzle: puzzleId,
    hunt: puzzle.hunt,
    content,
    sender,
    timestamp: new Date(),
    ...(pinTs ? { pinTs } : {}),
    ...(parentId ? { parentId } : {}),
  });

  await GlobalHooks.runChatMessageCreatedHooks(msgId);

  return msgId;
}
