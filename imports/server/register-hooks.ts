import GlobalHooks from "./GlobalHooks";
import BookmarkNotificationHooks from "./hooks/BookmarkNotificationHooks";
import ChatHooks from "./hooks/ChatHooks";
import ChatNotificationHooks from "./hooks/ChatNotificationHooks";
import DiscordHooks from "./hooks/DiscordHooks";
import DocumentCacheHooks from "./hooks/DocumentCacheHooks";
import NewPuzzleNotificationHooks from "./hooks/NewPuzzleNotificationHooks";
import TagCleanupHooks from "./hooks/TagCleanupHooks";
import TagNotificationHooks from "./hooks/TagNotificationHooks";
import UserStatusHooks from "./hooks/UserStatusHooks";
import WhiteboardHooks from "./hooks/WhiteboardHooks";

// Some hook implementations may themselves need to trigger other hooks. To
// avoid import cycles, hook registration is isolated to this file which is
// imported for its side-effects.

// Add all hooksets.
GlobalHooks.addHookSet(DiscordHooks);
GlobalHooks.addHookSet(ChatNotificationHooks);
GlobalHooks.addHookSet(TagCleanupHooks);
GlobalHooks.addHookSet(ChatHooks);
GlobalHooks.addHookSet(BookmarkNotificationHooks);
GlobalHooks.addHookSet(TagNotificationHooks);
GlobalHooks.addHookSet(DocumentCacheHooks);
GlobalHooks.addHookSet(UserStatusHooks);
GlobalHooks.addHookSet(NewPuzzleNotificationHooks);
GlobalHooks.addHookSet(WhiteboardHooks);
