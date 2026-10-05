import Flags from "../Flags";
import Bookmarks from "../lib/models/Bookmarks";
import type { ChatMessageType } from "../lib/models/ChatMessages";
import MeteorUsers from "../lib/models/MeteorUsers";
import Peers from "../lib/models/mediasoup/Peers";
import Puzzles from "../lib/models/Puzzles";
import WhiteboardNodes from "../lib/models/WhiteboardNodes";
import { PASSIVE_VIEWER_WINDOW_MS } from "../lib/presenceStatus";
import { puzzleViewerInputs } from "../lib/puzzleViewers";
import Subscribers from "./models/Subscribers";
import { isVisible } from "./subscribers";

// Who hears about a new whiteboard comment pinned to a puzzle's card: anyone
// with the puzzle open in a visible tab, or in a hidden one they've looked at
// in the last few minutes (the puzzle list's window), anyone in its call, and
// anyone who has bookmarked it. Unlike the puzzle list, nobody is placed on
// just one puzzle, so someone looking at the board itself still counts for
// the puzzles they have open elsewhere. Only those still in the hunt who
// haven't turned board comment notifications off on their profile, and never
// the comment's author. Undefined for anything other than a comment on a
// live puzzle's card, replies included.
export default async function boardCommentAudience(
  message: Pick<ChatMessageType, "hunt" | "sender" | "comment">,
): Promise<{ cardPuzzle: string; users: string[] } | undefined> {
  const node = message.comment?.node;
  if (!node) {
    return undefined;
  }
  const card = await WhiteboardNodes.findOneAsync(
    { _id: node, hunt: message.hunt },
    { projection: { type: 1, puzzle: 1 } },
  );
  if (card?.type !== "puzzle" || !card.puzzle) {
    return undefined;
  }
  const puzzle = await Puzzles.findOneAsync(
    { _id: card.puzzle, hunt: message.hunt },
    { projection: { _id: 1 } },
  );
  if (!puzzle) {
    return undefined;
  }

  const [subscribers, peers, rtcDisabled, bookmarkers] = await Promise.all([
    Subscribers.find(
      { name: `puzzle:${puzzle._id}` },
      { projection: { name: 1, user: 1, context: 1, updatedAt: 1 } },
    ).fetchAsync(),
    Peers.find(
      { hunt: message.hunt, call: puzzle._id },
      { projection: { call: 1, createdBy: 1 } },
    ).fetchAsync(),
    Flags.activeAsync("disable.webrtc"),
    Bookmarks.find(
      { hunt: message.hunt, puzzle: puzzle._id },
      { projection: { user: 1 } },
    ).mapAsync((b) => b.user),
  ]);
  const { callers, subscriptions } = puzzleViewerInputs({
    peers,
    subscribers: subscribers.map((s) => ({
      name: s.name,
      user: s.user,
      visible: isVisible(s.context),
      updatedAt: s.updatedAt,
    })),
    statuses: [],
    rtcDisabled,
  });
  const now = Date.now();
  const viewers = subscriptions
    .filter(
      (s) =>
        s.visible ||
        (s.updatedAt !== undefined &&
          now - s.updatedAt.getTime() < PASSIVE_VIEWER_WINDOW_MS),
    )
    .map((s) => s.user);

  const candidates = new Set([
    ...viewers,
    ...callers.map((c) => c.user),
    ...bookmarkers,
  ]);
  if (message.sender) {
    candidates.delete(message.sender);
  }
  if (candidates.size === 0) {
    return { cardPuzzle: puzzle._id, users: [] };
  }
  const users = await MeteorUsers.find(
    {
      _id: { $in: [...candidates] },
      hunts: message.hunt,
      boardCommentNotifications: { $ne: false },
    },
    { projection: { _id: 1 } },
  ).mapAsync((u) => u._id);
  return { cardPuzzle: puzzle._id, users };
}
