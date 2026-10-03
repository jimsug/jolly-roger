import { useSubscribe, useTracker } from "meteor/react-meteor-data";
import Peers from "../../lib/models/mediasoup/Peers";
import type { PuzzlePeople } from "../../lib/whiteboard/puzzlePeople";
import { Subscribers } from "../subscribers";
import useSubscribeAvatars from "./useSubscribeAvatars";
import useSubscribeDisplayNames from "./useSubscribeDisplayNames";

const PUZZLE_TOPIC = /^puzzle:/;

// Who is on each puzzle's call, and who has it open, for a whole hunt.
export default function usePuzzlePeople(
  huntId: string,
): Map<string, PuzzlePeople> {
  const subscribersLoading = useSubscribe("subscribers.fetchAll", huntId);
  const callersLoading = useSubscribe("mediasoup:metadataAll", huntId);
  const displayNamesLoading = useSubscribeDisplayNames(huntId);
  const avatarsLoading = useSubscribeAvatars(huntId);
  const loading =
    subscribersLoading() ||
    callersLoading() ||
    displayNamesLoading() ||
    avatarsLoading();

  return useTracker(() => {
    const people = new Map<string, PuzzlePeople>();
    if (loading) return people;

    const forPuzzle = (puzzleId: string) => {
      let entry = people.get(puzzleId);
      if (!entry) {
        entry = { callers: [], viewers: [] };
        people.set(puzzleId, entry);
      }
      return entry;
    };

    Peers.find({ hunt: huntId }).forEach((peer) => {
      const entry = forPuzzle(peer.call);
      if (!entry.callers.includes(peer.createdBy)) {
        entry.callers.push(peer.createdBy);
      }
    });

    // One record per person per puzzle, visible if any of their tabs is.
    // Someone with the puzzle open only in hidden tabs is shown faded.
    Subscribers.find({ name: { $regex: PUZZLE_TOPIC } }).forEach((s) => {
      const entry = forPuzzle(s.name.replace(PUZZLE_TOPIC, ""));
      if (entry.callers.includes(s.user)) return;
      entry.viewers.push({ user: s.user, passive: !s.visible });
    });

    return people;
  }, [loading, huntId]);
}
