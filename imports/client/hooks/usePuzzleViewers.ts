import { useSubscribe, useTracker } from "meteor/react-meteor-data";
import { useState } from "react";
import Flags from "../../Flags";
import Peers from "../../lib/models/mediasoup/Peers";
import UserStatuses from "../../lib/models/UserStatuses";
import userStatusesForHunt from "../../lib/publications/userStatusesForHunt";
import computePuzzleViewers, {
  type PuzzleViewers,
  puzzleViewerInputs,
} from "../../lib/puzzleViewers";
import { Subscribers } from "../subscribers";
import useDocumentVisible from "./useDocumentVisible";
import useNow from "./useNow";
import useSubscribeAvatars from "./useSubscribeAvatars";
import useSubscribeDisplayNames from "./useSubscribeDisplayNames";
import useTypedSubscribe from "./useTypedSubscribe";

// Who is on each puzzle in a hunt, keyed by puzzle id, from the hunt-wide
// presence publications, as the puzzle list's viewers column and the
// whiteboard's cards show them (see computePuzzleViewers). Undefined while
// disabled. Display names and avatars are subscribed too, for whatever shows
// the people.
export default function usePuzzleViewers(
  huntId: string,
  enabled: boolean,
): Record<string, PuzzleViewers> | undefined {
  // Calls are off while disable.webrtc is set, so there are no callers to
  // list (ChatPeople checks the same flag)
  const rtcDisabled = useTracker(() => Flags.active("disable.webrtc"), []);

  useSubscribe(enabled ? "subscribers.fetchAll" : undefined, huntId);
  useSubscribe(
    enabled && !rtcDisabled ? "mediasoup:metadataAll" : undefined,
    huntId,
  );
  useTypedSubscribe(enabled ? userStatusesForHunt : undefined, { huntId });
  useSubscribeDisplayNames(enabled ? huntId : undefined);
  useSubscribeAvatars(enabled ? huntId : undefined);

  // Presence ages out, so recompute every minute even without new data,
  // while enabled and the tab is visible
  const documentVisible = useDocumentVisible();
  const now = useNow(enabled && documentVisible ? 60 * 1000 : null);
  const presence = useTracker(() => {
    if (!enabled) {
      return undefined;
    }
    return puzzleViewerInputs({
      peers: Peers.find({ hunt: huntId }).fetch(),
      subscribers: Subscribers.find({}).fetch(),
      statuses: UserStatuses.find({
        hunt: huntId,
        type: "puzzleStatus",
        puzzle: { $exists: true },
      }).fetch(),
      rtcDisabled,
    });
  }, [enabled, rtcDisabled, huntId]);

  // Any presence change in the hunt re-runs the tracker. Computing against
  // the previous result hands back the same objects for the puzzles whose
  // viewers didn't change, so memoised rows and cards don't re-render. That
  // result lives in state, updated while rendering (React's pattern for
  // state that depends on earlier renders).
  const [last, setLast] = useState<{
    presence: typeof presence;
    now: Date;
    byPuzzle: Record<string, PuzzleViewers> | undefined;
  }>({ presence: undefined, now, byPuzzle: undefined });
  if (presence !== last.presence || now !== last.now) {
    const byPuzzle =
      presence &&
      computePuzzleViewers({ ...presence, now, previous: last.byPuzzle });
    setLast({ presence, now, byPuzzle });
    return byPuzzle;
  }
  return last.byPuzzle;
}
