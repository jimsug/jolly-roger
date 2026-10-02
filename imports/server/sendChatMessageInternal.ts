import { Meteor } from "meteor/meteor";
import isReaction from "../lib/isReaction";
import type {
  ChatAttachmentType,
  ChatMessageContentType,
} from "../lib/models/ChatMessages";
import ChatMessages from "../lib/models/ChatMessages";
import Puzzles from "../lib/models/Puzzles";
import type { CommentAnchorInput } from "../methods/sendChatMessage";
import GlobalHooks from "./GlobalHooks";

export default async function sendChatMessageInternal({
  puzzleId,
  content,
  sender,
  pinTs = null,
  parentId = null,
  attachments = null,
  comment,
}: {
  puzzleId: string;
  content: ChatMessageContentType;
  sender: string | undefined;
  pinTs?: Date | null;
  parentId?: string | null;
  attachments?: ChatAttachmentType[] | null;
  // Checked by the caller (see assertValidCommentAnchor).
  comment?: CommentAnchorInput;
}) {
  const puzzle = await Puzzles.findOneAsync(puzzleId);
  if (!puzzle) {
    throw new Meteor.Error(404, "Unknown puzzle");
  }

  let thread: string | undefined;
  if (parentId) {
    // A reply to a message that has since been deleted still goes through,
    // as it always has, just not as part of any thread.
    const parent = await ChatMessages.findOneAsync(parentId);
    if (parent && parent.puzzle !== puzzleId) {
      throw new Meteor.Error(400, "Can't reply to a message on another puzzle");
    }
    thread = parent?.comment ? parent._id : parent?.thread;
  }

  const msgId = await ChatMessages.insertAsync({
    puzzle: puzzleId,
    hunt: puzzle.hunt,
    content,
    sender,
    timestamp: new Date(),
    pinTs,
    parentId,
    attachments: attachments ?? [],
    comment,
    thread,
  });

  // Replying to a resolved thread reopens it. Reacting to it doesn't.
  if (thread && !isReaction({ content })) {
    await ChatMessages.updateAsync(
      { _id: thread, "comment.resolvedAt": { $exists: true } },
      { $unset: { "comment.resolvedAt": 1, "comment.resolvedBy": 1 } },
    );
  }

  await GlobalHooks.runChatMessageCreatedHooks(msgId);
}
