export interface ArrangeItem {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type AlignMode =
  | "left"
  | "centre"
  | "right"
  | "top"
  | "middle"
  | "bottom";
export type DistributeAxis = "horizontal" | "vertical";

export interface Shift {
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
      case "centre":
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
        break;
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
  const byStart = [...items].sort(
    (a, b) => start(a) - start(b) || a.id.localeCompare(b.id),
  );

  const first = byStart[0]!;
  const last = byStart[byStart.length - 1]!;
  const middle = byStart.filter((i) => i !== first && i !== last);

  const span = end(last) - start(first);
  const occupied = items.reduce((total, i) => total + size(i), 0);
  const gap = (span - occupied) / (items.length - 1);
  const ordered = [first, ...middle, last];
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
    ordered.forEach((item, i) => shift(item, start(first) + i * step));
    return shifts;
  }

  let cursor = start(first);
  ordered.forEach((item) => {
    shift(item, cursor);
    cursor += size(item) + gap;
  });
  return shifts;
}

export interface UnitNode {
  id: string;
  type: string;
  parent?: string;
  selected?: boolean;
  stroke?: string;
}

export interface UnitEdge {
  id: string;
  source: string;
  target: string;
  selected?: boolean;
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

  const ancestors = (id: string) => {
    const result: string[] = [];
    let parent = byId.get(id)?.parent;
    for (let depth = 0; parent && depth < 64; depth++) {
      result.push(parent);
      parent = byId.get(parent)?.parent;
    }
    return result;
  };
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
    const outer = [id, ...ancestors(id)].reverse().find((a) => unitOf.has(a));
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
    if (key) units.get(key)!.push(free);
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
  const ancestors = (id: string) => {
    const result: string[] = [];
    let parent = byId.get(id)?.parent;
    for (let depth = 0; parent && depth < 64; depth++) {
      result.push(parent);
      parent = byId.get(parent)?.parent;
    }
    return result;
  };
  const insideMoved = (id: string) => ancestors(id).some((a) => moved.has(a));
  const isMoving = (id: string) => moved.has(id) || insideMoved(id);
  const descendants = (id: string): string[] =>
    (children.get(id) ?? []).flatMap((c) => [c, ...descendants(c)]);

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
