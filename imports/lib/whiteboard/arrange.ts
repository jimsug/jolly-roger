import type { Point } from "./layout";
import { MAX_FRAME_DEPTH } from "./limits";

export interface ArrangeItem {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type AlignMode =
  | "left"
  | "center"
  | "right"
  | "top"
  | "middle"
  | "bottom";
export type DistributeAxis = "horizontal" | "vertical";

interface Shift {
  dx: number;
  dy: number;
}

// How far to move each item so they line up against the selection's edge or
// centre line.
export function alignItems(
  items: ArrangeItem[],
  mode: AlignMode,
): Map<string, Shift> {
  const shifts = new Map<string, Shift>();
  if (items.length < 2) return shifts;

  const left = Math.min(...items.map((i) => i.x));
  const right = Math.max(...items.map((i) => i.x + i.width));
  const top = Math.min(...items.map((i) => i.y));
  const bottom = Math.max(...items.map((i) => i.y + i.height));

  items.forEach((item) => {
    let dx = 0;
    let dy = 0;
    switch (mode) {
      case "left":
        dx = left - item.x;
        break;
      case "center":
        dx = (left + right) / 2 - (item.x + item.width / 2);
        break;
      case "right":
        dx = right - (item.x + item.width);
        break;
      case "top":
        dy = top - item.y;
        break;
      case "middle":
        dy = (top + bottom) / 2 - (item.y + item.height / 2);
        break;
      case "bottom":
        dy = bottom - (item.y + item.height);
        break;
      default:
        mode satisfies never;
    }
    shifts.set(item.id, { dx, dy });
  });
  return shifts;
}

// How far to move each item so the gaps between neighbours are equal. The
// first and last items (by where they start) stay where they are, and the
// order never changes: if the items are too big to fit, their starts are
// spaced evenly instead.
export function distributeItems(
  items: ArrangeItem[],
  axis: DistributeAxis,
): Map<string, Shift> {
  const shifts = new Map<string, Shift>();
  if (items.length < 3) return shifts;

  const start = (i: ArrangeItem) => (axis === "horizontal" ? i.x : i.y);
  const size = (i: ArrangeItem) => (axis === "horizontal" ? i.width : i.height);
  const end = (i: ArrangeItem) => start(i) + size(i);
  const byStart = items.toSorted(
    (a, b) => start(a) - start(b) || a.id.localeCompare(b.id),
  );

  const first = byStart[0]!;
  const last = byStart.at(-1)!;

  const span = end(last) - start(first);
  const occupied = items.reduce((total, i) => total + size(i), 0);
  const gap = (span - occupied) / (items.length - 1);
  const shift = (item: ArrangeItem, to: number) => {
    const delta = to - start(item);
    shifts.set(
      item.id,
      axis === "horizontal" ? { dx: delta, dy: 0 } : { dx: 0, dy: delta },
    );
  };

  if (gap < 0) {
    // They don't fit side by side, and equal gaps would shuffle them, so
    // space their starts evenly instead.
    const step = (start(last) - start(first)) / (items.length - 1);
    byStart.forEach((item, i) => shift(item, start(first) + i * step));
    return shifts;
  }

  let cursor = start(first);
  byStart.forEach((item) => {
    shift(item, cursor);
    cursor += size(item) + gap;
  });
  return shifts;
}

interface UnitNode {
  id: string;
  type: string;
  parent?: string;
  selected?: boolean;
  stroke?: string;
}

interface UnitEdge {
  id: string;
  source: string;
  target: string;
  selected?: boolean;
}

// The server can briefly hold a frame parent loop when frames are moved into
// each other at the same time, and React Flow follows parents without a
// bound (picking up anything inside one recurses forever). Whatever is in a
// loop is lifted to the top level until it's sorted out.
export function withoutParentLoops<T extends { id: string; parentId?: string }>(
  nodes: T[],
): T[] {
  const byId = new Map(nodes.map((n) => [n.id, { parent: n.parentId }]));
  const looped = new Set(
    nodes.filter((n) => inParentLoop(byId, n.id)).map((n) => n.id),
  );
  if (looped.size === 0) return nodes;
  return nodes.map((n) =>
    looped.has(n.id) ? { ...n, parentId: undefined } : n,
  );
}

// The frames a node is inside, innermost first, as far as byId knows them.
// Bounded, so a parent loop (which the server can briefly hold under
// concurrent reparenting) can't hang anything.
export function ancestorsOf(
  byId: ReadonlyMap<string, { parent?: string }>,
  id: string,
): string[] {
  const result: string[] = [];
  let parent = byId.get(id)?.parent;
  while (parent && byId.has(parent) && result.length < MAX_FRAME_DEPTH) {
    result.push(parent);
    parent = byId.get(parent)?.parent;
  }
  return result;
}

type ParentLookup = { get(id: string): { parent?: string } | undefined };

// Whether a node's frames lead back to it. Unbounded by depth, as a loop
// is found as soon as the chain repeats.
export function inParentLoop(byId: ParentLookup, id: string) {
  const seen = new Set<string>();
  for (
    let at = byId.get(id)?.parent;
    at && !seen.has(at);
    at = byId.get(at)?.parent
  ) {
    if (at === id) return true;
    seen.add(at);
  }
  return false;
}

// Whether a node's parent chain can't stand: it comes back to the node or
// to a frame already passed, or runs on past MAX_FRAME_DEPTH frames. A
// parent byId doesn't know ends the chain and counts for nothing.
export function parentChainBroken(byId: ParentLookup, id: string) {
  const seen = new Set<string>();
  let at = byId.get(id)?.parent;
  for (let depth = 0; at; depth++) {
    if (at === id || seen.has(at) || depth >= MAX_FRAME_DEPTH) return true;
    seen.add(at);
    at = byId.get(at)?.parent;
  }
  return false;
}

// Where a node is on the board rather than in its frame: its position plus
// those of the frames around it, up to MAX_FRAME_DEPTH of them.
export function absolutePosition(
  byId: ReadonlyMap<string, { parent?: string; position: Point }>,
  node: { parent?: string; position: Point },
): Point {
  let { x, y } = node.position;
  let parent = node.parent ? byId.get(node.parent) : undefined;
  for (let depth = 0; parent && depth < MAX_FRAME_DEPTH; depth++) {
    x += parent.position.x;
    y += parent.position.y;
    parent = parent.parent ? byId.get(parent.parent) : undefined;
  }
  return { x, y };
}

// Nodes in an order React Flow can take, which needs every parent before its
// children: shallowest first, otherwise as they were.
export function sortParentsFirst<T extends { id: string; parentId?: string }>(
  nodes: T[],
): T[] {
  const parents = new Map(nodes.map((n) => [n.id, { parent: n.parentId }]));
  return nodes
    .map((n, i) => ({ n, i, d: ancestorsOf(parents, n.id).length }))
    .toSorted((a, b) => a.d - b.d || a.i - b.i)
    .map(({ n }) => n);
}

// Splits a selection into the units that align and distribute as one, keyed
// by node id, "stroke:<id>" or "line:<edge id>", each listing the nodes to
// move:
// - anything inside a selected frame goes with the frame
// - every segment of an ink stroke goes together
// - a line with both ends free is a unit of its own
// - a line with one free end goes with the object it's attached to, so the
//   drawing keeps its shape; a line attached at both ends just follows
export function arrangeUnits(
  nodes: UnitNode[],
  edges: UnitEdge[],
): Map<string, string[]> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const isPoint = (id: string) => byId.get(id)?.type === "point";
  const selected = new Set(nodes.filter((n) => n.selected).map((n) => n.id));
  edges
    .filter((e) => e.selected)
    .forEach((e) => {
      [e.source, e.target].filter(isPoint).forEach((id) => selected.add(id));
    });

  const ancestors = (id: string) => ancestorsOf(byId, id);
  const hasSelectedAncestor = (id: string) =>
    ancestors(id).some((a) => selected.has(a));

  const units = new Map<string, string[]>();
  const unitOf = new Map<string, string>();
  nodes.forEach((n) => {
    if (!selected.has(n.id) || n.type === "point") return;
    if (hasSelectedAncestor(n.id)) return;
    const key = n.stroke ? `stroke:${n.stroke}` : n.id;
    units.set(key, [...(units.get(key) ?? []), n.id]);
    unitOf.set(n.id, key);
  });
  // The unit a node moves with: its own, or that of the outermost selected
  // frame around it.
  const unitFor = (id: string) => {
    const outer = [id, ...ancestors(id)]
      .toReversed()
      .find((a) => unitOf.has(a));
    return outer ? unitOf.get(outer) : undefined;
  };

  edges.forEach((e) => {
    const sourceFree = isPoint(e.source);
    const targetFree = isPoint(e.target);
    if (!sourceFree && !targetFree) return;
    if (sourceFree && targetFree) {
      const ends = [e.source, e.target];
      if (!ends.some((id) => selected.has(id))) return;
      if (ends.some(hasSelectedAncestor)) return;
      units.set(`line:${e.id}`, ends);
      return;
    }
    const free = sourceFree ? e.source : e.target;
    const anchored = sourceFree ? e.target : e.source;
    if (hasSelectedAncestor(free)) return;
    const key = unitFor(anchored);
    if (key) units.get(key)?.push(free);
  });

  return units;
}

// Nodes that should move along with nodes someone is moving directly, by the
// same amount, mapped to the moved node each follows: the other segments of
// an ink stroke, and the free ends of lines attached to a moved node or to
// anything inside it. Anything already moving, directly or because it's
// inside something that is, is left to React Flow.
export function companionsOf(
  nodes: UnitNode[],
  edges: UnitEdge[],
  moved: Set<string>,
): Map<string, string> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const children = new Map<string, string[]>();
  nodes.forEach((n) => {
    if (n.parent)
      children.set(n.parent, [...(children.get(n.parent) ?? []), n.id]);
  });
  const insideMoved = (id: string) =>
    ancestorsOf(byId, id).some((a) => moved.has(a));
  const isMoving = (id: string) => moved.has(id) || insideMoved(id);
  // Never reaches a parent loop: a node in one counts as inside itself, so
  // it's never a leader, and nothing outside a loop has a child in it.
  const descendants = (id: string): string[] =>
    (children.get(id) ?? []).flatMap((c) => [c].concat(descendants(c)));

  const result = new Map<string, string>();
  const follow = (id: string, leader: string) => {
    if (!isMoving(id) && !result.has(id)) result.set(id, leader);
  };
  moved.forEach((leader) => {
    if (insideMoved(leader)) return;
    const node = byId.get(leader);
    if (node?.stroke) {
      nodes
        .filter((n) => n.stroke === node.stroke && n.id !== leader)
        .forEach((n) => follow(n.id, leader));
    }
    [leader, ...descendants(leader)].forEach((id) => {
      if (byId.get(id)?.type === "point") return;
      edges.forEach((e) => {
        if (e.source !== id && e.target !== id) return;
        const other = e.source === id ? e.target : e.source;
        if (byId.get(other)?.type === "point") follow(other, leader);
      });
    });
  });
  return result;
}
