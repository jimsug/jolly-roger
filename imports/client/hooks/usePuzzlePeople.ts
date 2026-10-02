import { useSubscribe, useTracker } from "meteor/react-meteor-data";
import Peers from "../../lib/models/mediasoup/Peers";
import type { PuzzlePeople } from "../components/whiteboard/WhiteboardContext";
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

    Peers.find({}).forEach((peer) => {
      const entry = forPuzzle(peer.call);
      if (!entry.callers.includes(peer.createdBy)) {
        entry.callers.push(peer.createdBy);
      }
    });

    Subscribers.find({ name: { $regex: PUZZLE_TOPIC } }).forEach((s) => {
      const entry = forPuzzle(s.name.replace(PUZZLE_TOPIC, ""));
      if (entry.callers.includes(s.user)) return;
      const visible =
        (s as { visible?: unknown }).visible === "visible" ||
        (s as { visible?: unknown }).visible === true;
      const existing = entry.viewers.find((v) => v.user === s.user);
      if (existing) {
        existing.passive = existing.passive && !visible;
      } else {
        entry.viewers.push({ user: s.user, passive: !visible });
      }
    });

    return people;
  }, [loading]);
}
