import GlobalHooks from "./GlobalHooks";
import BookmarkNotificationHooks from "./hooks/BookmarkNotificationHooks";
import ChatHooks from "./hooks/ChatHooks";
import ChatNotificationHooks from "./hooks/ChatNotificationHooks";
import DiscordHooks from "./hooks/DiscordHooks";
import DocumentCacheHooks from "./hooks/DocumentCacheHooks";
import PuzzleHooks from "./hooks/PuzzleHooks";
import TagCleanupHooks from "./hooks/TagCleanupHooks";
import TagHooks from "./hooks/TagHooks";
import UserStatusHooks from "./hooks/UserStatusHooks";

// Some hook implementations may themselves need to trigger other hooks. To
// avoid import cycles, hook registration is isolated to this file which is
// imported for its side-effects.

// Add all hooksets.
GlobalHooks.addHookSet(DiscordHooks);
GlobalHooks.addHookSet(ChatNotificationHooks);
GlobalHooks.addHookSet(TagCleanupHooks);
GlobalHooks.addHookSet(ChatHooks);
GlobalHooks.addHookSet(BookmarkNotificationHooks);
GlobalHooks.addHookSet(TagHooks);
GlobalHooks.addHookSet(DocumentCacheHooks);
GlobalHooks.addHookSet(UserStatusHooks);
GlobalHooks.addHookSet(PuzzleHooks);
