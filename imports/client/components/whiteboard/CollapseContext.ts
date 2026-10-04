import { createContext } from "react";

// What a collapsed frame hides, for its header and far-zoom label: the
// puzzles on cards inside it at any depth, how many of them are solved and
// unsolved (puzzles with nothing to solve count neither way), how many
// things it hides, and its open comment threads.
export interface FoldSummary {
  puzzles: string[];
  solved: number;
  unsolved: number;
  items: number;
  comments: number;
}

// Folding, for frames. Built by the canvas, outside node data, since a
// node that hasn't changed is reused without comparing its data and the
// counts change without the frame changing.
export interface CollapseActions {
  // Collapsed frames as they're drawn folded, by id.
  summaries: ReadonlyMap<string, FoldSummary>;
  // Frames this viewer has opened for themselves.
  peeked: ReadonlySet<string>;
  peek: (frameId: string) => void;
  unpeek: (frameId: string) => void;
  // Collapses or expands a frame for everyone. Needs edit access.
  setCollapsed: (frameId: string, collapsed: boolean) => void;
}

// Outside a canvas nothing is collapsed and there's nothing to do.
const CollapseContext = createContext<CollapseActions>({
  summaries: new Map(),
  peeked: new Set(),
  peek: () => undefined,
  unpeek: () => undefined,
  setCollapsed: () => undefined,
});

export default CollapseContext;
