// How long someone else's drag counts for after it last moved. Their client
// sends a drag as it moves and clears it on the drop, so one that has sat
// still this long is from a sender that has gone quiet, and the node goes
// back to where it's saved.
export const LIVE_DRAG_TIMEOUT_MS = 2000;

export interface SeenDrag {
  x: number;
  y: number;
  parent: string | undefined;
  // When this client last saw it move
  at: number;
}

// Brings what's been seen of other people's drags, by node, up to date with
// the latest ones, keeping when each last moved.
export function seeDrags(
  seen: ReadonlyMap<string, SeenDrag>,
  drags: { node: string; x: number; y: number; parent?: string | null }[],
  now: number,
): Map<string, SeenDrag> {
  const next = new Map<string, SeenDrag>();
  for (const drag of drags) {
    const { node, x, y } = drag;
    const parent = drag.parent ?? undefined;
    const before = seen.get(node);
    const moved =
      !before || before.x !== x || before.y !== y || before.parent !== parent;
    next.set(node, { x, y, parent, at: moved ? now : before.at });
  }
  return next;
}

// The drags still moving at now, by node, and when the first of them will
// stop counting.
export function liveDrags(
  seen: ReadonlyMap<string, SeenDrag>,
  now: number,
): {
  live: Map<string, Omit<SeenDrag, "at">>;
  staleAt: number | undefined;
} {
  const live = new Map<string, Omit<SeenDrag, "at">>();
  let staleAt: number | undefined;
  for (const [node, { at, ...drag }] of seen) {
    const expires = at + LIVE_DRAG_TIMEOUT_MS;
    if (expires <= now) continue;
    live.set(node, drag);
    staleAt = staleAt === undefined ? expires : Math.min(staleAt, expires);
  }
  return { live, staleAt };
}
