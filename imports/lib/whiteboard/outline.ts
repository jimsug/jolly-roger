import type { WhiteboardNodeType } from "../models/WhiteboardNodes";
import { inParentLoop } from "./arrange";
import { frameLabel } from "./layout";
import type { RoundState } from "./rounds";

type OutlineNode = Pick<
  WhiteboardNodeType,
  | "_id"
  | "type"
  | "parent"
  | "position"
  | "hidden"
  | "collapsed"
  | "locked"
  | "lockedBy"
  | "frameKind"
  | "tag"
  | "label"
>;

// A frame as the Outline lists it, with the frames inside it.
export interface OutlineRow {
  id: string;
  // Its round's name, or the label saved with it; a hand-made frame with
  // no label has none.
  label: string | undefined;
  // Cards solved and counted directly inside it, from its round state, as
  // the frame's header counts them.
  solved: number;
  total: number;
  finished: boolean;
  readyToMeta: boolean;
  // Collapsed for everyone on the board.
  collapsed: boolean;
  locked: boolean;
  lockedBy: string | undefined;
  children: OutlineRow[];
}

// Ungrouped last, and otherwise top to bottom and then left to right.
function byPlace(a: OutlineNode, b: OutlineNode) {
  return (
    Number(a.frameKind === "ungrouped") - Number(b.frameKind === "ungrouped") ||
    a.position.y - b.position.y ||
    a.position.x - b.position.x ||
    (a._id < b._id ? -1 : a._id > b._id ? 1 : 0)
  );
}

// The frames on the board as a tree, nested as the board nests them, each
// level top to bottom and then left to right with Ungrouped last. Hidden
// frames are left out, and a frame whose parent isn't listed sits at the top
// level, as does any frame in a parent loop (which the board draws there
// too, see withoutParentLoops).
export function outlineTree(
  nodes: readonly OutlineNode[],
  states: ReadonlyMap<string, RoundState>,
  tagNames: ReadonlyMap<string, string> = new Map(),
): OutlineRow[] {
  const frames = nodes.filter((n) => n.type === "frame" && !n.hidden);
  const byId = new Map(frames.map((f) => [f._id, f]));
  const parentOf = (frame: OutlineNode) =>
    frame.parent && byId.has(frame.parent) && !inParentLoop(byId, frame._id)
      ? frame.parent
      : undefined;

  const childrenOf = new Map<string | undefined, OutlineNode[]>();
  frames.forEach((frame) => {
    const parent = parentOf(frame);
    childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), frame]);
  });

  const seen = new Set<string>();
  const build = (parent: string | undefined): OutlineRow[] =>
    (childrenOf.get(parent) ?? [])
      .filter((frame) => !seen.has(frame._id))
      .toSorted(byPlace)
      .map((frame) => {
        seen.add(frame._id);
        const state = states.get(frame._id);
        const cards = state?.cards ?? { solved: 0, unsolved: 0 };
        return {
          id: frame._id,
          label: frameLabel(
            frame,
            frame.tag ? tagNames.get(frame.tag) : undefined,
          ),
          solved: cards.solved,
          total: cards.solved + cards.unsolved,
          finished: !!state?.finished,
          readyToMeta: !!state?.readyToMeta,
          collapsed: !!frame.collapsed,
          locked: !!frame.locked,
          lockedBy: frame.lockedBy,
          children: build(frame._id),
        };
      });
  return build(undefined);
}

// One line of the Outline as shown, with the subtrees folded away in the
// panel left out.
export interface OutlineLine {
  row: OutlineRow;
  // 1 at the top level.
  level: number;
  parent: string | undefined;
  // Undefined for a frame with nothing nested in it.
  expanded: boolean | undefined;
}

// The rows the Outline shows, in order, with those under a folded row left
// out.
export function outlineLines(
  tree: readonly OutlineRow[],
  folded: ReadonlySet<string>,
): OutlineLine[] {
  const lines: OutlineLine[] = [];
  const walk = (
    rows: readonly OutlineRow[],
    level: number,
    parent: string | undefined,
  ) => {
    rows.forEach((row) => {
      const hasChildren = row.children.length > 0;
      const expanded = hasChildren ? !folded.has(row.id) : undefined;
      lines.push({ row, level, parent, expanded });
      if (expanded) walk(row.children, level + 1, row.id);
    });
  };
  walk(tree, 1, undefined);
  return lines;
}
