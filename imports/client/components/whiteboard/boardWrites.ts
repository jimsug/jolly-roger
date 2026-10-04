import type { Meteor } from "meteor/meteor";
import type { WhiteboardEdgeType } from "../../../lib/models/WhiteboardEdges";
import { LINE_STYLE_FIELDS } from "../../../lib/models/WhiteboardEdges";
import type { WhiteboardNodeType } from "../../../lib/models/WhiteboardNodes";
import type { WhiteboardEdgeInput } from "../../../methods/upsertWhiteboardEdges";
import type { WhiteboardNodeInput } from "../../../methods/upsertWhiteboardNodes";

// One edit to a board as the methods it takes, sent in this order: nodes
// first (so lines can refer to them), then lines, then deletions, then
// placing cards by their tags.
export interface BoardWrite {
  upsertNodes?: WhiteboardNodeInput[];
  upsertEdges?: WhiteboardEdgeInput[];
  deleteEdges?: string[];
  deleteNodes?: string[];
  placeByTags?: string[];
}

// The board's documents as they are before a write.
export interface BoardDocs {
  node(id: string): WhiteboardNodeType | undefined;
  edge(id: string): WhiteboardEdgeType | undefined;
  children(frameIds: string[]): WhiteboardNodeType[];
  strokeSegments(strokes: string[]): WhiteboardNodeType[];
  edgesTouching(nodeIds: string[]): WhiteboardEdgeType[];
}

export function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

export type Done = (error?: Meteor.Error) => void;

// Makes method calls together, and hears once they're all back, with the
// first refusal if there was one.
export function callAll(calls: ((done: Done) => void)[], onDone: Done) {
  let outstanding = calls.length;
  if (outstanding === 0) {
    onDone();
    return;
  }
  let refused: Meteor.Error | undefined;
  calls.forEach((call) =>
    call((error) => {
      refused ??= error;
      outstanding -= 1;
      if (outstanding === 0) onDone(refused);
    }),
  );
}

const nodeKey = (id: string) => `node:${id}`;
const edgeKey = (id: string) => `edge:${id}`;

// The document a stamp key names.
export function parseKey(key: string): { kind: "node" | "edge"; id: string } {
  return {
    kind: key.startsWith("edge:") ? "edge" : "node",
    id: key.slice(key.indexOf(":") + 1),
  };
}

// Cards and seeded frames are only ever hidden; everything else people made
// is deleted outright (see deleteNodes on the server).
const isKept = (doc: WhiteboardNodeType) =>
  doc.type === "puzzle" ||
  (doc.type === "frame" &&
    (doc.tag !== undefined || doc.frameKind === "ungrouped"));

// Unset line styles draw as these.
const LINE_STYLE_UNSET = {
  pathStyle: "curved",
  arrowHead: "end",
  dashed: false,
  color: null,
} as const;

// The fields that put a deleted node back as it was, under the same id.
function reinsertNode(doc: WhiteboardNodeType): WhiteboardNodeInput {
  const input: WhiteboardNodeInput = {
    _id: doc._id,
    type: doc.type,
    position: doc.position,
    parent: doc.parent ?? null,
  };
  if (doc.width !== undefined) input.width = doc.width;
  if (doc.height !== undefined) input.height = doc.height;
  if (doc.text !== undefined) input.text = doc.text;
  if (doc.label !== undefined) input.label = doc.label;
  if (doc.color !== undefined) input.color = doc.color;
  if (doc.points !== undefined) input.points = doc.points;
  if (doc.strokeWidth !== undefined) input.strokeWidth = doc.strokeWidth;
  if (doc.stroke !== undefined) input.stroke = doc.stroke;
  if (doc.type === "frame" && doc.collapsed) input.collapsed = true;
  return input;
}

function reinsertEdge(doc: WhiteboardEdgeType): WhiteboardEdgeInput {
  const input: WhiteboardEdgeInput = {
    _id: doc._id,
    source: doc.source,
    target: doc.target,
  };
  if (doc.label !== undefined) input.label = doc.label;
  LINE_STYLE_FIELDS.forEach((field) => {
    if (doc[field] !== undefined) Object.assign(input, { [field]: doc[field] });
  });
  return input;
}

// Collects an inverse, merging what's put back for each document.
class InverseBuilder {
  nodes = new Map<string, WhiteboardNodeInput>();

  edges = new Map<string, WhiteboardEdgeInput>();

  edgeDeletes = new Set<string>();

  nodeDeletes = new Set<string>();

  // For each node, the lines in the write that leave it (deleted, or with
  // that end moved elsewhere).
  leaving = new Map<string, Set<string>>();

  setNode(input: WhiteboardNodeInput) {
    this.nodes.set(input._id, { ...this.nodes.get(input._id), ...input });
  }

  setEdge(input: WhiteboardEdgeInput) {
    this.edges.set(input._id, { ...this.edges.get(input._id), ...input });
  }

  lineLeaves(line: string, ends: string[]) {
    ends.forEach((end) => {
      const lines = this.leaving.get(end) ?? new Set<string>();
      lines.add(line);
      this.leaving.set(end, lines);
    });
  }

  // A line's free end goes once nothing uses it. Puts back each one that
  // only lines leaving it in this write used, whichever way they left.
  restoreOrphanedPoints(docs: BoardDocs) {
    this.leaving.forEach((lines, id) => {
      const point = docs.node(id);
      if (point?.type !== "point" || this.nodes.has(id)) return;
      const stillUsed = docs.edgesTouching([id]).some((e) => !lines.has(e._id));
      if (!stillUsed) this.setNode(reinsertNode(point));
    });
  }

  build(): BoardWrite {
    const write: BoardWrite = {};
    if (this.nodes.size > 0) {
      write.upsertNodes = parentsFirst([...this.nodes.values()]);
    }
    if (this.edges.size > 0) write.upsertEdges = [...this.edges.values()];
    if (this.edgeDeletes.size > 0) write.deleteEdges = [...this.edgeDeletes];
    if (this.nodeDeletes.size > 0) write.deleteNodes = [...this.nodeDeletes];
    return write;
  }
}

// Orders node writes so a frame being put back comes before anything that
// goes into it.
export function parentsFirst(
  inputs: WhiteboardNodeInput[],
): WhiteboardNodeInput[] {
  const pending = new Map(inputs.map((input) => [input._id, input]));
  const ordered: WhiteboardNodeInput[] = [];
  while (pending.size > 0) {
    const ready = [...pending.values()].filter(
      (input) => typeof input.parent !== "string" || !pending.has(input.parent),
    );
    // A loop can't be ordered; the server refuses it either way.
    const next = ready.length > 0 ? ready : [...pending.values()];
    next.forEach((input) => {
      ordered.push(input);
      pending.delete(input._id);
    });
  }
  return ordered;
}

function invertNodeUpserts(
  builder: InverseBuilder,
  docs: BoardDocs,
  inputs: WhiteboardNodeInput[],
) {
  inputs.forEach((input) => {
    const old = docs.node(input._id);
    if (!old) {
      builder.nodeDeletes.add(input._id);
      return;
    }
    // Put back on the board, so taken off it again.
    if (input.hidden === false && old.hidden) {
      builder.nodeDeletes.add(input._id);
      return;
    }
    const back: WhiteboardNodeInput = { _id: input._id };
    if (input.position) back.position = old.position;
    if (input.parent !== undefined) back.parent = old.parent ?? null;
    if (input.width !== undefined && old.width !== undefined) {
      back.width = old.width;
    }
    if (input.height !== undefined && old.height !== undefined) {
      back.height = old.height;
    }
    if (input.collapsed !== undefined) back.collapsed = !!old.collapsed;
    if (input.locked !== undefined) back.locked = !!old.locked;
    if (input.text !== undefined) back.text = old.text ?? null;
    if (input.label !== undefined) back.label = old.label ?? null;
    if (input.color !== undefined) back.color = old.color ?? null;
    if (Object.keys(back).length > 1) builder.setNode(back);
  });
}

function invertNodeDeletes(
  builder: InverseBuilder,
  docs: BoardDocs,
  ids: string[],
) {
  const targets = ids.flatMap((id) => docs.node(id) ?? []);
  // Deleting one segment of an ink stroke deletes it all.
  const strokes = targets.flatMap((doc) => doc.stroke ?? []);
  const all = new Map(
    [
      ...targets,
      ...(strokes.length > 0 ? docs.strokeSegments(strokes) : []),
    ].map((doc) => [doc._id, doc]),
  );
  const removed = new Set(
    [...all.values()].filter((doc) => !isKept(doc)).map((doc) => doc._id),
  );

  all.forEach((doc) => {
    if (removed.has(doc._id)) {
      builder.setNode(reinsertNode(doc));
    } else if (!doc.hidden) {
      builder.setNode({
        _id: doc._id,
        hidden: false,
        ...(doc.type === "frame" && doc.collapsed ? { collapsed: true } : {}),
      });
    }
  });

  // What was in a deleted frame moves out of it, keeping its place on the
  // board, so it goes back in where it was.
  const frames = [...all.values()]
    .filter((doc) => doc.type === "frame")
    .map((doc) => doc._id);
  if (frames.length > 0) {
    docs.children(frames).forEach((child) => {
      if (removed.has(child._id)) return;
      builder.setNode({
        _id: child._id,
        parent: child.parent ?? null,
        position: child.position,
      });
    });
  }

  // Lines go with what they joined, and free ends with the lines.
  if (removed.size > 0) {
    docs.edgesTouching([...removed]).forEach((line) => {
      builder.setEdge(reinsertEdge(line));
      builder.lineLeaves(line._id, [line.source, line.target]);
    });
  }
}

function invertEdgeUpserts(
  builder: InverseBuilder,
  docs: BoardDocs,
  inputs: WhiteboardEdgeInput[],
) {
  inputs.forEach((input) => {
    const old = docs.edge(input._id);
    if (!old) {
      builder.edgeDeletes.add(input._id);
      return;
    }
    // A feeder arrow put back, so taken away again.
    if (input.hidden === false && old.hidden) {
      builder.edgeDeletes.add(input._id);
      return;
    }
    const back: WhiteboardEdgeInput = { _id: input._id };
    const leftEnds: string[] = [];
    if (input.source && input.source !== old.source) {
      back.source = old.source;
      leftEnds.push(old.source);
    }
    if (input.target && input.target !== old.target) {
      back.target = old.target;
      leftEnds.push(old.target);
    }
    LINE_STYLE_FIELDS.forEach((field) => {
      if (input[field] === undefined) return;
      Object.assign(back, { [field]: old[field] ?? LINE_STYLE_UNSET[field] });
    });
    if (input.label !== undefined) back.label = old.label ?? null;
    if (Object.keys(back).length > 1) builder.setEdge(back);
    builder.lineLeaves(old._id, leftEnds);
  });
}

function invertEdgeDeletes(
  builder: InverseBuilder,
  docs: BoardDocs,
  ids: string[],
) {
  ids.forEach((id) => {
    const old = docs.edge(id);
    if (!old) return;
    // Deleting a feeder arrow only hides it.
    if (old.auto) {
      if (!old.hidden) builder.setEdge({ _id: id, hidden: false });
      return;
    }
    builder.setEdge(reinsertEdge(old));
    builder.lineLeaves(id, [old.source, old.target]);
  });
}

// The write that puts back what write changes, worked out from the board as
// it is before write is sent.
export function inverseOf(write: BoardWrite, docs: BoardDocs): BoardWrite {
  const builder = new InverseBuilder();
  if (write.upsertNodes) invertNodeUpserts(builder, docs, write.upsertNodes);
  if (write.upsertEdges) invertEdgeUpserts(builder, docs, write.upsertEdges);
  if (write.deleteEdges) invertEdgeDeletes(builder, docs, write.deleteEdges);
  if (write.deleteNodes) invertNodeDeletes(builder, docs, write.deleteNodes);
  // Placing cards by their tags moves them, and nothing else that's undone.
  write.placeByTags?.forEach((id) => {
    const old = docs.node(id);
    if (old) {
      builder.setNode({
        _id: id,
        position: old.position,
        parent: old.parent ?? null,
      });
    }
  });
  builder.restoreOrphanedPoints(docs);
  return builder.build();
}

// Every document a write or its inverse touches, as stamp keys.
export function touchedKeys(...writes: BoardWrite[]): string[] {
  const keys = new Set<string>();
  writes.forEach((write) => {
    write.upsertNodes?.forEach((n) => keys.add(nodeKey(n._id)));
    write.deleteNodes?.forEach((id) => keys.add(nodeKey(id)));
    write.placeByTags?.forEach((id) => keys.add(nodeKey(id)));
    write.upsertEdges?.forEach((e) => keys.add(edgeKey(e._id)));
    write.deleteEdges?.forEach((id) => keys.add(edgeKey(id)));
  });
  return [...keys];
}

// The documents a write needs to find on the board without writing them
// itself: the frames it puts nodes in and the nodes its lines join.
export function dependedOnKeys(...writes: BoardWrite[]): string[] {
  const keys = new Set<string>();
  writes.forEach((write) => {
    write.upsertNodes?.forEach((n) => {
      if (typeof n.parent === "string") keys.add(nodeKey(n.parent));
    });
    write.upsertEdges?.forEach((e) => {
      if (e.source) keys.add(nodeKey(e.source));
      if (e.target) keys.add(nodeKey(e.target));
    });
  });
  const touched = new Set(touchedKeys(...writes));
  return [...keys].filter((key) => !touched.has(key));
}
