import ChatMessages from "../../lib/models/ChatMessages";
import recordPuzzleStatus from "../recordPuzzleStatus";
import type Hookset from "./Hookset";

// Keeps the "last active on puzzle" presence up to date from chat. Sheet
// edits are recorded by the Drive activity fetcher and calls by
// recordCallPresence.
const UserStatusHooks: Hookset = {
  name: "UserStatusHooks",

  async onChatMessageCreated(chatMessageId: string) {
    const message = await ChatMessages.findOneAsync(chatMessageId);
    // System messages aren't anyone's activity
    if (!message?.sender) {
      return;
    }

    await recordPuzzleStatus({
      hunt: message.hunt,
      user: message.sender,
      puzzle: message.puzzle,
      status: "chat",
    });
  },
};

export default UserStatusHooks;
