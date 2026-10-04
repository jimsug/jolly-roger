import { indexedById } from "../listUtils";
import type { PuzzleType } from "../models/Puzzles";
import type { TagType } from "../models/Tags";
import type { WhiteboardFrameKind } from "../models/WhiteboardNodes";
import type { PuzzleGroup } from "../puzzle-sort-and-group";
import { puzzleGroupsByRelevance } from "../puzzle-sort-and-group";
import {
  isMetaForTag as isMetaForTagName,
  TAG_SYNONYMS,
  type TagSynonymRule,
} from "../tagNames";
import isWhiteboardPuzzle from "./isWhiteboardPuzzle";

// All layout is in flow (canvas) units and never depends on anyone's screen,
// so every client and the server agree on where things go.
export const CARD_WIDTH = 240;
export const CARD_HEIGHT = 112;
// On-board size of a line's free end.
export const POINT_SIZE = 12;
export const GAP = 16;
export const FRAME_PADDING = 24;
export const FRAME_HEADER = 56;
const CARDS_PER_ROW = 4;
const TOP_LEVEL_GAP = 64;
const TOP_LEVEL_WRAP_WIDTH = 3200;
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

interface FeederPair {
  feeder: string;
  meta: string;
}

interface SeedResult {
  nodes: SeedNode[];
  edges: FeederPair[];
}

const GROUP_PREFIX = "group:";
const META_FOR_PREFIX = "meta-for:";

// Whether a tag marks its puzzle as a meta for a round (meta-for:X), read
// through the synonym table (the server passes the saved one).
export function isMetaForTag(
  tag: Pick<TagType, "name">,
  synonyms: readonly TagSynonymRule[] = TAG_SYNONYMS,
): boolean {
  return isMetaForTagName(tag.name, synonyms);
}

function isFrameTag(tag: Pick<TagType, "name">): boolean {
  return tag.name === "administrivia" || tag.name.startsWith(GROUP_PREFIX);
}

export function frameLabelForTag(tag: Pick<TagType, "name">): string {
  const label = tag.name.startsWith(GROUP_PREFIX)
    ? tag.name.slice(GROUP_PREFIX.length)
    : tag.name;
  // A bare "group:" keeps its whole name, since a stored label can't be empty.
  return label || tag.name;
}

// The name a frame shows: its round's tag (so renames show straight away),
// failing that the name saved with it.
export function frameLabel(
  frame: { label?: string },
  tagName: string | undefined,
): string | undefined {
  return tagName ? frameLabelForTag({ name: tagName }) : frame.label;
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

function rectsOverlap(a: Rect, b: Rect): boolean {
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

// Something already in a frame. A meta is one of the round's metas, as the
// card being placed sees it: a meta being placed treats every card as a
// feeder.
export interface Occupied extends Rect {
  meta?: boolean;
}

// The band a row of card slots takes up.
function slotRow(row: number): Rect {
  return {
    ...cardSlot(row * CARDS_PER_ROW),
    width: CARDS_PER_ROW * CARD_WIDTH + (CARDS_PER_ROW - 1) * GAP,
    height: CARD_HEIGHT,
  };
}

// Finds the first card slot in a frame not covered by any existing child,
// growing the frame if that slot falls outside it (e.g. because someone shrank
// the frame). A row holding only metas is left for metas, so a puzzle added
// to a round later doesn't land beside its meta.
export function placeIntoFrame(
  frame: Size,
  occupied: Occupied[],
): { position: Point; frame: Size } {
  for (let i = 0; i < MAX_SLOTS; i++) {
    const position = cardSlot(i);
    const rect = { ...position, width: CARD_WIDTH, height: CARD_HEIGHT };
    const row = slotRow(Math.floor(i / CARDS_PER_ROW));
    const inRow = occupied.filter((o) => rectsOverlap(o, row));
    const metaRow = inRow.length > 0 && inRow.every((o) => o.meta);
    if (!metaRow && !occupied.some((o) => rectsOverlap(o, rect))) {
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

// The meta-for:X tags for a frame tagged group:X. A frame for any other tag,
// or none, has none.
function roundMetaTags(
  frameTag: string | undefined,
  tags: Pick<TagType, "_id" | "name">[],
): Set<string> {
  const groupName = tags.find((t) => t._id === frameTag)?.name;
  if (!groupName?.startsWith(GROUP_PREFIX)) return new Set();
  const metaName = `${META_FOR_PREFIX}${groupName.slice(GROUP_PREFIX.length)}`;
  return new Set(tags.filter((t) => t.name === metaName).map((t) => t._id));
}

// The tags that place a puzzle in a round's frame: the frame's own tag, and
// for a group:X frame, meta-for:X too (see chooseFrameForPuzzle).
export function roundTags(
  frameTag: string,
  tags: Pick<TagType, "_id" | "name">[],
): string[] {
  return [frameTag, ...roundMetaTags(frameTag, tags)];
}

// A round's metas: the puzzles tagged meta-for:X, for a frame tagged
// group:X. A frame for any other tag, or none, has none.
export function roundMetas(
  frameTag: string | undefined,
  tags: Pick<TagType, "_id" | "name">[],
  puzzles: Pick<PuzzleType, "_id" | "tags">[],
): Set<string> {
  const metaTags = roundMetaTags(frameTag, tags);
  if (metaTags.size === 0) return new Set();
  return new Set(
    puzzles
      .filter((p) => p.tags.some((id) => metaTags.has(id)))
      .map((p) => p._id),
  );
}

interface FrameRef {
  id: string;
  tag?: string;
  depth: number;
}

type FrameChoice =
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
  synonyms: readonly TagSynonymRule[] = TAG_SYNONYMS,
): FrameChoice {
  const tagsById = indexedById(tags);
  const tagsByName = new Map(tags.map((t) => [t.name, t]));
  const framesByTag = new Map(
    frames.flatMap((f) => (f.tag ? [[f.tag, f] as const] : [])),
  );
  const puzzleTags = puzzle.tags
    .map((id) => tagsById.get(id))
    .filter((t): t is TagType => !!t)
    .toSorted(byCreatedAt);

  for (const tag of puzzleTags) {
    if (!isMetaForTag(tag, synonyms)) continue;
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
  // How many of puzzles, at the start, are the round's metas.
  metas: number;
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
  const metaRows = Math.ceil(frame.metas / CARDS_PER_ROW);
  const feederRows = Math.ceil(
    (frame.puzzles.length - frame.metas) / CARDS_PER_ROW,
  );

  frame.puzzles.forEach((puzzle, i) => {
    const slot = cardSlot(
      i < frame.metas ? i : metaRows * CARDS_PER_ROW + i - frame.metas,
    );
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

  let y = FRAME_HEADER + (metaRows + feederRows) * (CARD_HEIGHT + GAP);
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
// puzzles never reshuffles anything. The caller supplies the label for the
// frame of puzzles with no group, since it's stored and shown to everyone.
export function seedLayout(
  allPuzzles: PuzzleType[],
  tags: TagType[],
  ungroupedLabel: string,
  synonyms: readonly TagSynonymRule[] = TAG_SYNONYMS,
): SeedResult {
  const puzzles = allPuzzles
    .filter((p) => !p.deleted && !isWhiteboardPuzzle(p))
    .toSorted(byCreatedAt);
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
      label: tag ? frameLabelForTag(tag) : ungroupedLabel,
      candidates: group.puzzles,
      subframes: group.subgroups
        .toSorted(compareGroups)
        .map(convert)
        .filter((f): f is FrameSpec => !!f),
      puzzles: [],
      metas: 0,
    };
  };
  const roots = puzzleGroupsByRelevance(puzzles, tags, synonyms)
    .toSorted(compareGroups)
    .map(convert)
    .filter((f): f is FrameSpec => !!f);

  const framesByTag = new Map<string, FrameSpec>();
  for (const frame of walkFrames(roots)) {
    if (frame.tag) framesByTag.set(frame.tag._id, frame);
  }

  // Metas first, on their own row (or rows) at the head of their round's
  // frame even without group:X, so feeder arrows run up to them.
  const assigned = new Set<string>();
  puzzles.forEach((puzzle) => {
    const metaFrame = puzzle.tags
      .map((id) => tagsById.get(id))
      .filter((t): t is TagType => !!t && isMetaForTag(t, synonyms))
      .toSorted(byCreatedAt)
      .map((t) =>
        tagsByName.get(
          `${GROUP_PREFIX}${t.name.slice(META_FOR_PREFIX.length)}`,
        ),
      )
      .map((t) => t && framesByTag.get(t._id))
      .find((f): f is FrameSpec => !!f);
    if (metaFrame) {
      metaFrame.puzzles.push(puzzle);
      metaFrame.metas += 1;
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
