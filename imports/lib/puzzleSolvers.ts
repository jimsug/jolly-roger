// Works out who is on which puzzle for the puzzle list's solver column.

export type PuzzleSolvers = {
  // Users in the puzzle's audio call
  rtcViewers: string[];
  // Users with the puzzle page open in a visible tab
  activeViewers: string[];
  // Users whose most recent sign of life (a hidden puzzle tab or an
  // interaction) was on this puzzle
  passiveViewers: string[];
};

export type SolverCaller = { puzzle: string; user: string };

export type SolverSubscription = {
  puzzle: string;
  user: string;
  visible: boolean;
  updatedAt: Date | undefined;
};

export type SolverInteraction = {
  puzzle: string;
  user: string;
  updatedAt: Date;
};

// A hidden tab or an interaction older than this no longer places the user
// anywhere
export const PASSIVE_VIEWER_WINDOW_MS = 5 * 60 * 1000;

type Candidate = {
  puzzle: string;
  updatedAt: number;
  visible: boolean;
  isInteraction: boolean;
};

const sameUsers = (a: string[], b: string[]) =>
  a.length === b.length && a.every((user, i) => user === b[i]);

const sameSolvers = (a: PuzzleSolvers, b: PuzzleSolvers) =>
  sameUsers(a.rtcViewers, b.rtcViewers) &&
  sameUsers(a.activeViewers, b.activeViewers) &&
  sameUsers(a.passiveViewers, b.passiveViewers);

// When `previous` is given, a puzzle whose solvers haven't changed keeps its
// previous entry (same object), and the previous result itself comes back
// when nothing changed at all, so the rows of a memoised list only re-render
// where someone actually arrived or left.
export default function computePuzzleSolvers({
  callers,
  subscriptions,
  interactions,
  now = new Date(),
  previous,
}: {
  callers: SolverCaller[];
  subscriptions: SolverSubscription[];
  interactions: SolverInteraction[];
  now?: Date;
  previous?: Record<string, PuzzleSolvers> | undefined;
}): Record<string, PuzzleSolvers> {
  const solvers: Record<string, PuzzleSolvers> = {};
  const forPuzzle = (puzzle: string) => {
    solvers[puzzle] ??= {
      rtcViewers: [],
      activeViewers: [],
      passiveViewers: [],
    };
    return solvers[puzzle];
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
      best = recent.length > 0 ? [recent[0]!] : [];
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
    return solvers;
  }
  let unchanged = true;
  for (const [puzzle, entry] of Object.entries(solvers)) {
    const before = previous[puzzle];
    if (before && sameSolvers(before, entry)) {
      solvers[puzzle] = before;
    } else {
      unchanged = false;
    }
  }
  return unchanged &&
    Object.keys(previous).length === Object.keys(solvers).length
    ? previous
    : solvers;
}
