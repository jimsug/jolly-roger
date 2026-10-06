import type { PuzzleType } from "../models/Puzzles";
import type { TagType } from "../models/Tags";
import type { WhiteboardNodeType } from "../models/WhiteboardNodes";
import { computeSolvedness } from "../solvedness";
import { GROUP_TAG_PREFIX } from "../tagNames";
import { roundMetaTags } from "./layout";
import { MAX_FRAME_DEPTH } from "./limits";

type RoundNode = Pick<
  WhiteboardNodeType,
  "_id" | "type" | "parent" | "puzzle" | "tag" | "hidden"
>;
type RoundPuzzle = Pick<
  PuzzleType,
  "_id" | "tags" | "answers" | "expectedAnswerCount" | "completedWithNoAnswer"
>;
type RoundTag = Pick<TagType, "_id" | "name">;

// Puzzles by computeSolvedness. Puzzles with nothing to solve count neither
// way.
export interface SolvedCount {
  solved: number;
  unsolved: number;
}

export interface RoundState {
  // Cards directly inside the frame, as the puzzle list's group headings
  // count them.
  cards: SolvedCount;
  // Cards anywhere inside the frame, through any frames nested in it.
  allCards: SolvedCount;
  // The round's metas: puzzles tagged meta-for:X for a frame tagged group:X,
  // wherever their cards are.
  metas: SolvedCount;
  // The puzzles tagged group:X that aren't its metas.
  feeders: SolvedCount;
  // A round (a frame with a tag) is finished once it has a meta and every
  // meta is solved, or, with no meta, once it has a solved card and no
  // unsolved one at any depth.
  finished: boolean;
  // Every feeder is solved, but a meta isn't.
  readyToMeta: boolean;
}

interface RoundIndex {
  children: Map<string, RoundNode[]>;
  puzzles: Map<string, RoundPuzzle>;
  tags: RoundTag[];
}

function indexRounds(
  nodes: RoundNode[],
  puzzles: RoundPuzzle[],
  tags: RoundTag[],
): RoundIndex {
  const children = new Map<string, RoundNode[]>();
  nodes.forEach((node) => {
    if (node.hidden || !node.parent) return;
    children.set(node.parent, [...(children.get(node.parent) ?? []), node]);
  });
  return {
    children,
    puzzles: new Map(puzzles.map((p) => [p._id, p])),
    tags,
  };
}

function tally(count: SolvedCount, puzzle: RoundPuzzle) {
  const solvedness = computeSolvedness(puzzle);
  if (solvedness === "solved") count.solved += 1;
  else if (solvedness === "unsolved") count.unsolved += 1;
}

function stateOf(
  index: RoundIndex,
  frame: Pick<RoundNode, "_id" | "tag">,
): RoundState {
  const cards: SolvedCount = { solved: 0, unsolved: 0 };
  const allCards: SolvedCount = { solved: 0, unsolved: 0 };
  // Breadth first, bounded and with a visited set, so a parent loop can't
  // hang it.
  const seen = new Set([frame._id]);
  let level = [frame._id];
  for (let depth = 1; depth <= MAX_FRAME_DEPTH && level.length > 0; depth++) {
    const next: string[] = [];
    level.forEach((parentId) => {
      index.children.get(parentId)?.forEach((child) => {
        if (seen.has(child._id)) return;
        seen.add(child._id);
        if (child.type === "frame") {
          next.push(child._id);
        } else if (child.type === "puzzle" && child.puzzle) {
          // A card whose puzzle isn't live isn't drawn, so it isn't counted.
          const puzzle = index.puzzles.get(child.puzzle);
          if (!puzzle) return;
          tally(allCards, puzzle);
          if (depth === 1) tally(cards, puzzle);
        }
      });
    });
    level = next;
  }

  const metas: SolvedCount = { solved: 0, unsolved: 0 };
  const feeders: SolvedCount = { solved: 0, unsolved: 0 };
  const tagName = index.tags.find((t) => t._id === frame.tag)?.name;
  if (frame.tag && tagName?.startsWith(GROUP_TAG_PREFIX)) {
    const groupTag = frame.tag;
    const metaTags = roundMetaTags(groupTag, index.tags);
    index.puzzles.forEach((puzzle) => {
      if (puzzle.tags.some((id) => metaTags.has(id))) {
        tally(metas, puzzle);
      } else if (puzzle.tags.includes(groupTag)) {
        tally(feeders, puzzle);
      }
    });
  }

  const hasMeta = metas.solved + metas.unsolved > 0;
  const finished =
    !!frame.tag &&
    (hasMeta
      ? metas.unsolved === 0
      : allCards.solved > 0 && allCards.unsolved === 0);
  const readyToMeta =
    metas.unsolved > 0 && feeders.solved > 0 && feeders.unsolved === 0;

  return { cards, allCards, metas, feeders, finished, readyToMeta };
}

// How far along one frame's round is.
export function roundState(
  frame: Pick<RoundNode, "_id" | "tag">,
  nodes: RoundNode[],
  puzzles: RoundPuzzle[],
  tags: RoundTag[],
): RoundState {
  return stateOf(indexRounds(nodes, puzzles, tags), frame);
}

// roundState for every frame on the board that isn't hidden.
export function roundStates(
  nodes: RoundNode[],
  puzzles: RoundPuzzle[],
  tags: RoundTag[],
): Map<string, RoundState> {
  const index = indexRounds(nodes, puzzles, tags);
  return new Map(
    nodes
      .filter((node) => node.type === "frame" && !node.hidden)
      .map((frame) => [frame._id, stateOf(index, frame)]),
  );
}

// The rounds on the board that are finished and not yet collapsed, for
// Collapse finished rounds, from the states roundStates worked out. Hand-made
// and Ungrouped frames have no tag, so they're never rounds.
export function finishedFrames(
  nodes: Pick<WhiteboardNodeType, "_id" | "type" | "hidden" | "collapsed">[],
  states: ReadonlyMap<string, RoundState>,
): string[] {
  return nodes
    .filter(
      (node) =>
        node.type === "frame" &&
        !node.hidden &&
        !node.collapsed &&
        !!states.get(node._id)?.finished,
    )
    .map((node) => node._id);
}
