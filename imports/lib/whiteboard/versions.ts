import { EJSON } from "meteor/ejson";
import type { WhiteboardEdgeType } from "../models/WhiteboardEdges";
import type { WhiteboardNodeType } from "../models/WhiteboardNodes";
import type { WhiteboardVersionKind } from "../models/WhiteboardVersions";
import { ancestorsOf } from "./arrange";
import {
  MAX_EDGES_PER_BOARD,
  MAX_FRAME_DEPTH,
  MAX_NODES_PER_BOARD,
  MAX_VERSION_BYTES_PER_BOARD,
  VERSION_IDLE_MS,
  VERSION_INTERVAL_MS,
  VERSION_JOIN_MS,
  VERSION_KEEP_AFTER_HUNT,
  VERSION_KEEP_ALL_MS,
} from "./limits";

const HOUR_MS = 60 * 60 * 1000;

// Resets and restores, which pruning keeps.
const isRewrite = (v: { kind: WhiteboardVersionKind }) => v.kind !== "edits";

export interface VersionSummary {
  _id: string;
  kind: WhiteboardVersionKind;
  users: { user: string; at: Date }[];
  createdAt: Date;
  hash?: string;
}

// What an edit does to the board's history:
// - extend: a version the user's window is still open on takes the edit
// - join: the newest version is under a minute old and takes the user on
// - serialize: the board has to be hashed before anything can be decided
// - unchanged: the board is as the newest version has it, which takes the
//   user on rather than storing the same board again
// - new: a new version is written
// listed says whether the user is already on the version.
export type VersionDecision =
  | { action: "extend"; version: string }
  | { action: "join" | "unchanged"; version: string; listed: boolean }
  | { action: "serialize" }
  | { action: "new" };

// Applies the coalescing rule (see docs/whiteboard.md) for an edit of kind by
// user at now. versions must start with the board's newest version and
// include its newest "edits" version and any version with an entry for user,
// newest first. hash is the board's as it is now, once it has been worked
// out.
export function versionDecision({
  kind,
  user,
  now,
  lastRewrittenAt,
  versions,
  hash,
}: {
  kind: WhiteboardVersionKind;
  user: string;
  now: Date;
  lastRewrittenAt: Date | undefined;
  versions: VersionSummary[];
  hash?: string;
}): VersionDecision {
  // A reset or restore always records the board it's about to change.
  if (kind !== "edits") return { action: "new" };

  // Only ordinary edits since the last reset or restore count, so the first
  // edit after one always records the board it left.
  const matching = versions.filter(
    (v) =>
      v.kind === "edits" &&
      (!lastRewrittenAt || v.createdAt.getTime() > lastRewrittenAt.getTime()),
  );
  const t = now.getTime();
  const listed = (v: VersionSummary) => v.users.some((u) => u.user === user);

  const open = matching.find((v) =>
    v.users.some(
      (u) => u.user === user && u.at.getTime() > t - VERSION_INTERVAL_MS,
    ),
  );
  if (open) return { action: "extend", version: open._id };

  const newest = versions[0];
  if (
    newest &&
    matching.includes(newest) &&
    newest.createdAt.getTime() > t - VERSION_JOIN_MS
  ) {
    return { action: "join", version: newest._id, listed: listed(newest) };
  }

  if (hash === undefined) return { action: "serialize" };
  const newestMatching = matching[0];
  if (newestMatching?.hash === hash) {
    return {
      action: "unchanged",
      version: newestMatching._id,
      listed: listed(newestMatching),
    };
  }
  return { action: "new" };
}

export interface PrunableVersion {
  _id: string;
  kind: WhiteboardVersionKind;
  createdAt: Date;
  size: number;
}

// Which of a board's versions to drop. Everything from the last two hours is
// kept; before that, the first version in each UTC hour. Once the hunt is
// archived, or the board has had no new version for VERSION_IDLE_MS, only the
// newest VERSION_KEEP_AFTER_HUNT are kept. Resets and restores are always
// kept. Then, newest first, everything past MAX_VERSION_BYTES_PER_BOARD goes,
// apart from the newest version and resets and restores from the last two
// hours.
export function versionsToPrune(
  versions: PrunableVersion[],
  now: Date,
  { archived }: { archived: boolean },
): string[] {
  const sorted = versions.toSorted(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
  const newest = sorted[0];
  if (!newest) return [];
  const t = now.getTime();
  const recent = (v: PrunableVersion) =>
    t - v.createdAt.getTime() < VERSION_KEEP_ALL_MS;

  const keep = new Set<string>();
  const finished =
    archived || t - newest.createdAt.getTime() >= VERSION_IDLE_MS;
  if (finished) {
    sorted.forEach((v, i) => {
      if (i < VERSION_KEEP_AFTER_HUNT || isRewrite(v)) keep.add(v._id);
    });
  } else {
    const firstInHour = new Map<number, PrunableVersion>();
    sorted.forEach((v) => {
      if (recent(v) || isRewrite(v)) keep.add(v._id);
      if (recent(v)) return;
      const hour = Math.floor(v.createdAt.getTime() / HOUR_MS);
      const first = firstInHour.get(hour);
      if (!first || v.createdAt.getTime() < first.createdAt.getTime()) {
        firstInHour.set(hour, v);
      }
    });
    firstInHour.forEach((v) => keep.add(v._id));
  }

  let total = 0;
  let full = false;
  sorted.forEach((v) => {
    if (!keep.has(v._id)) return;
    const protectedVersion = v === newest || (isRewrite(v) && recent(v));
    if (
      !protectedVersion &&
      (full || total + v.size > MAX_VERSION_BYTES_PER_BOARD)
    ) {
      full = true;
      keep.delete(v._id);
      return;
    }
    total += v.size;
  });

  return sorted.filter((v) => !keep.has(v._id)).map((v) => v._id);
}

// A field-level change to one document.
export interface RestoreChange {
  _id: string;
  $set: Record<string, unknown>;
  $unset: Record<string, "">;
}

export interface RestorePlan {
  nodes: {
    remove: string[];
    change: RestoreChange[];
    // Parents before their children
    insert: WhiteboardNodeType[];
  };
  edges: {
    remove: string[];
    change: RestoreChange[];
    insert: WhiteboardEdgeType[];
  };
  // Live nodes whose comments come off before anything is written: those
  // that leave the board, and those the version hides.
  detach: string[];
  // Nodes the restore brings back or unhides, with every id a pin could have
  // come off them under.
  reattach: { node: string; from: string[] }[];
}

export type RestoreResult =
  | { ok: true; plan: RestorePlan }
  | { ok: false; reason: "tooBig" };

// What a document is, whatever its id: a card is its puzzle, a seeded frame
// its tag, the Ungrouped frame its kind, a feeder arrow its feeder and meta.
// Everything else is its id.
const nodeKey = (n: WhiteboardNodeType) => {
  if (n.type === "puzzle" && n.puzzle) return `puzzle:${n.puzzle}`;
  if (n.type === "frame" && n.tag) return `tag:${n.tag}`;
  if (n.type === "frame" && n.frameKind === "ungrouped") return "ungrouped";
  return `id:${n._id}`;
};
const edgeKey = (e: WhiteboardEdgeType) =>
  e.auto && e.feeder && e.meta ? `feeder:${e.feeder}:${e.meta}` : `id:${e._id}`;

// Fields a restore doesn't change on a document it keeps.
const KEPT_FIELDS = new Set([
  "_id",
  "createdAt",
  "createdBy",
  "updatedAt",
  "updatedBy",
]);

function changeBetween(
  live: Record<string, unknown> & { _id: string },
  wanted: Record<string, unknown>,
): RestoreChange | undefined {
  const $set: Record<string, unknown> = {};
  const $unset: Record<string, ""> = {};
  Object.entries(wanted).forEach(([key, value]) => {
    if (KEPT_FIELDS.has(key) || value === undefined) return;
    if (!EJSON.equals(live[key] as never, value as never)) $set[key] = value;
  });
  Object.entries(live).forEach(([key, value]) => {
    if (KEPT_FIELDS.has(key) || value === undefined) return;
    if (wanted[key] === undefined) $unset[key] = "";
  });
  if (Object.keys($set).length === 0 && Object.keys($unset).length === 0) {
    return undefined;
  }
  return { _id: live._id, $set, $unset };
}

// Ink is split into segments and points are a line's loose end, so neither
// carries comments.
const takesComments = (n: WhiteboardNodeType) =>
  n.type !== "ink" && n.type !== "point";

// How to turn the live board (current) into the one a version holds
// (target). Documents are matched by what they are rather than by id, and a
// target document that matches a live one takes the live one's id, with the
// target's references remapped to it, so nothing is inserted twice. Parents
// that are missing or would make a loop are dropped (the node goes to the top
// level), as are lines with a missing end and free ends no line uses. Cards
// for puzzles the version doesn't have stay, moved to the top level and no
// longer manual, so placement can put them back in their rounds.
export function planRestore(
  current: { nodes: WhiteboardNodeType[]; edges: WhiteboardEdgeType[] },
  target: { nodes: WhiteboardNodeType[]; edges: WhiteboardEdgeType[] },
): RestoreResult {
  const liveNodes = new Map(current.nodes.map((n) => [n._id, n]));
  const liveNodeByKey = new Map<string, WhiteboardNodeType>();
  current.nodes.forEach((n) => {
    const key = nodeKey(n);
    if (!liveNodeByKey.has(key)) liveNodeByKey.set(key, n);
  });

  // Each target node's id from here on, and the live node it becomes
  const nodeIds = new Map<string, string>();
  const matchedNodes = new Set<string>();
  target.nodes.forEach((n) => {
    let live = liveNodeByKey.get(nodeKey(n));
    if (!live || matchedNodes.has(live._id)) live = liveNodes.get(n._id);
    if (live && matchedNodes.has(live._id)) live = undefined;
    if (live) matchedNodes.add(live._id);
    nodeIds.set(n._id, live?._id ?? n._id);
  });

  const wanted = new Map<string, WhiteboardNodeType>();
  target.nodes.forEach((n) => {
    const _id = nodeIds.get(n._id)!;
    if (wanted.has(_id)) return;
    const parent = n.parent ? nodeIds.get(n.parent) : undefined;
    wanted.set(_id, { ...n, _id, parent });
  });

  // Parents must be frames in the version, and not make a loop
  wanted.forEach((n) => {
    const parent = n.parent ? wanted.get(n.parent) : undefined;
    if (n.parent && parent?.type !== "frame") {
      wanted.set(n._id, { ...n, parent: undefined });
    }
  });
  [...wanted.keys()].forEach((id) => {
    const seen = new Set<string>();
    let at = wanted.get(id)?.parent;
    for (let depth = 0; at; depth++) {
      if (at === id || seen.has(at) || depth >= MAX_FRAME_DEPTH) {
        const node = wanted.get(id)!;
        wanted.set(id, { ...node, parent: undefined });
        return;
      }
      seen.add(at);
      at = wanted.get(at)?.parent;
    }
  });

  // Lines, matched the same way, with both ends in the version
  const liveEdges = new Map(current.edges.map((e) => [e._id, e]));
  const liveEdgeByKey = new Map<string, WhiteboardEdgeType>();
  current.edges.forEach((e) => {
    const key = edgeKey(e);
    if (!liveEdgeByKey.has(key)) liveEdgeByKey.set(key, e);
  });
  const matchedEdges = new Set<string>();
  const wantedEdges = new Map<string, WhiteboardEdgeType>();
  target.edges.forEach((e) => {
    const source = nodeIds.get(e.source);
    const targetId = nodeIds.get(e.target);
    if (
      !source ||
      !targetId ||
      source === targetId ||
      !wanted.has(source) ||
      !wanted.has(targetId)
    ) {
      return;
    }
    let live = liveEdgeByKey.get(edgeKey(e));
    if (!live || matchedEdges.has(live._id)) live = liveEdges.get(e._id);
    if (live && matchedEdges.has(live._id)) live = undefined;
    const _id = live?._id ?? e._id;
    if (wantedEdges.has(_id)) return;
    if (live) matchedEdges.add(live._id);
    wantedEdges.set(_id, { ...e, _id, source, target: targetId });
  });

  // Free ends only exist for their lines
  const usedEnds = new Set(
    [...wantedEdges.values()].flatMap((e) => [e.source, e.target]),
  );
  [...wanted.values()].forEach((n) => {
    if (n.type === "point" && !usedEnds.has(n._id)) wanted.delete(n._id);
  });

  // Cards for puzzles the version doesn't have
  const keptCards = current.nodes.filter(
    (n) => n.type === "puzzle" && !wanted.has(n._id),
  );

  if (
    wanted.size + keptCards.length > MAX_NODES_PER_BOARD ||
    wantedEdges.size > MAX_EDGES_PER_BOARD
  ) {
    return { ok: false, reason: "tooBig" };
  }

  const plan: RestorePlan = {
    nodes: { remove: [], change: [], insert: [] },
    edges: { remove: [], change: [], insert: [] },
    detach: [],
    reattach: [],
  };

  const parentsOf = new Map(
    [...wanted.values()].map((n) => [n._id, { parent: n.parent }]),
  );
  const inserts: WhiteboardNodeType[] = [];
  wanted.forEach((n) => {
    const live = liveNodes.get(n._id);
    if (!live) {
      inserts.push(n);
    } else {
      const change = changeBetween(live, n);
      if (change) plan.nodes.change.push(change);
      if (takesComments(n) && !live.hidden && n.hidden) {
        plan.detach.push(n._id);
      }
    }
    if (takesComments(n) && !n.hidden && (!live || live.hidden)) {
      const from = [
        ...new Set([
          n._id,
          ...target.nodes
            .filter((t) => nodeIds.get(t._id) === n._id)
            .map((t) => t._id),
        ]),
      ];
      plan.reattach.push({ node: n._id, from });
    }
  });
  plan.nodes.insert = inserts
    .map((n, i) => ({ n, i, depth: ancestorsOf(parentsOf, n._id).length }))
    .toSorted((a, b) => a.depth - b.depth || a.i - b.i)
    .map(({ n }) => n);

  // Where a live node is on the board, rather than in its frame
  const absolute = (node: WhiteboardNodeType) => {
    let { x, y } = node.position;
    let parent = node.parent ? liveNodes.get(node.parent) : undefined;
    for (let depth = 0; parent && depth < MAX_FRAME_DEPTH; depth++) {
      x += parent.position.x;
      y += parent.position.y;
      parent = parent.parent ? liveNodes.get(parent.parent) : undefined;
    }
    return { x, y };
  };
  keptCards.forEach((card) => {
    if (!card.parent && !card.manual) return;
    plan.nodes.change.push({
      _id: card._id,
      $set: { position: absolute(card) },
      $unset: { parent: "", manual: "" },
    });
  });

  current.nodes.forEach((n) => {
    if (wanted.has(n._id) || n.type === "puzzle") return;
    plan.nodes.remove.push(n._id);
    if (takesComments(n) && !n.hidden) plan.detach.push(n._id);
  });

  wantedEdges.forEach((e) => {
    const live = liveEdges.get(e._id);
    if (!live) {
      plan.edges.insert.push(e);
      return;
    }
    const change = changeBetween(live, e);
    if (change) plan.edges.change.push(change);
  });
  current.edges.forEach((e) => {
    if (!wantedEdges.has(e._id)) plan.edges.remove.push(e._id);
  });

  return { ok: true, plan };
}
