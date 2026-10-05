import { MAX_COORDINATE } from "./limits";
import type { BoardView } from "./links";
import { MAX_ZOOM, MIN_ZOOM } from "./links";

// How long someone being followed can go without moving their pointer or
// their view before following them stops.
export const FOLLOW_IDLE_MS = 60 * 1000;

// One of someone's tabs on the board, as presence has it.
export interface FollowPresence {
  _id: string;
  user: string;
  cursor?: { x: number; y: number } | null;
  view?: BoardView | null;
}

// Why following stopped without the viewer pressing Stop: they moved the
// board themselves, the person followed left it, or that person stopped
// moving for FOLLOW_IDLE_MS.
export type FollowStopReason = "moved" | "left" | "idle";

export interface FollowState {
  user: string;
  // What their tabs last showed, and when that last changed.
  seen: string;
  activeAt: number;
  // The view last applied, or null when theirs hasn't been applied since
  // following started or resumed.
  applied: BoardView | null;
}

export interface FollowResult {
  state: FollowState | undefined;
  // A view to move the board to.
  apply?: BoardView;
  stopped?: FollowStopReason;
}

const theirs = (user: string, presence: readonly FollowPresence[]) =>
  presence
    .filter((p) => p.user === user)
    .toSorted((a, b) => (a._id < b._id ? -1 : a._id > b._id ? 1 : 0));

const sameView = (a: BoardView | null, b: BoardView | null) =>
  a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.zoom === b.zoom);

// Takes the latest presence on the board and says what following `state.user`
// now does: move to their view if it changed, stop if they've gone or have
// been still too long, or nothing. With several tabs, the first that has a
// view is followed.
export function followPresence(
  state: FollowState,
  presence: readonly FollowPresence[],
  now: number,
): FollowResult {
  const tabs = theirs(state.user, presence);
  if (tabs.length === 0) return { state: undefined, stopped: "left" };
  const seen = JSON.stringify(
    tabs.map((p) => [p._id, p.cursor ?? null, p.view ?? null]),
  );
  const activeAt = seen === state.seen ? state.activeAt : now;
  if (now - activeAt >= FOLLOW_IDLE_MS) {
    return { state: undefined, stopped: "idle" };
  }
  const view = tabs.find((p) => p.view)?.view ?? null;
  const next = { ...state, seen, activeAt };
  if (!view || sameView(view, state.applied)) return { state: next };
  return { state: { ...next, applied: view }, apply: view };
}

// Starts following someone, moving to their view straight away if they have
// one.
export function startFollowing(
  user: string,
  presence: readonly FollowPresence[],
  now: number,
): FollowResult {
  return followPresence(
    { user, seen: "", activeAt: now, applied: null },
    presence,
    now,
  );
}

// The viewer panned or zoomed the board themselves.
export function followLocalMove(): FollowResult {
  return { state: undefined, stopped: "moved" };
}

// Following again after a pause (looking at an earlier version), so their
// current view is applied on the next update even if it hasn't changed.
export function resumeFollowing(state: FollowState): FollowState {
  return { ...state, applied: null };
}

// When following stops for idleness unless they move first.
export function followIdleAt(state: FollowState) {
  return state.activeAt + FOLLOW_IDLE_MS;
}

// Who is following `user`, from everyone else's presence.
export function followersOf(
  user: string,
  presence: readonly { user: string; followedUser?: string | null }[],
): string[] {
  return [
    ...new Set(
      presence
        .filter((p) => p.followedUser === user && p.user !== user)
        .map((p) => p.user),
    ),
  ];
}

const round = (n: number, places: number) => {
  const scale = 10 ** places;
  return Math.round(n * scale) / scale;
};

// What a canvas `width` by `height` pixels shows when the board is drawn
// shifted by x and y and scaled by zoom: the board point at its centre, to
// a tenth of a unit, and the zoom, each held to what the board allows.
export function viewAtCentre(
  { x, y, zoom }: { x: number; y: number; zoom: number },
  width: number,
  height: number,
): BoardView {
  const onBoard = (n: number) =>
    Math.min(MAX_COORDINATE, Math.max(-MAX_COORDINATE, round(n, 1)));
  return {
    x: onBoard((width / 2 - x) / zoom),
    y: onBoard((height / 2 - y) / zoom),
    zoom: round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)), 4),
  };
}

// The shift and scale that put a view's point at the centre of a canvas
// `width` by `height` pixels, at its zoom.
export function viewportFor(view: BoardView, width: number, height: number) {
  return {
    x: width / 2 - view.x * view.zoom,
    y: height / 2 - view.y * view.zoom,
    zoom: view.zoom,
  };
}
