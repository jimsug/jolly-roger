import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { gunzip, gzip } from "node:zlib";
import { EJSON } from "meteor/ejson";
import { Meteor } from "meteor/meteor";
import { Random } from "meteor/random";
import Flags from "../Flags";
import Logger from "../Logger";
import Hunts from "../lib/models/Hunts";
import MergeOperations from "../lib/models/MergeOperations";
import Puzzles from "../lib/models/Puzzles";
import type { WhiteboardEdgeType } from "../lib/models/WhiteboardEdges";
import WhiteboardEdges from "../lib/models/WhiteboardEdges";
import type { WhiteboardNodeType } from "../lib/models/WhiteboardNodes";
import WhiteboardNodes from "../lib/models/WhiteboardNodes";
import type { WhiteboardType } from "../lib/models/Whiteboards";
import Whiteboards from "../lib/models/Whiteboards";
import type {
  WhiteboardVersionKind,
  WhiteboardVersionType,
} from "../lib/models/WhiteboardVersions";
import WhiteboardVersions from "../lib/models/WhiteboardVersions";
import { userMayWritePuzzlesForHunt } from "../lib/permission_stubs";
import {
  MAX_BATCH,
  MAX_VERSION_BYTES_PER_BOARD,
  VERSION_CHUNK_BYTES,
  VERSION_INTERVAL_MS,
} from "../lib/whiteboard/limits";
import type {
  PrunableVersion,
  RestoreChange,
  RestorePlan,
  VersionSummary,
} from "../lib/whiteboard/versions";
import {
  planItemRestore,
  planRestore,
  restoreItemSet,
  versionDecision,
  versionsToPrune,
} from "../lib/whiteboard/versions";
import WhiteboardVersionChunks from "./models/WhiteboardVersionChunks";
import { deferSyncPuzzlesOnBoard } from "./whiteboard";
import {
  assertMayEditBoard,
  detachComments,
  LOCKED_FIELDS,
  loadBoardAccess,
  lockedError,
  reattachComments,
} from "./whiteboardShared";
import withLock, { LockPreemptedError } from "./withLock";

// A version's payload is gzip(EJSON.stringify({ format, nodes, edges })),
// with every node and line on the board as stored, hidden ones included.
const VERSION_FORMAT = 1;

// How many writes a restore makes between renewals of the board's lock.
export const WRITES_PER_RENEWAL = 200;

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

const historyOff = () => new Meteor.Error(403, "Board history is turned off");
const unknownVersion = () => new Meteor.Error(404, "Unknown version");
const unrestorable = () =>
  new Meteor.Error(
    409,
    "This version is from an older layout and can't be restored",
  );

// Runs a rewrite of the board (a restore or a reset) under the board's lock.
// Losing the lock part-way, to another server that thought this one had
// died, stops the rewrite at its next renewal and refuses with a reason
// people can act on.
export async function withBoardLock<T>(
  boardId: string,
  critSection: (renew: () => Promise<void>) => Promise<T>,
) {
  try {
    return await withLock(`whiteboard:${boardId}`, critSection);
  } catch (error) {
    if (error instanceof LockPreemptedError) {
      throw new Meteor.Error(409, "The board was busy; try again");
    }
    throw error;
  }
}

async function assertHistoryEnabled() {
  if (await Flags.activeAsync("disable.whiteboard_versions")) {
    throw historyOff();
  }
}

const byId = (a: { _id: string }, b: { _id: string }) =>
  a._id < b._id ? -1 : a._id > b._id ? 1 : 0;

// The board as a version stores it, and its hash. Documents are sorted and
// keys written in a fixed order, so an unchanged board hashes the same.
export function serializeBoard(
  nodes: WhiteboardNodeType[],
  edges: WhiteboardEdgeType[],
) {
  const json = EJSON.stringify(
    {
      format: VERSION_FORMAT,
      nodes: nodes.toSorted(byId),
      edges: edges.toSorted(byId),
    },
    { canonical: true },
  );
  return { json, hash: createHash("sha256").update(json).digest("hex") };
}

// Compresses a serialised board into chunks of at most chunkBytes.
export async function compressVersion(
  json: string,
  chunkBytes = VERSION_CHUNK_BYTES,
): Promise<Uint8Array<ArrayBuffer>[]> {
  const zipped = await gzipAsync(json);
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  for (let start = 0; start < zipped.length; start += chunkBytes) {
    chunks.push(new Uint8Array(zipped.subarray(start, start + chunkBytes)));
  }
  return chunks;
}

// The nodes and lines a version's chunks hold, checked against today's
// schemas. Anything that doesn't fit refuses the restore.
export async function decodeVersion(
  chunks: Uint8Array[],
): Promise<{ nodes: WhiteboardNodeType[]; edges: WhiteboardEdgeType[] }> {
  try {
    const json = (await gunzipAsync(Buffer.concat(chunks))).toString("utf8");
    const payload = EJSON.parse(json) as {
      format?: unknown;
      nodes?: unknown;
      edges?: unknown;
    };
    if (
      payload.format !== VERSION_FORMAT ||
      !Array.isArray(payload.nodes) ||
      !Array.isArray(payload.edges)
    ) {
      throw new Error("Unknown payload format");
    }
    return {
      nodes: payload.nodes.map((n) => WhiteboardNodes.schema.parse(n)),
      edges: payload.edges.map((e) => WhiteboardEdges.schema.parse(e)),
    };
  } catch (error) {
    Logger.warn("Couldn't read a whiteboard version", { error });
    throw unrestorable();
  }
}

const SUMMARY_PROJECTION = {
  kind: 1,
  users: 1,
  createdAt: 1,
  hash: 1,
} as const;

// A version userId's window is still open on, newest first.
const openVersionSelector = (
  boardId: string,
  userId: string,
  now: Date,
  lastRewrittenAt: Date | undefined,
) => ({
  board: boardId,
  kind: "edits" as const,
  users: {
    $elemMatch: {
      user: userId,
      at: { $gt: new Date(now.getTime() - VERSION_INTERVAL_MS) },
    },
  },
  ...(lastRewrittenAt ? { createdAt: { $gt: lastRewrittenAt } } : {}),
});

// The versions versionDecision needs: the newest, the newest ordinary one,
// and one userId's window is open on.
async function versionsToDecideOn(
  boardId: string,
  userId: string,
  now: Date,
  lastRewrittenAt: Date | undefined,
): Promise<VersionSummary[]> {
  const options = {
    sort: { createdAt: -1 },
    projection: SUMMARY_PROJECTION,
  } as const;
  const [newest, newestEdits, open] = await Promise.all([
    WhiteboardVersions.findOneAsync({ board: boardId }, options),
    WhiteboardVersions.findOneAsync(
      {
        board: boardId,
        kind: "edits",
        ...(lastRewrittenAt ? { createdAt: { $gt: lastRewrittenAt } } : {}),
      },
      options,
    ),
    WhiteboardVersions.findOneAsync(
      openVersionSelector(boardId, userId, now, lastRewrittenAt),
      options,
    ),
  ]);
  if (!newest) return [];
  const others = new Map<string, VersionSummary>();
  [newestEdits, open].forEach((v) => {
    if (v && v._id !== newest._id) others.set(v._id, v);
  });
  return [
    newest,
    ...[...others.values()].toSorted(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    ),
  ];
}

// Counts an edit against a version, adding userId to it or starting their
// window again if asked.
async function countEdit(
  versionId: string,
  userId: string,
  now: Date,
  windowStart?: { listed: boolean },
) {
  if (!windowStart) {
    await WhiteboardVersions.updateAsync(versionId, {
      $inc: { changeCount: 1 },
      $set: { lastEditAt: now },
    });
  } else if (windowStart.listed) {
    await WhiteboardVersions.updateAsync(
      { _id: versionId, "users.user": userId },
      {
        $inc: { changeCount: 1 },
        $set: { lastEditAt: now, "users.$.at": now },
      },
    );
  } else {
    await WhiteboardVersions.updateAsync(versionId, {
      $inc: { changeCount: 1 },
      $set: { lastEditAt: now },
      $push: { users: { user: userId, at: now } },
    });
  }
}

// Removes versions, their headers before their chunks, and notes on the
// board that older history has gone.
async function dropVersions(
  boardId: string,
  versions: PrunableVersion[],
  ids: string[],
) {
  if (ids.length === 0) return;
  const dropping = new Set(ids);
  const newestDropped = Math.max(
    ...versions
      .filter((v) => dropping.has(v._id))
      .map((v) => v.createdAt.getTime()),
  );
  await WhiteboardVersions.removeAsync({ board: boardId, _id: { $in: ids } });
  await WhiteboardVersionChunks.removeAsync({
    board: boardId,
    version: { $in: ids },
  });
  const prunedBefore = new Date(newestDropped);
  await Whiteboards.updateAsync(
    {
      _id: boardId,
      $or: [
        { versionsPrunedBefore: { $exists: false } },
        { versionsPrunedBefore: { $lt: prunedBefore } },
      ],
    },
    { $set: { versionsPrunedBefore: prunedBefore } },
  );
}

const PRUNE_PROJECTION = { kind: 1, createdAt: 1, size: 1 } as const;

// Chunks are written just before their version, so ones this old with no
// version are left from a write that didn't finish.
const ORPHAN_CHUNK_MS = 60 * 60 * 1000;

// Prunes each board's history as of now, sweeps up chunks with no version,
// and returns how many compressed bytes each board's history now takes. A
// board that fails is logged and left for the next pass, so it can't hold
// up the rest.
export async function pruneWhiteboardVersions(now: Date) {
  const sizes = new Map<string, number>();
  const boardIds: string[] = await WhiteboardVersions.collection
    .rawCollection()
    .distinct("board");
  for (const boardId of boardIds) {
    try {
      await withLock(`whiteboard:${boardId}`, async () => {
        const board = await Whiteboards.findOneAsync(boardId, {
          projection: { hunt: 1 },
        });
        const hunt =
          board &&
          (await Hunts.findOneAsync(board.hunt, {
            projection: { isArchived: 1 },
          }));
        const versions = await WhiteboardVersions.find(
          { board: boardId },
          { projection: PRUNE_PROJECTION },
        ).fetchAsync();
        const dropped = versionsToPrune(versions, now, {
          archived: !!hunt?.isArchived,
        });
        await dropVersions(boardId, versions, dropped);
        const gone = new Set(dropped);
        sizes.set(
          boardId,
          versions
            .filter((v) => !gone.has(v._id))
            .reduce((sum, v) => sum + v.size, 0),
        );
      });
    } catch (error) {
      Logger.warn("Couldn't prune whiteboard history", {
        board: boardId,
        error,
      });
    }
  }

  const chunks = WhiteboardVersionChunks.collection.rawCollection();
  const chunkBoards: string[] = await chunks.distinct("board");
  const cutoff = new Date(now.getTime() - ORPHAN_CHUNK_MS);
  for (const boardId of chunkBoards) {
    try {
      const versionIds: string[] = await chunks.distinct("version", {
        board: boardId,
        createdAt: { $lt: cutoff },
      });
      if (versionIds.length === 0) continue;
      const listed = new Set(
        (
          await WhiteboardVersions.find(
            { _id: { $in: versionIds } },
            { projection: { _id: 1 } },
          ).fetchAsync()
        ).map((v) => v._id),
      );
      const orphans = versionIds.filter((id) => !listed.has(id));
      if (orphans.length > 0) {
        await WhiteboardVersionChunks.removeAsync({
          board: boardId,
          version: { $in: orphans },
        });
      }
    } catch (error) {
      Logger.warn("Couldn't sweep whiteboard history chunks", {
        board: boardId,
        error,
      });
    }
  }

  return sizes;
}

// Keeps a board's history under MAX_VERSION_BYTES_PER_BOARD. Runs under the
// board's lock, and never fails the write it's part of: the retention daemon
// tries again later.
async function pruneOverCap(board: WhiteboardType, now: Date) {
  try {
    const versions = await WhiteboardVersions.find(
      { board: board._id },
      { projection: PRUNE_PROJECTION },
    ).fetchAsync();
    const total = versions.reduce((sum, v) => sum + v.size, 0);
    if (total <= MAX_VERSION_BYTES_PER_BOARD) return;
    await dropVersions(
      board._id,
      versions,
      versionsToPrune(versions, now, { archived: false }),
    );
  } catch (error) {
    Logger.warn("Couldn't prune whiteboard history", {
      board: board._id,
      error,
    });
  }
}

// Records the board as it is now, if versionDecision says to, for a write
// of kind by userId, and returns the id of the version it adds, if any. Only
// for callers holding whiteboard:<boardId>, whose renew this calls between
// the slow steps. A failure to snapshot throws; pruning afterwards never
// does.
export async function recordVersionLocked(
  board: WhiteboardType,
  userId: string,
  kind: WhiteboardVersionKind,
  renew: () => Promise<void>,
  extra: { restoredFromAt?: Date } = {},
): Promise<string | undefined> {
  const now = new Date();
  const { lastRewrittenAt } =
    (await Whiteboards.findOneAsync(board._id, {
      projection: { lastRewrittenAt: 1 },
    })) ?? {};
  const versions = await versionsToDecideOn(
    board._id,
    userId,
    now,
    lastRewrittenAt,
  );
  const decide = (hash?: string) =>
    versionDecision({
      kind,
      user: userId,
      now,
      lastRewrittenAt,
      versions,
      hash,
    });

  let decision = decide();
  if (decision.action === "extend") {
    await countEdit(decision.version, userId, now);
    return undefined;
  }
  if (decision.action === "join") {
    await countEdit(decision.version, userId, now, decision);
    return undefined;
  }

  const nodes = await WhiteboardNodes.find({ board: board._id }).fetchAsync();
  const edges = await WhiteboardEdges.find({ board: board._id }).fetchAsync();
  await renew();
  const { json, hash } = serializeBoard(nodes, edges);
  decision = decide(hash);
  if (decision.action === "unchanged") {
    await countEdit(decision.version, userId, now, decision);
    return undefined;
  }

  const chunks = await compressVersion(json);
  await renew();
  const versionId = Random.id();
  // The chunks go first, so a version that's listed always has its payload.
  for (const [index, data] of chunks.entries()) {
    await renew();
    await WhiteboardVersionChunks.insertAsync({
      hunt: board.hunt,
      board: board._id,
      version: versionId,
      index,
      data,
      createdAt: now,
    });
  }
  await WhiteboardVersions.insertAsync({
    _id: versionId,
    hunt: board.hunt,
    board: board._id,
    kind,
    users: [{ user: userId, at: now }],
    changeCount: 1,
    lastEditAt: now,
    restoredFromAt: extra.restoredFromAt,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    size: chunks.reduce((sum, c) => sum + c.length, 0),
    chunkCount: chunks.length,
    format: VERSION_FORMAT,
    hash,
    createdAt: now,
    createdBy: userId,
  });

  await pruneOverCap(board, now);
  return versionId;
}

// Records the board before a rewrite (a restore or a reset) and checks the
// lock is still held before the rewrite's first write. If it isn't, the
// rewrite never runs, so the version recorded for it is taken away again.
export async function recordVersionBeforeRewrite(
  board: WhiteboardType,
  userId: string,
  kind: "restore" | "reset",
  renew: () => Promise<void>,
  extra: { restoredFromAt?: Date } = {},
) {
  const versionId = await recordVersionLocked(
    board,
    userId,
    kind,
    renew,
    extra,
  );
  try {
    await renew();
  } catch (error) {
    if (versionId && error instanceof LockPreemptedError) {
      await WhiteboardVersions.removeAsync({
        _id: versionId,
        board: board._id,
      });
      await WhiteboardVersionChunks.removeAsync({
        board: board._id,
        version: versionId,
      });
    }
    throw error;
  }
}

// Called by every edit that can change the layout, after its checks and
// before its first write. A missing version beats a refused edit, so this
// never throws.
export async function recordVersionBeforeEdit(
  board: WhiteboardType,
  userId: string,
) {
  try {
    if (await Flags.activeAsync("disable.whiteboard_versions")) return;

    // Most edits extend a version, which needs no lock.
    const now = new Date();
    const open = await WhiteboardVersions.findOneAsync(
      openVersionSelector(board._id, userId, now, board.lastRewrittenAt),
      { sort: { createdAt: -1 }, projection: SUMMARY_PROJECTION },
    );
    if (
      open &&
      versionDecision({
        kind: "edits",
        user: userId,
        now,
        lastRewrittenAt: board.lastRewrittenAt,
        versions: [open],
      }).action === "extend"
    ) {
      await countEdit(open._id, userId, now);
      return;
    }

    await withLock(`whiteboard:${board._id}`, (renew) =>
      recordVersionLocked(board, userId, "edits", renew),
    );
  } catch (error) {
    Logger.warn("Couldn't record a whiteboard version", {
      board: board._id,
      user: userId,
      error,
    });
  }
}

// One chunk of a version's payload, for anyone who can see the board.
export async function fetchVersion(
  userId: string,
  boardId: string,
  versionId: string,
  index: number,
) {
  await loadBoardAccess(userId, boardId);
  await assertHistoryEnabled();
  const version = await WhiteboardVersions.findOneAsync({
    _id: versionId,
    board: boardId,
  });
  if (!version || !Number.isInteger(index) || index < 0) {
    throw unknownVersion();
  }
  if (index >= version.chunkCount) throw unknownVersion();
  const chunk = await WhiteboardVersionChunks.findOneAsync({
    version: versionId,
    index,
  });
  if (!chunk) throw unknownVersion();
  return chunk.data;
}

// Where every merged-away account went, following merges of merges.
async function mergedAccounts() {
  const merges = await MergeOperations.find(
    { completedAt: { $exists: true } },
    { projection: { participants: 1 } },
  ).fetchAsync();
  const into = new Map(merges.map((m) => m.participants));
  return (user: string) => {
    const seen = new Set<string>();
    let current = user;
    while (into.has(current) && !seen.has(current)) {
      seen.add(current);
      current = into.get(current)!;
    }
    return current;
  };
}

function withMergedAccounts<
  T extends {
    createdBy: string;
    updatedBy?: string;
    lockedBy?: string;
    contributors: { user: string; at: Date }[];
  },
>(doc: T, account: (user: string) => string): T {
  return {
    ...doc,
    createdBy: account(doc.createdBy),
    updatedBy: doc.updatedBy && account(doc.updatedBy),
    ...(doc.lockedBy ? { lockedBy: account(doc.lockedBy) } : {}),
    contributors: doc.contributors.map((c) => ({
      ...c,
      user: account(c.user),
    })),
  };
}

const modifierFor = ({ $set, $unset }: RestoreChange) => ({
  ...(Object.keys($set).length > 0 ? { $set } : {}),
  ...(Object.keys($unset).length > 0 ? { $unset } : {}),
});

// A version's nodes and lines as they'd be restored, with merged-away
// accounts mapped to where they went. Only for callers holding the board's
// lock, whose renew this calls between the slow steps.
async function readVersionLocked(
  version: WhiteboardVersionType,
  renew: () => Promise<void>,
) {
  const chunks = await WhiteboardVersionChunks.find(
    { version: version._id },
    { sort: { index: 1 } },
  ).fetchAsync();
  await renew();
  if (!(await WhiteboardVersions.findOneAsync(version._id))) {
    throw unknownVersion();
  }
  if (
    chunks.length !== version.chunkCount ||
    chunks.some((c, i) => c.index !== i)
  ) {
    throw unrestorable();
  }

  const stored = await decodeVersion(chunks.map((c) => c.data));
  await renew();
  const account = await mergedAccounts();
  const target = {
    nodes: stored.nodes.map((n) => withMergedAccounts(n, account)),
    edges: stored.edges.map((e) => withMergedAccounts(e, account)),
  };
  await renew();
  return target;
}

async function readBoard(boardId: string) {
  return {
    nodes: await WhiteboardNodes.find({ board: boardId }).fetchAsync(),
    edges: await WhiteboardEdges.find({ board: boardId }).fetchAsync(),
  };
}

// Writes a restore plan to the board: comments come off the nodes leaving or
// being hidden, then documents are removed, changed and inserted, and then
// comments go back on nodes that are back. Only for callers holding the
// board's lock.
async function writeRestorePlan(
  board: WhiteboardType,
  liveNodes: WhiteboardNodeType[],
  plan: RestorePlan,
  renew: () => Promise<void>,
) {
  let writes = 0;
  const wrote = async () => {
    writes += 1;
    if (writes % WRITES_PER_RENEWAL === 0) await renew();
  };

  // Before anything moves, since a pin's place on the board is worked out
  // from its node's frames.
  const liveById = new Map(liveNodes.map((n) => [n._id, n]));
  for (const id of plan.detach) {
    const node = liveById.get(id);
    if (node) await detachComments(board.puzzle, node);
    await wrote();
  }

  if (plan.edges.remove.length > 0) {
    await WhiteboardEdges.removeAsync({
      board: board._id,
      _id: { $in: plan.edges.remove },
    });
  }
  if (plan.nodes.remove.length > 0) {
    await WhiteboardNodes.removeAsync({
      board: board._id,
      _id: { $in: plan.nodes.remove },
    });
  }
  await renew();
  for (const change of plan.nodes.change) {
    await WhiteboardNodes.updateAsync(change._id, modifierFor(change));
    await wrote();
  }
  for (const change of plan.edges.change) {
    await WhiteboardEdges.updateAsync(change._id, modifierFor(change));
    await wrote();
  }
  // What comes back is new on the board as it is now, so it draws on top
  // like anything the restore changed.
  const updatedAt = new Date();
  [...plan.nodes.insert, ...plan.edges.insert].forEach((doc) => {
    doc.updatedAt = updatedAt;
  });
  for (let i = 0; i < plan.nodes.insert.length; i += WRITES_PER_RENEWAL) {
    await WhiteboardNodes.insertManyAsync(
      plan.nodes.insert.slice(i, i + WRITES_PER_RENEWAL),
    );
    await renew();
  }
  for (let i = 0; i < plan.edges.insert.length; i += WRITES_PER_RENEWAL) {
    await WhiteboardEdges.insertManyAsync(
      plan.edges.insert.slice(i, i + WRITES_PER_RENEWAL),
    );
    await renew();
  }

  for (const { node, from } of plan.reattach) {
    const doc = await WhiteboardNodes.findOneAsync(node);
    if (doc) await reattachComments(board.puzzle, doc, from);
    await wrote();
  }
}

// Puts the board back as a version has it, recording the board as it is
// first. Comments stay, coming off nodes the restore takes away and going
// back on nodes it brings back. Who may edit the board isn't changed, and
// unless the caller is an operator neither is who holds a lock: every node
// keeps the lock it has, and nodes the restore brings back come unlocked.
export async function restoreVersion(
  userId: string,
  boardId: string,
  versionId: string,
) {
  const { board } = await assertMayEditBoard(userId, boardId);
  await assertHistoryEnabled();
  const version = await WhiteboardVersions.findOneAsync({
    _id: versionId,
    board: boardId,
  });
  if (!version) throw unknownVersion();

  await withBoardLock(boardId, async (renew) => {
    // Anything may have changed while this waited for the lock
    const {
      board: current,
      hunt,
      user,
    } = await assertMayEditBoard(userId, boardId);
    await assertHistoryEnabled();
    const target = await readVersionLocked(version, renew);

    const live = await readBoard(boardId);
    await renew();
    const result = planRestore(live, target, {
      keepLocks: !userMayWritePuzzlesForHunt(user, hunt),
    });
    if (!result.ok) {
      throw new Meteor.Error(
        409,
        "This version has more on it than a board can hold",
      );
    }
    const { plan } = result;
    await renew();

    // Nothing has been written yet, so a failure here leaves the board as
    // it was.
    await recordVersionBeforeRewrite(current, userId, "restore", renew, {
      restoredFromAt: version.createdAt,
    });

    await writeRestorePlan(current, live.nodes, plan, renew);

    await Whiteboards.updateAsync(boardId, {
      $set: { lastRewrittenAt: new Date() },
    });
  });

  // Puts cards the version didn't have into their rounds, and redraws feeder
  // arrows. It takes the board's lock, so it can't run inside it.
  const puzzles = await Puzzles.find(
    { hunt: board.hunt, kind: { $ne: "whiteboard" } },
    { projection: { _id: 1 } },
  ).fetchAsync();
  deferSyncPuzzlesOnBoard(
    board.hunt,
    puzzles.map((p) => p._id),
  );
}

// Puts some of a version's nodes back as the version has them, with what
// restoreItemSet adds to them, leaving the rest of the board alone. It's an
// edit, recorded and coalesced like any other: nothing live is removed and
// the board isn't marked as rewritten. Returns whether anything on the board
// changed.
export async function restoreItems(
  userId: string,
  boardId: string,
  versionId: string,
  nodeIds: string[],
): Promise<boolean> {
  const { board } = await assertMayEditBoard(userId, boardId);
  await assertHistoryEnabled();
  const version = await WhiteboardVersions.findOneAsync({
    _id: versionId,
    board: boardId,
  });
  if (!version) throw unknownVersion();
  if (nodeIds.length === 0) throw new Meteor.Error(400, "Nothing to restore");
  if (nodeIds.length > MAX_BATCH) {
    throw new Meteor.Error(400, "Too many nodes at once");
  }

  const { puzzles, restored } = await withBoardLock(boardId, async (renew) => {
    // Anything may have changed while this waited for the lock
    const { board: current } = await assertMayEditBoard(userId, boardId);
    await assertHistoryEnabled();
    const target = await readVersionLocked(version, renew);

    const items = restoreItemSet(target, nodeIds);
    if (!items) throw new Meteor.Error(404, "That isn't in this version");
    if (items.nodes.size > MAX_BATCH || items.edges.size > MAX_BATCH) {
      throw new Meteor.Error(400, "That's too much to restore at once");
    }

    const live = await readBoard(boardId);
    await renew();
    const result = planItemRestore(live, target, items);
    if (!result.ok) throw new Meteor.Error(400, "This board is full");
    const { plan } = result;
    // Restoring an item is a person's edit, so like Place by tags it doesn't
    // move, change or unlock anything locked, whoever asks.
    const liveById = new Map(live.nodes.map((n) => [n._id, n]));
    const lockedKeys = new Set<string>([
      ...LOCKED_FIELDS,
      "locked",
      "lockedBy",
    ]);
    if (
      plan.nodes.change.some(
        (c) =>
          liveById.get(c._id)?.locked &&
          [...Object.keys(c.$set), ...Object.keys(c.$unset)].some((key) =>
            lockedKeys.has(key),
          ),
      )
    ) {
      throw lockedError();
    }
    const restored =
      plan.nodes.change.length > 0 ||
      plan.nodes.insert.length > 0 ||
      plan.edges.change.length > 0 ||
      plan.edges.insert.length > 0;
    // Nothing to write is no edit, so it isn't recorded either.
    if (
      !restored &&
      plan.nodes.remove.length === 0 &&
      plan.edges.remove.length === 0 &&
      plan.detach.length === 0 &&
      plan.reattach.length === 0
    ) {
      return { puzzles: result.puzzles, restored };
    }

    // Nothing has been written yet, so a failure here leaves the board as
    // it was.
    await recordVersionLocked(current, userId, "edits", renew);
    await renew();
    await writeRestorePlan(current, live.nodes, plan, renew);
    return { puzzles: result.puzzles, restored };
  });

  // Puts restored cards that placement looks after into their rounds, and
  // redraws their feeder arrows. It takes the board's lock, so it can't run
  // inside it.
  deferSyncPuzzlesOnBoard(board.hunt, puzzles);
  return restored;
}
