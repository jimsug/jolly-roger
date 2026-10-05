import { Meteor } from "meteor/meteor";
import { useTracker } from "meteor/react-meteor-data";
import { useEffect, useMemo, useState } from "react";
import type { PresenceActivity } from "../../lib/whiteboard/remoteActivity";
import { othersEditing } from "../../lib/whiteboard/remoteActivity";
import WhiteboardPresence from "../WhiteboardPresence";
import useWhiteboardNames from "./useWhiteboardNames";

export interface RemoteEditor {
  user: string;
  name: string;
}

const NOBODY_EDITING: ReadonlyMap<string, string> = new Map();

const sameEditing = (
  a: ReadonlyMap<string, string>,
  b: ReadonlyMap<string, string>,
) => a.size === b.size && [...a].every(([id, user]) => b.get(id) === user);

// The nodes and lines other people on the board are typing in, each with
// who. Someone's typing stops counting once their presence has gone
// REMOTE_EDITING_TIMEOUT_MS without changing, so a stalled tab can't hold
// a note forever. Any change to a presence document (a cursor moving, say)
// counts, but only a change to what's being typed in re-renders.
export default function useWhiteboardOthersEditing(
  boardId: string,
  enabled: boolean,
): ReadonlyMap<string, RemoteEditor> {
  const self = useTracker(() => Meteor.userId() ?? undefined, []);
  const [editing, setEditing] = useState(NOBODY_EDITING);

  useEffect(() => {
    if (!enabled) return undefined;
    const docs = new Map<string, PresenceActivity>();
    let timer: number | undefined;
    const update = () => {
      window.clearTimeout(timer);
      timer = undefined;
      const now = Date.now();
      const next = othersEditing(docs.values(), self, now);
      setEditing((current) =>
        sameEditing(current, next.editing) ? current : next.editing,
      );
      if (next.staleAt !== undefined) {
        timer = window.setTimeout(update, next.staleAt - now);
      }
    };
    const handle = WhiteboardPresence.find({ board: boardId }).observeChanges({
      added: (id, fields) => {
        docs.set(id, {
          user: fields.user ?? "",
          editing: fields.editing ?? null,
          changedAt: Date.now(),
        });
        update();
      },
      changed: (id, fields) => {
        const doc = docs.get(id);
        if (!doc) return;
        doc.changedAt = Date.now();
        if ("user" in fields && fields.user) doc.user = fields.user;
        if ("editing" in fields) doc.editing = fields.editing ?? null;
        // Typing that had gone quiet counts again once they do anything.
        if ("editing" in fields || doc.editing) update();
      },
      removed: (id) => {
        if (docs.delete(id)) update();
      },
    });
    // Once even when nothing was added, so a board with nobody on it
    // doesn't go on showing what the last board had.
    update();
    return () => {
      handle.stop();
      window.clearTimeout(timer);
    };
  }, [boardId, enabled, self]);

  const shown = enabled ? editing : NOBODY_EDITING;
  const names = useWhiteboardNames(shown.values());
  return useMemo(
    () =>
      new Map(
        [...shown].map(([id, user]) => [
          id,
          { user, name: names.get(user) ?? "" },
        ]),
      ),
    [shown, names],
  );
}
