import type { Meteor } from "meteor/meteor";
import { useTracker } from "meteor/react-meteor-data";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import WhiteboardEdges from "../../lib/models/WhiteboardEdges";
import WhiteboardNodes from "../../lib/models/WhiteboardNodes";
import Whiteboards from "../../lib/models/Whiteboards";
import { MAX_BATCH } from "../../lib/whiteboard/limits";
import type { Stamps, UndoStacks } from "../../lib/whiteboard/undo";
import {
  carryForward,
  changedAnything,
  emptyStacks,
  isStale,
  pushEdit,
  pushRedone,
  pushUndone,
  takeRedo,
  takeUndo,
} from "../../lib/whiteboard/undo";
import deleteWhiteboardEdges from "../../methods/deleteWhiteboardEdges";
import deleteWhiteboardNodes from "../../methods/deleteWhiteboardNodes";
import placeWhiteboardCardsByTags from "../../methods/placeWhiteboardCardsByTags";
import upsertWhiteboardEdges from "../../methods/upsertWhiteboardEdges";
import upsertWhiteboardNodes from "../../methods/upsertWhiteboardNodes";
import type {
  BoardDocs,
  BoardWrite,
  Done,
} from "../components/whiteboard/boardWrites";
import {
  chunks,
  dependedOnKeys,
  inverseOf,
  parentsFirst,
  parseKey,
  touchedKeys,
} from "../components/whiteboard/boardWrites";

// The board as this client has it. With no method stubs, that's the
// server's documents as last sent.
function boardDocs(boardId: string): BoardDocs {
  return {
    node: (id) => WhiteboardNodes.findOne({ _id: id, board: boardId }),
    edge: (id) => WhiteboardEdges.findOne({ _id: id, board: boardId }),
    children: (frameIds) =>
      WhiteboardNodes.find({
        board: boardId,
        parent: { $in: frameIds },
      }).fetch(),
    strokeSegments: (strokes) =>
      WhiteboardNodes.find({
        board: boardId,
        stroke: { $in: strokes },
      }).fetch(),
    edgesTouching: (nodeIds) =>
      WhiteboardEdges.find({
        board: boardId,
        $or: [{ source: { $in: nodeIds } }, { target: { $in: nodeIds } }],
      }).fetch(),
  };
}

const STAMP_FIELDS = { projection: { updatedAt: 1, createdAt: 1 } };

// When a document was last changed, or undefined if it isn't there.
function stampOf(key: string): number | undefined {
  const { kind, id } = parseKey(key);
  const doc =
    kind === "edge"
      ? WhiteboardEdges.findOne(id, STAMP_FIELDS)
      : WhiteboardNodes.findOne(id, STAMP_FIELDS);
  if (!doc) return undefined;
  return (doc.updatedAt ?? doc.createdAt)?.getTime() ?? 0;
}

const stampsOf = (keys: Iterable<string>): Map<string, number | null> =>
  new Map([...keys].map((key) => [key, stampOf(key) ?? null]));

const overlaps = (a: ReadonlySet<string>, b: ReadonlySet<string>) =>
  [...b].some((key) => a.has(key));

// Sends a write's methods one after another, stopping at the first refusal.
function sendWrite(boardId: string, write: BoardWrite, done: Done) {
  const steps: ((next: Done) => void)[] = [
    ...chunks(parentsFirst(write.upsertNodes ?? []), MAX_BATCH).map(
      (nodes) => (next: Done) =>
        upsertWhiteboardNodes.call({ boardId, nodes }, next),
    ),
    ...chunks(write.upsertEdges ?? [], MAX_BATCH).map(
      (edges) => (next: Done) =>
        upsertWhiteboardEdges.call({ boardId, edges }, next),
    ),
    ...chunks(write.deleteEdges ?? [], MAX_BATCH).map(
      (edgeIds) => (next: Done) =>
        deleteWhiteboardEdges.call({ boardId, edgeIds }, next),
    ),
    ...chunks(write.deleteNodes ?? [], MAX_BATCH).map(
      (nodeIds) => (next: Done) =>
        deleteWhiteboardNodes.call({ boardId, nodeIds }, next),
    ),
    ...chunks(write.placeByTags ?? [], MAX_BATCH).map(
      (nodeIds) => (next: Done) =>
        placeWhiteboardCardsByTags.call({ boardId, nodeIds }, next),
    ),
  ];
  const run = (i: number) => {
    const step = steps[i];
    if (!step) {
      done();
      return;
    }
    step((error) => (error ? done(error) : run(i + 1)));
  };
  run(0);
}

function sendWrites(boardId: string, writes: BoardWrite[], done: Done) {
  const run = (i: number) => {
    const write = writes[i];
    if (!write) {
      done();
      return;
    }
    sendWrite(boardId, write, (error) => (error ? done(error) : run(i + 1)));
  };
  run(0);
}

// An undo or redo on its way to the server.
interface Run {
  writes: BoardWrite[];
  // What its writes touch or need.
  keys: ReadonlySet<string>;
  // The stamps of what it touches once it's back.
  after?: Stamps;
  refused: boolean;
  // Whether the viewer made an edit while it was on its way.
  edited: boolean;
}

// One save the canvas has sent.
interface Save {
  forward: BoardWrite;
  inverse: BoardWrite;
  refused: boolean;
  pending: PendingStep;
}

// Saves on their way to the server, kept together while they share a
// document. The board the client has doesn't show a save until it's back, so
// a later save's inverse would put back what was there before the earlier
// one too; together they're one step whose inverse undoes the lot.
interface PendingStep {
  saves: Save[];
  // What the saves and their inverses touch or need.
  keys: Set<string>;
  // The stamps of what they touch, from just before the first save to
  // touch each.
  before: Map<string, number | null>;
  outstanding: number;
  group?: string;
  // An undo or redo that was on its way when one of these was saved, and
  // shares a document with it.
  run?: Run;
  generation: number;
}

export interface WhiteboardUndo {
  // Call just before sending an edit, with what it sends; call what it
  // returns once the edit is back, with the refusal if there was one.
  record: (forward: BoardWrite, group?: string) => Done;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

// The viewer's own edits to a board this visit, to undo and redo (see
// imports/lib/whiteboard/undo.ts). Undoing sends the edit's inverse through
// the usual methods, once the viewer's saves on their way are back. An edit
// someone else has changed since is dropped with onStale rather than undone,
// and a refusal goes to onRefused. Both stacks clear when the board is
// rewritten (a restore or reset) and when editable goes false.
export default function useWhiteboardUndo(
  boardId: string,
  {
    editable,
    onRefused,
    onStale,
  }: {
    editable: boolean;
    onRefused: (error: Meteor.Error) => void;
    onStale: (action: "undo" | "redo") => void;
  },
): WhiteboardUndo {
  const stacks = useRef<UndoStacks<BoardWrite>>(emptyStacks());
  const [sizes, setSizes] = useState({ undo: 0, redo: 0 });
  // Bumped by clear, so edits and undos still on their way when the stacks
  // are cleared don't land on the new ones.
  const generation = useRef(0);
  const queue = useRef<("undo" | "redo")[]>([]);
  const running = useRef<Run | undefined>(undefined);
  const pending = useRef<PendingStep[]>([]);
  const callbacks = useRef({ onRefused, onStale });
  useEffect(() => {
    callbacks.current = { onRefused, onStale };
  }, [onRefused, onStale]);

  const update = useCallback((next: UndoStacks<BoardWrite>) => {
    stacks.current = next;
    setSizes((current) =>
      current.undo === next.undo.length && current.redo === next.redo.length
        ? current
        : { undo: next.undo.length, redo: next.redo.length },
    );
  }, []);

  // Undoes or redoes the next step asked for, once nothing is on its way.
  const next = useCallback(() => {
    if (running.current || pending.current.length > 0) return;
    const action = queue.current.shift();
    if (!action) return;
    const taken =
      action === "undo" ? takeUndo(stacks.current) : takeRedo(stacks.current);
    if (!taken) {
      queue.current = [];
      return;
    }
    const { entry } = taken;
    update(taken.stacks);
    const writes = action === "undo" ? entry.inverse : entry.forward;
    const needs = dependedOnKeys(...writes);
    const before = stampsOf(entry.stamps.keys());
    if (
      isStale(entry.stamps, (key) => before.get(key) ?? undefined) ||
      needs.some((key) => stampOf(key) === undefined)
    ) {
      queue.current = [];
      callbacks.current.onStale(action);
      return;
    }
    const run: Run = {
      writes,
      keys: new Set([...entry.stamps.keys(), ...needs]),
      refused: false,
      edited: false,
    };
    running.current = run;
    const started = generation.current;
    sendWrites(boardId, writes, (error) => {
      const after = stampsOf(entry.stamps.keys());
      run.after = after;
      run.refused = !!error;
      if (generation.current !== started) return;
      running.current = undefined;
      if (error) {
        queue.current = [];
        callbacks.current.onRefused(error);
        return;
      }
      const carried = carryForward(stacks.current, before, after);
      if (action === "redo") {
        update(pushRedone(carried, entry, after));
      } else {
        // An edit made meanwhile leaves nothing to redo.
        update(run.edited ? carried : pushUndone(carried, entry, after));
      }
      next();
    });
  }, [boardId, update]);

  const finish = useCallback(
    (step: PendingStep) => {
      pending.current = pending.current.filter((p) => p !== step);
      if (step.generation !== generation.current) return;
      const saved = step.saves.filter((save) => !save.refused);
      if (saved.length > 0) {
        const forward = saved.map((save) => save.forward);
        // Later saves first; then what an undo or redo on its way at the time
        // wrote, which the board the client had didn't show yet.
        const inverse = [
          ...saved.map((save) => save.inverse).toReversed(),
          ...(step.run && !step.run.refused ? step.run.writes : []),
        ];
        const keys = touchedKeys(...forward, ...inverse);
        const before = new Map(
          keys.map((key) => [key, step.before.get(key) ?? null]),
        );
        step.run?.after?.forEach((at, key) => {
          if (before.has(key)) before.set(key, at);
        });
        const after = stampsOf(keys);
        // A write that changed nothing has nothing to undo.
        if (changedAnything(before, after)) {
          update(
            pushEdit(carryForward(stacks.current, before, after), {
              forward,
              inverse,
              stamps: after,
              group: step.group,
            }),
          );
        }
      }
      next();
    },
    [next, update],
  );

  const record = useCallback(
    (forward: BoardWrite, group?: string): Done => {
      const inverse = inverseOf(forward, boardDocs(boardId));
      const keys = new Set([
        ...touchedKeys(forward, inverse),
        ...dependedOnKeys(forward, inverse),
      ]);
      const run = running.current;
      if (run) {
        run.edited = true;
        // Asked for before this edit, so meant for older ones.
        queue.current = [];
      }
      const joining = pending.current.filter((p) => overlaps(p.keys, keys));
      const before = new Map(joining.flatMap((p) => [...p.before]));
      const sharesRun = run && overlaps(run.keys, keys) ? run : undefined;
      touchedKeys(forward, inverse, ...(sharesRun?.writes ?? [])).forEach(
        (key) => {
          if (!before.has(key)) before.set(key, stampOf(key) ?? null);
        },
      );
      const step: PendingStep = {
        saves: [],
        keys: new Set([...joining.flatMap((p) => [...p.keys]), ...keys]),
        before,
        outstanding: joining.reduce((n, p) => n + p.outstanding, 1),
        group: joining.every((p) => p.group === group) ? group : undefined,
        run: sharesRun ?? joining.find((p) => p.run)?.run,
        generation: generation.current,
      };
      const save: Save = { forward, inverse, refused: false, pending: step };
      step.saves = [...joining.flatMap((p) => p.saves), save];
      step.saves.forEach((s) => {
        s.pending = step;
      });
      pending.current = [
        ...pending.current.filter((p) => !joining.includes(p)),
        step,
      ];
      return (error) => {
        save.refused = !!error;
        const current = save.pending;
        current.outstanding -= 1;
        if (current.outstanding === 0) finish(current);
      };
    },
    [boardId, finish],
  );

  const request = useCallback(
    (action: "undo" | "redo") => {
      queue.current.push(action);
      next();
    },
    [next],
  );
  const undo = useCallback(() => request("undo"), [request]);
  const redo = useCallback(() => request("redo"), [request]);

  // What undo would put back describes the board as it was, so a restore or
  // reset, which rewrites it, clears both stacks. So does another board, or
  // losing edit access.
  const lastRewrittenAt = useTracker(
    () =>
      Whiteboards.findOne(boardId, {
        projection: { lastRewrittenAt: 1 },
      })?.lastRewrittenAt?.getTime(),
    [boardId],
  );
  useEffect(() => {
    generation.current += 1;
    queue.current = [];
    running.current = undefined;
    pending.current = [];
    update(emptyStacks());
  }, [boardId, lastRewrittenAt, editable, update]);

  return useMemo(
    () => ({
      record,
      undo,
      redo,
      canUndo: sizes.undo > 0,
      canRedo: sizes.redo > 0,
    }),
    [record, undo, redo, sizes],
  );
}
