import { indexedById } from "../listUtils";
import type { PuzzleType } from "../models/Puzzles";
import type { TagType } from "../models/Tags";
import type { WhiteboardFrameKind } from "../models/WhiteboardNodes";
import type { PuzzleGroup } from "../puzzle-sort-and-group";
import { puzzleGroupsByRelevance } from "../puzzle-sort-and-group";
import isWhiteboardPuzzle from "./isWhiteboardPuzzle";

// All layout is in flow (canvas) units and never depends on anyone's screen,
// so every client and the server agree on where things go.
export const CARD_WIDTH = 240;
export const CARD_HEIGHT = 112;
export const GAP = 16;
export const FRAME_PADDING = 24;
export const FRAME_HEADER = 56;
export const CARDS_PER_ROW = 4;
export const TOP_LEVEL_GAP = 64;
export const TOP_LEVEL_WRAP_WIDTH = 3200;
export const MIN_FRAME_WIDTH = FRAME_PADDING * 2 + CARD_WIDTH;
export const MIN_FRAME_HEIGHT = FRAME_HEADER + CARD_HEIGHT + FRAME_PADDING;

const MAX_SLOTS = 10_000;

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Point, Size {}

export interface SeedNode {
  // Stable key for this seed; the server swaps keys for real ids on insert.
  // "frame:<tagId>", "frame:ungrouped" or "puzzle:<puzzleId>"
  key: string;
  type: "frame" | "puzzle";
  parentKey?: string;
  position: Point;
  width: number;
  height: number;
  puzzle?: string;
  tag?: string;
  label?: string;
  frameKind?: WhiteboardFrameKind;
}

export interface FeederPair {
  feeder: string;
  meta: string;
}

export interface SeedResult {
  nodes: SeedNode[];
  edges: FeederPair[];
}

const GROUP_PREFIX = "group:";
const META_FOR_PREFIX = "meta-for:";
export const UNGROUPED_LABEL = "Ungrouped";

export function isFrameTag(tag: Pick<TagType, "name">): boolean {
  return tag.name === "administrivia" || tag.name.startsWith(GROUP_PREFIX);
}

export function frameLabelForTag(tag: Pick<TagType, "name">): string {
  return tag.name.startsWith(GROUP_PREFIX)
    ? tag.name.slice(GROUP_PREFIX.length)
    : tag.name;
}

export function eligiblePuzzles(puzzles: PuzzleType[]): PuzzleType[] {
  return puzzles.filter((p) => !p.deleted && !isWhiteboardPuzzle(p));
}

function byCreatedAt<T extends { createdAt: Date; _id: string }>(
  a: T,
  b: T,
): number {
  return +a.createdAt - +b.createdAt || a._id.localeCompare(b._id);
}

export function cardSlot(index: number): Point {
  return {
    x: FRAME_PADDING + (index % CARDS_PER_ROW) * (CARD_WIDTH + GAP),
    y: FRAME_HEADER + Math.floor(index / CARDS_PER_ROW) * (CARD_HEIGHT + GAP),
  };
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

export function growToContain(size: Size, rect: Rect): Size {
  return {
    width: Math.max(size.width, rect.x + rect.width + FRAME_PADDING),
    height: Math.max(size.height, rect.y + rect.height + FRAME_PADDING),
  };
}

// Finds the first card slot in a frame not covered by any existing child,
// growing the frame if that slot falls outside it (e.g. because someone shrank
// the frame).
export function placeIntoFrame(
  frame: Size,
  occupied: Rect[],
): { position: Point; frame: Size } {
  for (let i = 0; i < MAX_SLOTS; i++) {
    const position = cardSlot(i);
    const rect = { ...position, width: CARD_WIDTH, height: CARD_HEIGHT };
    if (!occupied.some((o) => rectsOverlap(o, rect))) {
      return { position, frame: growToContain(frame, rect) };
    }
  }
  // A frame with ten thousand cards in it has bigger problems; stack below.
  const bottom = Math.max(0, ...occupied.map((o) => o.y + o.height));
  const position = { x: FRAME_PADDING, y: bottom + GAP };
  return {
    position,
    frame: growToContain(frame, {
      ...position,
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
    }),
  };
}

// Where a new top-level node goes: below everything already on the board.
export function topLevelSlot(existing: Rect[]): Point {
  if (existing.length === 0) return { x: 0, y: 0 };
  const bottom = Math.max(...existing.map((r) => r.y + r.height));
  return { x: 0, y: bottom + TOP_LEVEL_GAP };
}

// Every (feeder, meta) pair implied by tags: a puzzle tagged group:X feeds
// each puzzle tagged meta-for:X.
export function computeFeederPairs(
  puzzles: PuzzleType[],
  tags: TagType[],
): FeederPair[] {
  const tagsById = indexedById(tags);
  const metasByGroup = new Map<string, string[]>();
  puzzles.forEach((p) => {
    p.tags.forEach((tagId) => {
      const name = tagsById.get(tagId)?.name;
      if (name?.startsWith(META_FOR_PREFIX)) {
        const group = name.slice(META_FOR_PREFIX.length);
        metasByGroup.set(group, [...(metasByGroup.get(group) ?? []), p._id]);
      }
    });
  });

  const seen = new Set<string>();
  const pairs: FeederPair[] = [];
  puzzles.forEach((p) => {
    p.tags.forEach((tagId) => {
      const name = tagsById.get(tagId)?.name;
      if (!name?.startsWith(GROUP_PREFIX)) return;
      const metas = metasByGroup.get(name.slice(GROUP_PREFIX.length)) ?? [];
      metas.forEach((meta) => {
        const key = `${p._id}:${meta}`;
        if (meta === p._id || seen.has(key)) return;
        seen.add(key);
        pairs.push({ feeder: p._id, meta });
      });
    });
  });
  return pairs;
}

export interface FrameRef {
  id: string;
  tag?: string;
  depth: number;
}

export type FrameChoice =
  | { frameId: string }
  | { createForTag: TagType }
  | { ungrouped: true };

// Which frame a puzzle belongs in, given the frames already on the board. A
// meta goes at the head of its round's frame; otherwise the most specific
// (deepest) frame among the puzzle's groups, with ties going to the earliest
// tag.
export function chooseFrameForPuzzle(
  puzzle: PuzzleType,
  tags: TagType[],
  frames: FrameRef[],
): FrameChoice {
  const tagsById = indexedById(tags);
  const tagsByName = new Map(tags.map((t) => [t.name, t]));
  const framesByTag = new Map(
    frames.filter((f) => f.tag).map((f) => [f.tag!, f]),
  );
  const puzzleTags = puzzle.tags
    .map((id) => tagsById.get(id))
    .filter((t): t is TagType => !!t)
    .sort(byCreatedAt);

  for (const tag of puzzleTags) {
    if (!tag.name.startsWith(META_FOR_PREFIX)) continue;
    const groupTag = tagsByName.get(
      `${GROUP_PREFIX}${tag.name.slice(META_FOR_PREFIX.length)}`,
    );
    const frame = groupTag && framesByTag.get(groupTag._id);
    if (frame) return { frameId: frame.id };
  }

  const groupTags = puzzleTags.filter(isFrameTag);
  let best: FrameRef | undefined;
  groupTags.forEach((tag) => {
    const frame = framesByTag.get(tag._id);
    if (frame && (!best || frame.depth > best.depth)) best = frame;
  });
  if (best) return { frameId: best.id };
  if (groupTags[0]) return { createForTag: groupTags[0] };
  return { ungrouped: true };
}

interface FrameSpec {
  key: string;
  tag?: TagType;
  frameKind: WhiteboardFrameKind;
  label: string;
  candidates: PuzzleType[];
  subframes: FrameSpec[];
  puzzles: PuzzleType[];
}

function groupRank(group: PuzzleGroup): number {
  if (!group.sharedTag) return 2;
  if (group.sharedTag.name === "administrivia") return 1;
  return 0;
}

function compareGroups(a: PuzzleGroup, b: PuzzleGroup): number {
  const rank = groupRank(a) - groupRank(b);
  if (rank !== 0) return rank;
  if (!a.sharedTag || !b.sharedTag) return 0;
  return byCreatedAt(a.sharedTag, b.sharedTag);
}

function* walkFrames(frames: FrameSpec[]): Generator<FrameSpec> {
  for (const frame of frames) {
    yield frame;
    yield* walkFrames(frame.subframes);
  }
}

function pruneEmpty(frames: FrameSpec[]): FrameSpec[] {
  return frames
    .map((f) => ({ ...f, subframes: pruneEmpty(f.subframes) }))
    .filter((f) => f.puzzles.length > 0 || f.subframes.length > 0);
}

function layoutFrame(
  frame: FrameSpec,
  parentKey: string | undefined,
  position: Point,
): { nodes: SeedNode[]; size: Size } {
  const children: SeedNode[] = [];
  let size: Size = { width: MIN_FRAME_WIDTH, height: MIN_FRAME_HEIGHT };

  frame.puzzles.forEach((puzzle, i) => {
    const slot = cardSlot(i);
    children.push({
      key: `puzzle:${puzzle._id}`,
      type: "puzzle",
      parentKey: frame.key,
      position: slot,
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      puzzle: puzzle._id,
    });
    size = growToContain(size, {
      ...slot,
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
    });
  });

  let y =
    frame.puzzles.length > 0
      ? FRAME_HEADER +
        Math.ceil(frame.puzzles.length / CARDS_PER_ROW) * (CARD_HEIGHT + GAP)
      : FRAME_HEADER;
  frame.subframes.forEach((sub) => {
    const subPosition = { x: FRAME_PADDING, y };
    const laidOut = layoutFrame(sub, frame.key, subPosition);
    children.push(...laidOut.nodes);
    size = growToContain(size, { ...subPosition, ...laidOut.size });
    y += laidOut.size.height + GAP;
  });

  const node: SeedNode = {
    key: frame.key,
    type: "frame",
    parentKey,
    position,
    width: size.width,
    height: size.height,
    tag: frame.tag?._id,
    label: frame.label,
    frameKind: frame.frameKind,
  };
  // Parents must come before their children for React Flow.
  return { nodes: [node, ...children], size };
}

// The initial layout for a new board: a frame per group (nested the same way
// the puzzle list nests them), every puzzle in exactly one frame, and an arrow
// from each feeder to its meta. Ordering only uses creation times, so solving
// puzzles never reshuffles anything.
export function seedLayout(
  allPuzzles: PuzzleType[],
  tags: TagType[],
): SeedResult {
  const puzzles = eligiblePuzzles(allPuzzles).sort(byCreatedAt);
  const tagsById = indexedById(tags);
  const tagsByName = new Map(tags.map((t) => [t.name, t]));

  // puzzleGroupsByRelevance gives us the nesting; a group adopted by more than
  // one parent is kept under the first one in our order.
  const seenTags = new Set<string>();
  const convert = (group: PuzzleGroup): FrameSpec | undefined => {
    const tag = group.sharedTag;
    if (tag) {
      if (seenTags.has(tag._id)) return undefined;
      seenTags.add(tag._id);
    }
    return {
      key: tag ? `frame:${tag._id}` : "frame:ungrouped",
      tag,
      frameKind: tag ? "group" : "ungrouped",
      label: tag ? frameLabelForTag(tag) : UNGROUPED_LABEL,
      candidates: group.puzzles,
      subframes: [...group.subgroups]
        .sort(compareGroups)
        .map(convert)
        .filter((f): f is FrameSpec => !!f),
      puzzles: [],
    };
  };
  const roots = puzzleGroupsByRelevance(puzzles, tags)
    .sort(compareGroups)
    .map(convert)
    .filter((f): f is FrameSpec => !!f);

  const framesByTag = new Map<string, FrameSpec>();
  for (const frame of walkFrames(roots)) {
    if (frame.tag) framesByTag.set(frame.tag._id, frame);
  }

  // Metas first, at the head of their round's frame even without group:X.
  const assigned = new Set<string>();
  puzzles.forEach((puzzle) => {
    const metaFrames = puzzle.tags
      .map((id) => tagsById.get(id))
      .filter((t): t is TagType => !!t?.name.startsWith(META_FOR_PREFIX))
      .sort(byCreatedAt)
      .map((t) =>
        tagsByName.get(
          `${GROUP_PREFIX}${t.name.slice(META_FOR_PREFIX.length)}`,
        ),
      )
      .map((t) => t && framesByTag.get(t._id))
      .filter((f): f is FrameSpec => !!f);
    if (metaFrames[0]) {
      metaFrames[0].puzzles.push(puzzle);
      assigned.add(puzzle._id);
    }
  });

  // Everything else goes in the first frame (in our order) that lists it.
  // dedupedGroup has already moved subgroup members out of their parents.
  for (const frame of walkFrames(roots)) {
    frame.candidates.forEach((puzzle) => {
      if (assigned.has(puzzle._id)) return;
      frame.puzzles.push(puzzle);
      assigned.add(puzzle._id);
    });
  }

  const nodes: SeedNode[] = [];
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  pruneEmpty(roots).forEach((root) => {
    const probe = layoutFrame(root, undefined, { x: 0, y: 0 });
    if (x > 0 && x + probe.size.width > TOP_LEVEL_WRAP_WIDTH) {
      x = 0;
      y += rowHeight + TOP_LEVEL_GAP;
      rowHeight = 0;
    }
    const laidOut = layoutFrame(root, undefined, { x, y });
    nodes.push(...laidOut.nodes);
    x += laidOut.size.width + TOP_LEVEL_GAP;
    rowHeight = Math.max(rowHeight, laidOut.size.height);
  });

  return { nodes, edges: computeFeederPairs(puzzles, tags) };
}
