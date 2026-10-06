import type { PuzzleType } from "../models/Puzzles";
import type { TagType } from "../models/Tags";
import type { WhiteboardNodeType } from "../models/WhiteboardNodes";
import { computeSolvedness } from "../solvedness";
import {
  TAG_SYNONYMS,
  type TagSynonymRule,
  tagKind,
  tagPrefixValue,
} from "../tagNames";
import { absolutePosition, ancestorsOf } from "./arrange";
import { CARD_HEIGHT, FRAME_HEADER, GAP } from "./layout";

export type FeederOrder = "board" | "solveTime";

type FeederPuzzle = Pick<
  PuzzleType,
  | "_id"
  | "tags"
  | "title"
  | "answers"
  | "expectedAnswerCount"
  | "completedWithNoAnswer"
  | "updatedAt"
  | "answersUpdatedAt"
>;

type FeederNode = Pick<
  WhiteboardNodeType,
  "_id" | "type" | "puzzle" | "parent" | "position" | "hidden"
>;

// The values of a puzzle's tags of one kind ("group:x" gives "x"), read
// through the synonym table.
function tagValues(
  puzzle: Pick<PuzzleType, "tags">,
  names: Map<string, string>,
  kind: "group" | "metaFor",
  synonyms: readonly TagSynonymRule[],
): Set<string> {
  const values = new Set<string>();
  puzzle.tags.forEach((id) => {
    const name = names.get(id);
    if (name === undefined || tagKind(name, synonyms) !== kind) return;
    const value = tagPrefixValue(name, synonyms);
    if (value !== undefined) values.add(value);
  });
  return values;
}

function hasKind(
  puzzle: Pick<PuzzleType, "tags">,
  names: Map<string, string>,
  kinds: string[],
  synonyms: readonly TagSynonymRule[],
): boolean {
  return puzzle.tags.some((id) => {
    const name = names.get(id);
    return name !== undefined && kinds.includes(tagKind(name, synonyms));
  });
}

// The puzzles that feed a meta, unordered. A meta-for:X puzzle is fed by the
// puzzles tagged group:X, as computeFeederPairs pairs them for the arrows. A
// metameta without a meta-for: tag is fed by the round metas (is:meta or
// meta-for:, and not metametas themselves) sharing one of its group: tags,
// or every round meta in the hunt when it has none, and a bare is:meta by
// the other puzzles in its own rounds. Anything else has none. Tags go through
// the synonym table, though it can't hold rules into or out of group:,
// meta-for: or is:, so the pairing is the one computeFeederPairs makes.
function feederSet<P extends FeederPuzzle>(
  meta: P,
  puzzles: P[],
  names: Map<string, string>,
  synonyms: readonly TagSynonymRule[],
): P[] {
  const others = puzzles.filter((p) => p._id !== meta._id);
  const metaFor = tagValues(meta, names, "metaFor", synonyms);
  if (metaFor.size > 0) {
    return others.filter((p) =>
      [...tagValues(p, names, "group", synonyms)].some((g) => metaFor.has(g)),
    );
  }
  if (hasKind(meta, names, ["metameta"], synonyms)) {
    const groups = tagValues(meta, names, "group", synonyms);
    return others.filter(
      (p) =>
        hasKind(p, names, ["meta", "metaFor"], synonyms) &&
        !hasKind(p, names, ["metameta"], synonyms) &&
        (groups.size === 0 ||
          [...tagValues(p, names, "group", synonyms)].some((g) =>
            groups.has(g),
          )),
    );
  }
  if (hasKind(meta, names, ["meta"], synonyms)) {
    const rounds = tagValues(meta, names, "group", synonyms);
    return others.filter((p) =>
      [...tagValues(p, names, "group", synonyms)].some((g) => rounds.has(g)),
    );
  }
  return [];
}

// Where a card sits, for reading the board in order: the frame at the top of
// its nesting (by where the frame is on the board, top to bottom in rows a
// card's height apart, then left to right), then the slot row inside that
// frame, then left to right. Rounding to rows keeps frames or cards nudged
// by hand in the row they're in. A card at the top level is a frame of its
// own. Cards not on show go after every card that is.
type BoardKey = {
  band: number;
  frameX: number;
  frame: string;
  row: number;
  x: number;
};

const ROW = CARD_HEIGHT + GAP;

function boardKeys(nodes: FeederNode[]): Map<string, BoardKey> {
  const byId = new Map(nodes.map((n) => [n._id, n]));
  // Where a node is on the board, and the frame at the top of its nesting
  // (the node itself at the top level)
  const place = (node: FeederNode) => {
    const top = ancestorsOf(byId, node._id).at(-1);
    const outermost = top === undefined ? node : byId.get(top)!;
    return { ...absolutePosition(byId, node), outermost };
  };

  const keys = new Map<string, BoardKey>();
  nodes.forEach((n) => {
    if (n.type !== "puzzle" || !n.puzzle || n.hidden || keys.has(n.puzzle)) {
      return;
    }
    const at = place(n);
    if (at.outermost === n) {
      keys.set(n.puzzle, {
        band: Math.round(at.y / ROW),
        frameX: at.x,
        frame: n._id,
        row: 0,
        x: 0,
      });
      return;
    }
    const frame = at.outermost.position;
    keys.set(n.puzzle, {
      band: Math.round(frame.y / ROW),
      frameX: frame.x,
      frame: at.outermost._id,
      row: Math.round((at.y - frame.y - FRAME_HEADER) / ROW),
      x: at.x,
    });
  });
  return keys;
}

function compareKeys(a: BoardKey | undefined, b: BoardKey | undefined) {
  if (!a || !b) return (a ? 0 : 1) - (b ? 0 : 1);
  return (
    a.band - b.band ||
    a.frameX - b.frameX ||
    a.frame.localeCompare(b.frame) ||
    a.row - b.row ||
    a.x - b.x
  );
}

const answered = (p: FeederPuzzle) =>
  p.answers.length > 0 || computeSolvedness(p) === "solved";

// When a puzzle's answers last changed. A puzzle answered before that was
// recorded goes by when it last changed at all.
const answeredAt = (p: FeederPuzzle) => +(p.answersUpdatedAt ?? p.updatedAt);

// The puzzles that feed `meta`, in board order (see boardKeys), or by solve
// time: the most recently answered first, by when the puzzle's answers last
// changed, then the rest in board order.
export function feedersOf<P extends FeederPuzzle>(
  meta: P,
  puzzles: P[],
  tags: Pick<TagType, "_id" | "name">[],
  nodes: FeederNode[],
  {
    order = "board",
    synonyms = TAG_SYNONYMS,
  }: { order?: FeederOrder; synonyms?: readonly TagSynonymRule[] } = {},
): P[] {
  const names = new Map(tags.map((t) => [t._id, t.name]));
  const keys = boardKeys(nodes);
  const byBoard = (a: P, b: P) =>
    compareKeys(keys.get(a._id), keys.get(b._id)) ||
    a.title.localeCompare(b.title) ||
    a._id.localeCompare(b._id);
  const feeders = feederSet(meta, puzzles, names, synonyms).toSorted(byBoard);
  if (order === "board") return feeders;
  return feeders.toSorted((a, b) => {
    if (answered(a) !== answered(b)) return answered(a) ? -1 : 1;
    if (!answered(a)) return 0;
    return answeredAt(b) - answeredAt(a);
  });
}

// What Copy answers puts on the clipboard: a line per feeder, in the order
// given, with its answers (several joined by commas), or blank when it has
// none yet.
export function feederAnswersText(
  feeders: Pick<PuzzleType, "answers">[],
): string {
  return feeders.map((p) => p.answers.join(", ")).join("\n");
}

// How many of the feeders are solved, of those with something to solve.
export function feederCounts(feeders: FeederPuzzle[]): {
  solved: number;
  total: number;
} {
  let solved = 0;
  let total = 0;
  feeders.forEach((p) => {
    const solvedness = computeSolvedness(p);
    if (solvedness === "noAnswers") return;
    total += 1;
    if (solvedness === "solved") solved += 1;
  });
  return { solved, total };
}
