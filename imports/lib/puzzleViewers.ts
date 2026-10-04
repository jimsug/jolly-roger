import type { DiscordAccountType } from "./models/DiscordAccount";
import { PASSIVE_VIEWER_WINDOW_MS } from "./presenceStatus";

// Works out who is on which puzzle, for the puzzle list's viewers column and
// the whiteboard's puzzle cards.

export type PuzzleViewers = {
  // Users in the puzzle's audio call
  rtcViewers: string[];
  // Users with the puzzle page open in a visible tab
  activeViewers: string[];
  // Users whose most recent sign of life (a hidden puzzle tab or an
  // interaction) was on this puzzle
  passiveViewers: string[];
};

export type ViewerCaller = { puzzle: string; user: string };

export type ViewerSubscription = {
  puzzle: string;
  user: string;
  visible: boolean;
  updatedAt: Date | undefined;
};

export type ViewerInteraction = {
  puzzle: string;
  user: string;
  updatedAt: Date;
};

type Candidate = {
  puzzle: string;
  updatedAt: number;
  visible: boolean;
  isInteraction: boolean;
};

const sameUsers = (a: string[], b: string[]) =>
  a.length === b.length && a.every((user, i) => user === b[i]);

const sameViewers = (a: PuzzleViewers, b: PuzzleViewers) =>
  sameUsers(a.rtcViewers, b.rtcViewers) &&
  sameUsers(a.activeViewers, b.activeViewers) &&
  sameUsers(a.passiveViewers, b.passiveViewers);

// When `previous` is given, a puzzle whose viewers haven't changed keeps its
// previous entry (same object), and the previous result itself comes back
// when nothing changed at all, so the rows of a memoised list only re-render
// where someone actually arrived or left.
export default function computePuzzleViewers({
  callers,
  subscriptions,
  interactions,
  now = new Date(),
  previous,
}: {
  callers: ViewerCaller[];
  subscriptions: ViewerSubscription[];
  interactions: ViewerInteraction[];
  now?: Date;
  previous?: Record<string, PuzzleViewers> | undefined;
}): Record<string, PuzzleViewers> {
  // Puzzle ids here come from subscriber topic names, which the subscriber
  // chooses, so the result has no prototype for "__proto__" to reach
  const viewers = Object.create(null) as Record<string, PuzzleViewers>;
  const forPuzzle = (puzzle: string) => {
    viewers[puzzle] ??= {
      rtcViewers: [],
      activeViewers: [],
      passiveViewers: [],
    };
    return viewers[puzzle];
  };

  const inCall = new Set<string>();
  for (const { puzzle, user } of callers) {
    const entry = forPuzzle(puzzle);
    if (!entry.rtcViewers.includes(user)) {
      entry.rtcViewers.push(user);
    }
    inCall.add(`${puzzle}:${user}`);
  }

  const candidatesByUser = new Map<string, Candidate[]>();
  const addCandidate = (user: string, candidate: Candidate) => {
    let candidates = candidatesByUser.get(user);
    if (!candidates) {
      candidates = [];
      candidatesByUser.set(user, candidates);
    }
    candidates.push(candidate);
  };
  for (const s of subscriptions) {
    addCandidate(s.user, {
      puzzle: s.puzzle,
      updatedAt: s.updatedAt?.getTime() ?? 0,
      visible: s.visible,
      isInteraction: false,
    });
  }
  for (const i of interactions) {
    addCandidate(i.user, {
      puzzle: i.puzzle,
      updatedAt: i.updatedAt.getTime(),
      visible: false,
      isInteraction: true,
    });
  }

  // A user is wherever they have a visible tab. Failing that, the best guess
  // is their most recent interaction, or their most recent hidden tab, as
  // long as it was in the last few minutes.
  for (const [user, candidates] of candidatesByUser) {
    const visible = candidates.filter((c) => c.visible);
    let best: Candidate[];
    if (visible.length > 0) {
      best = visible;
    } else {
      const recent = candidates
        .filter((c) => now.getTime() - c.updatedAt < PASSIVE_VIEWER_WINDOW_MS)
        .toSorted((a, b) => {
          if (a.isInteraction !== b.isInteraction) {
            return a.isInteraction ? -1 : 1;
          }
          return b.updatedAt - a.updatedAt;
        });
      best = recent.slice(0, 1);
    }

    for (const location of best) {
      if (inCall.has(`${location.puzzle}:${user}`)) {
        continue;
      }
      const entry = forPuzzle(location.puzzle);
      const list = location.visible
        ? entry.activeViewers
        : entry.passiveViewers;
      if (!list.includes(user)) {
        list.push(user);
      }
    }
  }

  if (!previous) {
    return viewers;
  }
  let unchanged = true;
  for (const [puzzle, entry] of Object.entries(viewers)) {
    const before = Object.hasOwn(previous, puzzle)
      ? previous[puzzle]
      : undefined;
    if (before && sameViewers(before, entry)) {
      viewers[puzzle] = before;
    } else {
      unchanged = false;
    }
  }
  return unchanged &&
    Object.keys(previous).length === Object.keys(viewers).length
    ? previous
    : viewers;
}

const PUZZLE_TOPIC_PREFIX = "puzzle:";

// computePuzzleViewers's input, from the hunt's call peers, puzzle topic
// subscribers and puzzle status rows. Calls are off while disable.webrtc is
// set, so then there are no callers.
export function puzzleViewerInputs({
  peers,
  subscribers,
  statuses,
  rtcDisabled,
}: {
  peers: { call: string; createdBy: string }[];
  subscribers: {
    name: string;
    user: string;
    visible?: boolean;
    updatedAt?: Date;
  }[];
  statuses: { puzzle?: string; user: string; updatedAt: Date }[];
  rtcDisabled: boolean;
}): {
  callers: ViewerCaller[];
  subscriptions: ViewerSubscription[];
  interactions: ViewerInteraction[];
} {
  return {
    callers: rtcDisabled
      ? []
      : peers.map((peer) => ({ puzzle: peer.call, user: peer.createdBy })),
    subscriptions: subscribers
      .filter((s) => s.name.startsWith(PUZZLE_TOPIC_PREFIX))
      .map((s) => ({
        puzzle: s.name.slice(PUZZLE_TOPIC_PREFIX.length),
        user: s.user,
        visible: s.visible ?? false,
        updatedAt: s.updatedAt,
      })),
    interactions: statuses.flatMap((status) =>
      status.puzzle
        ? [
            {
              puzzle: status.puzzle,
              user: status.user,
              updatedAt: status.updatedAt,
            },
          ]
        : [],
    ),
  };
}

type ViewerPerson = {
  _id: string;
  displayName: string;
  discordAccount?: DiscordAccountType | undefined;
  // Placed here by a hidden tab or a recent interaction rather than a
  // visible tab, so drawn faded
  isPassive: boolean;
};

// The people a puzzle's viewers stand for, as the puzzle list's row and the
// whiteboard's card both show them: callers, then viewers with a visible tab,
// then the passive ones. Anyone without a display name is left out.
export function puzzleViewerPeople(
  viewers: PuzzleViewers | undefined,
  userOf: (
    id: string,
  ) =>
    | { displayName?: string; discordAccount?: DiscordAccountType | undefined }
    | undefined,
): { callers: ViewerPerson[]; viewers: ViewerPerson[] } {
  if (!viewers) {
    return { callers: [], viewers: [] };
  }
  const toPeople = (ids: string[], isPassive: boolean): ViewerPerson[] =>
    ids.flatMap((id) => {
      const user = userOf(id);
      return user?.displayName
        ? [
            {
              _id: id,
              displayName: user.displayName,
              discordAccount: user.discordAccount,
              isPassive,
            },
          ]
        : [];
    });
  return {
    callers: toPeople(viewers.rtcViewers, false),
    viewers: [
      ...toPeople(viewers.activeViewers, false),
      ...toPeople(viewers.passiveViewers, true),
    ],
  };
}
