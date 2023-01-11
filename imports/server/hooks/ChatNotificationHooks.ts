import Flags from '../../Flags';
import ChatMessages from '../../lib/models/ChatMessages';
import ChatNotifications from '../../lib/models/ChatNotifications';
import MeteorUsers from '../../lib/models/MeteorUsers';
import { nodeIsMention, nodeIsText } from '../../lib/schemas/ChatMessage';
import Hookset from './Hookset';

const ChatNotificationHooks: Hookset = {
  async onChatMessageCreated(chatMessageId: string) {
    // This method implements notifications for both Dingwords and @-mentions together,
    // so that we do not generate duplicate notifications if a user is both @-mentioned
    // and one of their dingwords is spoken in the same breath.

    // Dingwords can be disabled (they're comparatively expensive, since they do big-O(users) work),
    // but @-mentions cannot (they're cheap, doing big-O(message components) work).

    const chatMessage = (await ChatMessages.findOneAsync(chatMessageId))!;

    // Collect users to notify into a set, and then create notifications at the end.
    const usersToNotify = new Set<string>();
    if (!chatMessage.sender) {
      // Don't notify for system messages.
      return;
    }

    // Notify for @-mentions in message.
    if (chatMessage.content) {
      await Promise.all(chatMessage.content.children.map(async (child) => {
        if (nodeIsMention(child)) {
          const mentionedUserId = child.userId;
          // Don't have messages notify yourself.
          if (mentionedUserId !== chatMessage.sender) {
            // Only create mentions for users that are in the current hunt.
            const mentionedUser = await MeteorUsers.findOneAsync(mentionedUserId);
            if (mentionedUser?.hunts?.includes(chatMessage.hunt)) {
              usersToNotify.add(mentionedUserId);
            }
          }
        }
      }));
    }

    // Respect feature flag.
    if (!Flags.active('disable.dingwords')) {
      const normalizedText = chatMessage.text?.trim().toLowerCase() ??
        chatMessage.content?.children.map((child) => {
          if (nodeIsText(child)) {
            return child.text;
          } else {
            // No need to look for dingwords in @-mentions, but let them split words
            return ' ';
          }
        }).join('').trim().toLowerCase() ?? '';

      // Find all users who are in this hunt with dingwords set.
      for await (const u of MeteorUsers.find({
        hunts: chatMessage.hunt,
        'dingwords.0': { $exists: true },
      }, {
        fields: { _id: 1, dingwords: 1 },
      })) {
        // Avoid making users ding themselves.
        if (u._id === chatMessage.sender) {
          continue;
        }

        const dingwords = u.dingwords;
        if (dingwords) {
          const matches = dingwords.some((dingword) => normalizedText.includes(dingword));
          if (matches) {
            usersToNotify.add(u._id);
          }
        }
      }
    }

    // Create notifications for each user who should be dinged by this message.
    const collected: string[] = [];
    usersToNotify.forEach((userId) => {
      collected.push(userId);
    });
    await Promise.all(collected.map(async (userId: string) => {
      await ChatNotifications.insertAsync({
        user: userId,
        sender: chatMessage.sender,
        puzzle: chatMessage.puzzle,
        hunt: chatMessage.hunt,
        text: chatMessage.text,
        content: chatMessage.content,
        timestamp: chatMessage.timestamp,
      });
    }));
  },
};

export default ChatNotificationHooks;