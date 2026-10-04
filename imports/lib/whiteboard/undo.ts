// Undo and redo for one person's own edits to a board, for one visit. An
// entry holds the writes that redo an edit and the writes that undo it,
// applied in order, and when each document they touch was last changed
// (its updatedAt, in ms) as of the last time the entry was applied, or null
// where the document didn't exist then. What a write is (W) is up to the
// caller.

// How many edits can be undone.
export const MAX_UNDO_ENTRIES = 100;

// Documents by key ("node:<id>" or "edge:<id>"), to when each was last
// changed, or null for one that didn't exist.
export type Stamps = ReadonlyMap<string, number | null>;

export interface UndoEntry<W> {
  forward: W[];
  inverse: W[];
  stamps: Stamps;
  // Back-to-back edits in the same group are one entry (an ink stroke that's
  // saved in segments as it's drawn).
  group?: string;
}

export interface UndoStacks<W> {
  undo: UndoEntry<W>[];
  redo: UndoEntry<W>[];
}

export const emptyStacks = <W>(): UndoStacks<W> => ({ undo: [], redo: [] });

const capped = <W>(entries: UndoEntry<W>[]) =>
  entries.length > MAX_UNDO_ENTRIES
    ? entries.slice(entries.length - MAX_UNDO_ENTRIES)
    : entries;

// A new edit: it goes on top of the undo stack, joining the entry there if
// they share a group, and nothing can be redone any more.
export function pushEdit<W>(
  stacks: UndoStacks<W>,
  entry: UndoEntry<W>,
): UndoStacks<W> {
  const top = stacks.undo.at(-1);
  if (entry.group !== undefined && top?.group === entry.group) {
    const joined: UndoEntry<W> = {
      forward: [...top.forward, ...entry.forward],
      inverse: [...entry.inverse, ...top.inverse],
      stamps: new Map([...top.stamps, ...entry.stamps]),
      group: entry.group,
    };
    return { undo: [...stacks.undo.slice(0, -1), joined], redo: [] };
  }
  return { undo: capped([...stacks.undo, entry]), redo: [] };
}

// The entry to undo next, and the stacks without it.
export function takeUndo<W>(
  stacks: UndoStacks<W>,
): { entry: UndoEntry<W>; stacks: UndoStacks<W> } | undefined {
  const entry = stacks.undo.at(-1);
  if (!entry) return undefined;
  return { entry, stacks: { ...stacks, undo: stacks.undo.slice(0, -1) } };
}

// The entry to redo next, and the stacks without it.
export function takeRedo<W>(
  stacks: UndoStacks<W>,
): { entry: UndoEntry<W>; stacks: UndoStacks<W> } | undefined {
  const entry = stacks.redo.at(-1);
  if (!entry) return undefined;
  return { entry, stacks: { ...stacks, redo: stacks.redo.slice(0, -1) } };
}

// An entry that has just been undone, with its documents' stamps since, so
// it can be redone.
export function pushUndone<W>(
  stacks: UndoStacks<W>,
  entry: UndoEntry<W>,
  stamps: Stamps,
): UndoStacks<W> {
  return {
    ...stacks,
    redo: capped([...stacks.redo, { ...entry, stamps, group: undefined }]),
  };
}

// An entry that has just been redone, with its documents' stamps since, so
// it can be undone again. What else can be redone stays.
export function pushRedone<W>(
  stacks: UndoStacks<W>,
  entry: UndoEntry<W>,
  stamps: Stamps,
): UndoStacks<W> {
  return {
    ...stacks,
    undo: capped([...stacks.undo, { ...entry, stamps, group: undefined }]),
  };
}

// Whether someone else has changed a document since the entry was last
// applied: it's newer than recorded, or it has gone. A document that didn't
// exist then can't have changed. current gives a document's stamp now,
// undefined if it's gone.
export function isStale(
  stamps: Stamps,
  current: (key: string) => number | undefined,
): boolean {
  for (const [key, at] of stamps) {
    if (at === null) continue;
    const now = current(key);
    if (now === undefined || now > at) return true;
  }
  return false;
}

// Carries the viewer's own write forward into every entry: a document that
// an entry recorded as it was just before the write (before) is recorded as
// it is after it (after), so the viewer's own later edits don't make their
// earlier ones look changed by someone else. An entry that recorded
// something older already counts as stale, and still does.
export function carryForward<W>(
  stacks: UndoStacks<W>,
  before: Stamps,
  after: Stamps,
): UndoStacks<W> {
  const changes = [...after].flatMap(([key, to]) => {
    const from = before.get(key) ?? null;
    return from === to ? [] : [{ key, from, to }];
  });
  if (changes.length === 0) return stacks;
  const carry = (entry: UndoEntry<W>) => {
    const moved = changes.filter(
      ({ key, from }) =>
        entry.stamps.has(key) && entry.stamps.get(key) === from,
    );
    if (moved.length === 0) return entry;
    const stamps = new Map(entry.stamps);
    moved.forEach(({ key, to }) => stamps.set(key, to));
    return { ...entry, stamps };
  };
  return { undo: stacks.undo.map(carry), redo: stacks.redo.map(carry) };
}

// Whether a write changed anything at all, judged by the stamps of what it
// touches before and after.
export const changedAnything = (before: Stamps, after: Stamps) =>
  [...after].some(([key, at]) => (before.get(key) ?? null) !== at);
