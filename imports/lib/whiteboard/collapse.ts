import { ancestorsOf } from "./arrange";
import { FRAME_HEADER } from "./layout";

// How tall a collapsed frame is drawn: its header and nothing else.
export const COLLAPSED_FRAME_HEIGHT = FRAME_HEADER;

// What folding needs to know about a node: where it is and, for a frame,
// whether it's collapsed.
export interface FoldNode {
  _id: string;
  parent?: string;
  collapsed?: boolean;
}

// Each node that a collapsed frame hides, mapped to the outermost such frame
// above it, which is drawn in its place. Frames in `open` (peeked at, or
// holding something this viewer is busy with) hide nothing. A frame in a
// parent loop is drawn at the top level (see withoutParentLoops), so a loop
// hides nothing above it, and nothing in one is hidden.
export function foldedInto(
  nodes: readonly FoldNode[],
  open: ReadonlySet<string>,
): Map<string, string> {
  const byId = new Map(nodes.map((n) => [n._id, n]));
  const loops = new Map<string, boolean>();
  const inLoop = (id: string) => {
    let looped = loops.get(id);
    if (looped === undefined) {
      looped = ancestorsOf(byId, id).includes(id);
      loops.set(id, looped);
    }
    return looped;
  };

  const result = new Map<string, string>();
  nodes.forEach((node) => {
    if (inLoop(node._id)) return;
    let outermost: string | undefined;
    for (const id of ancestorsOf(byId, node._id)) {
      if (byId.get(id)?.collapsed && !open.has(id)) outermost = id;
      if (inLoop(id)) break;
    }
    if (outermost) result.set(node._id, outermost);
  });
  return result;
}

export interface FoldedEnds {
  source: string;
  target: string;
  // Whether either end was moved onto a collapsed frame.
  folded: boolean;
}

// A line's ends once folded frames stand in for what they hide, or undefined
// when both ends are inside the same one, so there's no line to draw.
export function foldEnds(
  source: string,
  target: string,
  folded: ReadonlyMap<string, string>,
): FoldedEnds | undefined {
  const from = folded.get(source) ?? source;
  const to = folded.get(target) ?? target;
  if (from === to) return undefined;
  return {
    source: from,
    target: to,
    folded: from !== source || to !== target,
  };
}

// The lines to draw once folded frames stand in for what they hide, each
// with its new ends. Feeder arrows that end up joining the same two things
// draw once, the first of them standing for the rest, so a folded round
// sends one arrow to its meta however many feeders it holds.
export function foldLines<
  Line extends { source: string; target: string; auto?: boolean },
>(
  lines: readonly Line[],
  folded: ReadonlyMap<string, string>,
): (FoldedEnds & { line: Line })[] {
  const joined = new Set<string>();
  return lines.flatMap((line) => {
    const ends = foldEnds(line.source, line.target, folded);
    if (!ends) return [];
    if (line.auto && ends.folded) {
      const key = `${ends.source}\n${ends.target}`;
      if (joined.has(key)) return [];
      joined.add(key);
    }
    return [{ ...ends, line }];
  });
}

// The collapsed frames a node is inside, innermost first: the ones to peek
// into to see it.
export function collapsedAncestors(
  byId: ReadonlyMap<string, FoldNode>,
  nodeId: string,
): string[] {
  return [...new Set(ancestorsOf(byId, nodeId))].filter(
    (id) => id !== nodeId && byId.get(id)?.collapsed,
  );
}
