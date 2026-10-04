import type { WhiteboardNodeType } from "../models/WhiteboardNodes";
import type { Point, Rect, SeedNode } from "./layout";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  MIN_FRAME_HEIGHT,
  MIN_FRAME_WIDTH,
  topLevelSlot,
} from "./layout";
import { MAX_FRAME_DEPTH } from "./limits";

// What Reset layout reads of each node on the board.
export type ResetNode = Pick<
  WhiteboardNodeType,
  | "_id"
  | "type"
  | "parent"
  | "position"
  | "width"
  | "height"
  | "hidden"
  | "manual"
  | "puzzle"
  | "tag"
  | "frameKind"
>;

// A round's frame (one with a tag) or Ungrouped: the frames placement makes,
// which are hidden rather than removed when someone deletes one.
const isSeededFrame = (n: ResetNode) =>
  n.type === "frame" && (n.tag !== undefined || n.frameKind === "ungrouped");

// What seedLayout is given for a reset. Unless putting back, puzzles whose
// cards someone took off the board are left out, and so are the tags of
// round frames someone took off, so the puzzles in those rounds land where
// placement would put them today: another of their rounds, or Ungrouped.
export function resetSeedInput<
  P extends { _id: string },
  T extends { _id: string },
>(
  puzzles: P[],
  tags: T[],
  nodes: ResetNode[],
  putBack: boolean,
): { puzzles: P[]; tags: T[] } {
  if (putBack) return { puzzles, tags };
  const hiddenPuzzles = new Set(
    nodes.flatMap((n) =>
      n.type === "puzzle" && n.hidden && n.puzzle ? [n.puzzle] : [],
    ),
  );
  const hiddenTags = new Set(
    nodes.flatMap((n) =>
      isSeededFrame(n) && n.hidden && n.tag ? [n.tag] : [],
    ),
  );
  return {
    puzzles: puzzles.filter((p) => !hiddenPuzzles.has(p._id)),
    tags: tags.filter((t) => !hiddenTags.has(t._id)),
  };
}

// One seed node as the reset writes it: onto the node already on the board
// for it, or as a new node. parentKey is the seed key of its frame, whose id
// is only known once that frame has been written.
export interface ResetPlacement {
  key: string;
  parentKey?: string;
  node?: string;
  seed: SeedNode;
  $set: { position: Point; width: number; height: number };
  $unset: { manual: ""; hidden?: "" };
}

export interface ResetPlan {
  // Parents before their children
  place: ResetPlacement[];
  // Shown round frames no puzzle needs any more, each moved to the top level
  // below everything else, with whatever is in it
  stack: { node: string; position: Point }[];
}

const rectOf = (n: ResetNode): Rect => ({
  ...n.position,
  width: n.width ?? (n.type === "frame" ? MIN_FRAME_WIDTH : CARD_WIDTH),
  height: n.height ?? (n.type === "frame" ? MIN_FRAME_HEIGHT : CARD_HEIGHT),
});

// How to put the board's cards and round frames where seedLayout says,
// keeping the ids of what's already there so comments, lines and anything
// inside a frame stay with it. Seed keys map to nodes by what they are:
// frame:<tagId> to the frame for that tag, frame:ungrouped to the Ungrouped
// frame, puzzle:<id> to that puzzle's card. Anything placed is no longer
// marked as moved by hand, and with putBack comes back if it was hidden.
// Without putBack an Ungrouped frame someone took off stays off, and the
// cards that would go in it go where it would have been, at the top level.
export function planReset(
  seed: SeedNode[],
  nodes: ResetNode[],
  { putBack }: { putBack: boolean },
): ResetPlan {
  const takeable = (n: ResetNode) => putBack || !n.hidden;
  const cards = new Map<string, ResetNode>();
  const tagFrames = new Map<string, ResetNode>();
  nodes.forEach((n) => {
    if (n.type === "puzzle" && n.puzzle && takeable(n)) cards.set(n.puzzle, n);
    if (n.type === "frame" && n.tag && takeable(n)) tagFrames.set(n.tag, n);
  });
  const ungroupedFrames = nodes.filter(
    (n) => n.type === "frame" && !n.tag && n.frameKind === "ungrouped",
  );
  const ungrouped =
    ungroupedFrames.find((n) => !n.hidden) ??
    (putBack ? ungroupedFrames[0] : undefined);
  const ungroupedTakenOff = !ungrouped && ungroupedFrames.length > 0;

  const existingFor = (s: SeedNode) => {
    if (s.type === "puzzle") return s.puzzle ? cards.get(s.puzzle) : undefined;
    if (s.tag) return tagFrames.get(s.tag);
    return s.frameKind === "ungrouped" ? ungrouped : undefined;
  };

  const place: ResetPlacement[] = [];
  const matched = new Set<string>();
  // Seed frames that aren't written, and where their contents go instead
  const dropped = new Map<string, Point>();
  seed.forEach((s) => {
    if (s.frameKind === "ungrouped" && ungroupedTakenOff) {
      dropped.set(s.key, s.position);
      return;
    }
    const offset = s.parentKey ? dropped.get(s.parentKey) : undefined;
    const position = offset
      ? { x: offset.x + s.position.x, y: offset.y + s.position.y }
      : s.position;
    const existing = existingFor(s);
    if (existing) matched.add(existing._id);
    place.push({
      key: s.key,
      parentKey: offset ? undefined : s.parentKey,
      node: existing?._id,
      seed: s,
      $set: { position, width: s.width, height: s.height },
      $unset: { manual: "", ...(putBack ? { hidden: "" as const } : {}) },
    });
  });

  // Round frames left with nothing to hold. One inside another stale frame
  // goes with it.
  const byId = new Map(nodes.map((n) => [n._id, n]));
  const stale = nodes.filter(
    (n) => isSeededFrame(n) && !n.hidden && !matched.has(n._id),
  );
  const staleIds = new Set(stale.map((n) => n._id));
  const insideStale = (n: ResetNode) => {
    let parent = n.parent ? byId.get(n.parent) : undefined;
    for (let depth = 0; parent && depth < MAX_FRAME_DEPTH; depth++) {
      if (staleIds.has(parent._id)) return true;
      parent = parent.parent ? byId.get(parent.parent) : undefined;
    }
    return false;
  };

  // Below the new layout and anything else at the top level
  const placed = new Set(place.flatMap((p) => (p.node ? [p.node] : [])));
  const occupied: Rect[] = [
    ...place
      .filter((p) => !p.parentKey)
      .map(({ $set }) => ({
        x: $set.position.x,
        y: $set.position.y,
        width: $set.width,
        height: $set.height,
      })),
    ...nodes
      .filter(
        (n) =>
          !n.parent && !n.hidden && !placed.has(n._id) && !staleIds.has(n._id),
      )
      .map(rectOf),
  ];
  const stack: ResetPlan["stack"] = [];
  stale.forEach((frame) => {
    if (insideStale(frame)) return;
    const position = topLevelSlot(occupied);
    stack.push({ node: frame._id, position });
    occupied.push({ ...rectOf(frame), ...position });
  });

  return { place, stack };
}
