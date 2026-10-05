import type { WhiteboardEdgeType } from "../models/WhiteboardEdges";
import type { WhiteboardNodeType } from "../models/WhiteboardNodes";

type Titled = { _id: string; title: string };

// A puzzle that isn't on the board: its hidden card, or no card at all.
export interface MissingCard {
  id: string | undefined;
  puzzle: string;
  title: string;
}

// The puzzles the "Not on the board" panel lists, by title: those whose card
// someone hid, and those with no card. Only the puzzles in livePuzzles are
// listed, so a deleted puzzle's card, hidden with it, never is.
export function missingCards(
  livePuzzles: Titled[],
  nodes: Pick<WhiteboardNodeType, "_id" | "type" | "puzzle" | "hidden">[],
): MissingCard[] {
  const titles = new Map(livePuzzles.map((p) => [p._id, p.title]));
  const onBoard = new Set(nodes.map((n) => n.puzzle).filter(Boolean));
  const hidden = nodes.flatMap((n) => {
    const title = n.puzzle && titles.get(n.puzzle);
    return n.type === "puzzle" && n.hidden && n.puzzle && title
      ? [{ id: n._id, puzzle: n.puzzle, title }]
      : [];
  });
  const missing = livePuzzles
    .filter((p) => !onBoard.has(p._id))
    .map((p) => ({ id: undefined, puzzle: p._id, title: p.title }));
  return [...hidden, ...missing].toSorted((a, b) =>
    a.title.localeCompare(b.title),
  );
}

// The hidden feeder arrows the panel lists: those between two of the
// puzzles in livePuzzles, with both puzzles' titles.
export function hiddenFeederArrows(
  livePuzzles: Titled[],
  edges: Pick<WhiteboardEdgeType, "_id" | "feeder" | "meta">[],
): { id: string; feeder: string; meta: string }[] {
  const titles = new Map(livePuzzles.map((p) => [p._id, p.title]));
  return edges.flatMap((e) => {
    const feeder = e.feeder && titles.get(e.feeder);
    const meta = e.meta && titles.get(e.meta);
    return feeder && meta ? [{ id: e._id, feeder, meta }] : [];
  });
}
