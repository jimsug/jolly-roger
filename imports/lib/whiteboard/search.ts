import type { WhiteboardEdgeType } from "../models/WhiteboardEdges";
import type { WhiteboardNodeType } from "../models/WhiteboardNodes";
import { frameLabel } from "./layout";

export type BoardSearchKind = "puzzle" | "frame" | "sticky" | "text" | "line";

export interface BoardSearchHit {
  kind: BoardSearchKind;
  // Unique among the hits, for keys and the listbox's option ids.
  key: string;
  label: string;
  // The node to show: the card, frame, sticky or text box. For a puzzle that
  // isn't on the board, its hidden card if it has one; for a frame that
  // isn't, the hidden frame.
  node?: string;
  // The line to show, for a line's label.
  edge?: string;
  puzzle?: string;
  // A puzzle whose card is hidden or that has no card at all, or a frame
  // someone removed.
  notOnBoard?: boolean;
}

type SearchNode = Pick<
  WhiteboardNodeType,
  "_id" | "type" | "puzzle" | "hidden" | "label" | "tag" | "text"
>;
type SearchEdge = Pick<WhiteboardEdgeType, "_id" | "label">;

export interface BoardSearchInput<P extends { _id: string; title: string }> {
  query: string;
  nodes: SearchNode[];
  edges: SearchEdge[];
  // The lines the board draws, counting those inside collapsed frames, by
  // id. A line it doesn't draw (hidden, a feeder arrow this viewer has
  // turned off, or one to a card that's gone) can't be panned to, so its
  // label isn't found.
  shownLines: ReadonlySet<string>;
  // The hunt's live puzzles, without the board's own.
  puzzles: P[];
  // Makes the test for whether a puzzle matches the query's keys, as the
  // puzzle list does (compilePuzzleMatcher), so a search finds the same
  // puzzles in both places.
  puzzleMatcher: (keys: string[]) => (puzzle: P) => boolean;
  // Tag names by id, for the frames named after their round.
  tagNames: Map<string, string>;
}

export function searchKeys(query: string): string[] {
  return query
    .split(/\s+/)
    .map((key) => key.toLowerCase())
    .filter((key) => key.length > 0);
}

// Every key appears somewhere in the text.
function textMatches(text: string | undefined, keys: string[]): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return keys.every((key) => lower.includes(key));
}

const KIND_ORDER: BoardSearchKind[] = [
  "puzzle",
  "frame",
  "sticky",
  "text",
  "line",
];

// What on the board matches a search: puzzles by title, answer or tag (as the
// puzzle list finds them), frames by their label, sticky notes and text boxes
// by their text, and drawn lines by their label. Puzzles and frames not on
// the board are included and flagged. Nothing matches an empty query.
export function searchBoard<P extends { _id: string; title: string }>({
  query,
  nodes,
  edges,
  shownLines,
  puzzles,
  puzzleMatcher,
  tagNames,
}: BoardSearchInput<P>): BoardSearchHit[] {
  const keys = searchKeys(query);
  if (keys.length === 0) return [];

  const hits: BoardSearchHit[] = [];
  const cards = new Map<string, SearchNode>();
  nodes.forEach((node) => {
    if (node.type === "puzzle" && node.puzzle) cards.set(node.puzzle, node);
  });

  const matchPuzzle = puzzleMatcher(keys);
  puzzles.forEach((puzzle) => {
    if (!matchPuzzle(puzzle)) return;
    const card = cards.get(puzzle._id);
    hits.push({
      kind: "puzzle",
      key: `puzzle:${puzzle._id}`,
      label: puzzle.title,
      node: card?._id,
      puzzle: puzzle._id,
      notOnBoard: !card || !!card.hidden,
    });
  });

  nodes.forEach((node) => {
    let label: string | undefined;
    if (node.type === "frame") {
      label = frameLabel(node, node.tag ? tagNames.get(node.tag) : undefined);
    } else if (
      (node.type === "sticky" || node.type === "text") &&
      !node.hidden
    ) {
      label = node.text;
    } else {
      return;
    }
    if (!label || !textMatches(label, keys)) return;
    hits.push({
      kind: node.type,
      key: `node:${node._id}`,
      label,
      node: node._id,
      ...(node.hidden ? { notOnBoard: true } : {}),
    });
  });

  edges.forEach(({ _id, label }) => {
    if (!shownLines.has(_id) || !label || !textMatches(label, keys)) return;
    hits.push({ kind: "line", key: `edge:${_id}`, label, edge: _id });
  });

  // Things on the board before things that aren't, then by kind and name.
  return hits.toSorted(
    (a, b) =>
      Number(!!a.notOnBoard) - Number(!!b.notOnBoard) ||
      KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
      a.label.localeCompare(b.label),
  );
}
