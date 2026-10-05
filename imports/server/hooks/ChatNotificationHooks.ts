import Flags from "../../Flags";
import { commentThreadOf } from "../../lib/chatMessagePath";
import {
  dingwordsMatchingMessage,
  normalizedForDingwordSearch,
  SUPPRESS_ALL_DINGWORDS,
} from "../../lib/dingwordLogic";
import isReaction from "../../lib/isReaction";
import ChatMessages from "../../lib/models/ChatMessages";
import ChatNotifications from "../../lib/models/ChatNotifications";
import MeteorUsers from "../../lib/models/MeteorUsers";
import nodeIsMention from "../../lib/nodeIsMention";
import nodeIsPuzzle from "../../lib/nodeIsPuzzle";
import nodeIsRoleMention from "../../lib/nodeIsRoleMention";
import { queryOperatorsForHunt } from "../../lib/permission_stubs";
import boardCommentAudience from "../boardCommentAudience";
import Subscribers from "../models/Subscribers";
import type Hookset from "./Hookset";

const ChatNotificationHooks: Hookset = {
  name: "ChatNotificationHooks",

  async onChatMessageCreated(chatMessageId: string) {
    // This method implements notifications for both Dingwords and @-mentions together,
    // so that we do not generate duplicate notifications if a user is both @-mentioned
    // and one of their dingwords is spoken in the same breath.

    // Dingwords can be disabled (they're comparatively expensive, since they do big-O(users) work),
    // but @-mentions cannot (they're cheap, doing big-O(message components) work).

    const chatMessage = (await ChatMessages.findOneAsync(chatMessageId))!;
    // A reaction is an emoji on someone else's message, not something said.
    if (isReaction(chatMessage)) {
      return;
    }
    const { sender } = chatMessage;

    // Collect users to notify, recording why (a mention, the dingwords that
    // matched, or both; a whiteboard thread they're in; a comment on the
    // whiteboard card of a puzzle they're on), and create notifications at
    // the end.
    const usersToNotify = new Map<
      string,
      { mentioned: boolean; dingwords: Set<string>; cardPuzzle?: string }
    >();
    const reasonFor = (userId: string) => {
      let reason = usersToNotify.get(userId);
      if (!reason) {
        reason = { mentioned: false, dingwords: new Set() };
        usersToNotify.set(userId, reason);
      }
      return reason;
    };
    const notifyMention = (userId: string) => {
      reasonFor(userId).mentioned = true;
    };
    const notifyDingwords = (userId: string, words: string[]) => {
      const reason = reasonFor(userId);
      words.forEach((word) => reason.dingwords.add(word));
    };
    if (!sender) {
      // Don't notify for system messages.
      return;
    }

    // Notify for @-mentions in message.
    await Promise.all(
      chatMessage.content.children.map(async (child) => {
        if (nodeIsMention(child)) {
          const mentionedUserId = child.userId;
          // Don't have messages notify yourself.
          if (mentionedUserId !== sender) {
            // Only create mentions for users that are in the current hunt.
            const mentionedUser =
              await MeteorUsers.findOneAsync(mentionedUserId);
            if (mentionedUser?.hunts?.includes(chatMessage.hunt)) {
              notifyMention(mentionedUserId);
            }
          }
        }
        if (nodeIsRoleMention(child)) {
          const roleId = child.roleId;
          if (roleId === "operator") {
            // First check for all active operators
            const subscribed = await Subscribers.find({
              name: "operators",
              [`context.${chatMessage.hunt}`]: true,
            }).mapAsync((l) => l.user);

            const allOperators = await MeteorUsers.find(
              queryOperatorsForHunt({ _id: chatMessage.hunt }),
            ).mapAsync((u) => u._id);

            const active = new Set(allOperators).intersection(
              new Set(subscribed),
            );
            active.delete(sender); // don't notify self
            if (active.size > 0) {
              active.forEach((userId) => notifyMention(userId));
            } else {
              // No active operators; fall back to all operators
              allOperators.forEach((userId) => {
                if (userId !== sender) {
                  notifyMention(userId);
                }
              });
            }
          } else {
            roleId satisfies never;
          }
        }
      }),
    );

    // A reply in a whiteboard comment thread goes to whoever left the comment
    // and everyone who has replied so far, as long as they're still in the
    // hunt. Those rows are neither mentions nor dingwords, so muting
    // dingwords on the board clears them too.
    if (chatMessage.thread) {
      const root = await ChatMessages.findOneAsync(chatMessage.thread, {
        projection: { sender: 1 },
      });
      const earlierReplies = await ChatMessages.find(
        {
          thread: chatMessage.thread,
          timestamp: { $lte: chatMessage.timestamp },
        },
        { projection: { sender: 1, content: 1, parentId: 1 } },
      ).fetchAsync();
      const participants = new Set<string>();
      [root, ...earlierReplies.filter((m) => !isReaction(m))].forEach((m) => {
        if (m?.sender && m.sender !== sender) participants.add(m.sender);
      });
      if (participants.size > 0) {
        const stillInHunt = await MeteorUsers.find(
          { _id: { $in: [...participants] }, hunts: chatMessage.hunt },
          { projection: { _id: 1 } },
        ).mapAsync((u) => u._id);
        stillInHunt.forEach((userId) => reasonFor(userId));
      }
    }

    // Respect feature flag.
    if (!(await Flags.activeAsync("disable.dingwords"))) {
      const normalizedText = normalizedForDingwordSearch(chatMessage);

      // Find all users who are in this hunt with dingwords set.
      for await (const u of MeteorUsers.find(
        {
          hunts: chatMessage.hunt,
          "dingwords.0": { $exists: true },
        },
        {
          projection: {
            _id: 1,
            dingwords: 1,
            dingwordsOpenMatch: 1,
            // Only this puzzle's mutes (Random ids have no dots to split on)
            [`suppressedDingwords.${chatMessage.hunt}.${chatMessage.puzzle}`]: 1,
          },
        },
      )) {
        // Avoid making users ding themselves.
        if (u._id === sender) {
          continue;
        }

        // Leave out the words the user has muted on this puzzle. A set, so
        // the filter costs the matches plus the mutes, not their product.
        const suppressed = new Set(
          u.suppressedDingwords?.[chatMessage.hunt]?.[chatMessage.puzzle],
        );
        if (suppressed.has(SUPPRESS_ALL_DINGWORDS)) {
          continue;
        }
        const matches = dingwordsMatchingMessage(normalizedText, u).filter(
          (word) => !suppressed.has(word),
        );
        if (matches.length > 0) {
          notifyDingwords(u._id, matches);
        }
      }
    }

    // A new comment on a puzzle's card on the whiteboard goes to the people
    // on that puzzle too. Someone mentioned (or in the thread) keeps that row;
    // someone whose dingwords matched gets a board comment row that still
    // records the words. These aren't dingwords, so dingword mutes neither
    // stop nor clear them; the profile setting stops them (see
    // boardCommentAudience).
    const audience = await boardCommentAudience(chatMessage);
    audience?.users.forEach((userId) => {
      const existing = usersToNotify.get(userId);
      if (existing && (existing.mentioned || existing.dingwords.size === 0)) {
        return;
      }
      reasonFor(userId).cardPuzzle = audience.cardPuzzle;
    });

    // Create notifications for each user who should be dinged by this message.
    const thread = commentThreadOf(chatMessage);
    const mentionedPuzzles = [
      ...new Set(
        chatMessage.content.children
          .filter(nodeIsPuzzle)
          .map((child) => child.puzzleId),
      ),
    ];
    await Promise.all(
      [...usersToNotify].map(
        async ([userId, { mentioned, dingwords, cardPuzzle }]) => {
          await ChatNotifications.insertAsync({
            user: userId,
            sender,
            puzzle: chatMessage.puzzle,
            hunt: chatMessage.hunt,
            content: chatMessage.content,
            timestamp: chatMessage.timestamp,
            message: chatMessage._id,
            // Recorded so the toast can offer to mute the words that dinged,
            // and so a mute knows which rows it may clear
            ...(dingwords.size > 0 ? { dingwords: [...dingwords] } : {}),
            mentioned,
            // The comment thread the message is in, or starts
            ...(thread ? { thread } : {}),
            // So the publication can send the linked puzzles' titles along
            ...(mentionedPuzzles.length > 0 ? { mentionedPuzzles } : {}),
            ...(cardPuzzle
              ? { reason: "boardComment" as const, cardPuzzle }
              : {}),
          });
        },
      ),
    );
  },
};

export default ChatNotificationHooks;
