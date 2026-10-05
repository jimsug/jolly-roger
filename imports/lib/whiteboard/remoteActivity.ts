// How long someone else's "is editing" holds after their presence last
// changed. Their client clears it when they stop typing, so one that has
// sat this long is taken to be from a tab that has stalled.
export const REMOTE_EDITING_TIMEOUT_MS = 30_000;

// One tab's presence on the board, as far as selection and editing go.
export interface PresenceActivity {
  user: string;
  selection?: string[] | null;
  editing?: string | null;
  // When this client last saw anything in it change
  changedAt: number;
}

// The nodes and lines other people are typing in, each with who, and when
// the first of those stops counting. The viewer's own tabs are left out. If
// two people are typing in one thing, the first found is named.
export function othersEditing(
  presence: Iterable<PresenceActivity>,
  self: string | undefined,
  now: number,
): { editing: Map<string, string>; staleAt: number | undefined } {
  const editing = new Map<string, string>();
  let staleAt: number | undefined;
  for (const { user, editing: id, changedAt } of presence) {
    if (!id || user === self) continue;
    const expires = changedAt + REMOTE_EDITING_TIMEOUT_MS;
    if (expires <= now) continue;
    if (!editing.has(id)) editing.set(id, user);
    staleAt = staleAt === undefined ? expires : Math.min(staleAt, expires);
  }
  return { editing, staleAt };
}

// The nodes other people have selected, each with who has, in a stable
// order. The viewer's own tabs are left out.
export function othersSelecting(
  presence: Iterable<Omit<PresenceActivity, "changedAt">>,
  self: string | undefined,
): Map<string, string[]> {
  const selecting = new Map<string, Set<string>>();
  for (const { user, selection } of presence) {
    if (user === self) continue;
    for (const id of selection ?? []) {
      const users = selecting.get(id) ?? new Set<string>();
      users.add(user);
      selecting.set(id, users);
    }
  }
  return new Map(
    [...selecting].map(([id, users]) => [id, [...users].toSorted()]),
  );
}
