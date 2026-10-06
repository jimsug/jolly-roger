import { useTracker } from "meteor/react-meteor-data";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SeenDrag } from "../../lib/whiteboard/liveDrags";
import { liveDrags, seeDrags } from "../../lib/whiteboard/liveDrags";
import type { WhiteboardLiveState } from "../../methods/setWhiteboardLive";
import WhiteboardPresence from "../WhiteboardPresence";
import type { RemoteDrag } from "./useWhiteboardSync";

type LiveDrag = NonNullable<WhiteboardLiveState["drag"]>[number];

// Whether two lists of other people's drags would put everything in the same
// place.
const sameDrags = (a: LiveDrag[], b: LiveDrag[]) =>
  a.length === b.length &&
  a.every((drag, i) => {
    const other = b[i];
    return (
      !!other &&
      drag.node === other.node &&
      drag.x === other.x &&
      drag.y === other.y &&
      (drag.parent ?? null) === (other.parent ?? null)
    );
  });

// What other people are dragging on the board, for the canvas to show their
// nodes where they have them (see useWhiteboardSync).
export default function useRemoteDrags(
  boardId: string,
  liveEnabled: boolean,
): {
  // Each dragged node, where its dragger has it.
  remoteDrags: Map<string, RemoteDrag>;
  // Whether someone else is dragging a node, whose shown position is never
  // saved by anything done here.
  isDraggedByOthers: (id: string) => boolean;
} {
  // Cursors move constantly, but only what people are dragging matters here
  // (CursorLayer draws the rest). Reading just that means cursor moves don't
  // re-render the canvas, and nodes are only rebuilt when a drag changes.
  const drags = useTracker(
    () =>
      liveEnabled
        ? WhiteboardPresence.find(
            { board: boardId },
            { projection: { drag: 1 } },
          )
            .fetch()
            .flatMap((p) => p.drag ?? [])
        : [],
    [boardId, liveEnabled],
    sameDrags,
  );
  // Only drags that are still moving count (see LIVE_DRAG_TIMEOUT_MS).
  const seenDrags = useRef(new Map<string, SeenDrag>());
  const remoteDragged = useRef(new Set<string>());
  const [remoteDrags, setRemoteDrags] = useState(
    () => new Map<string, RemoteDrag>(),
  );
  useEffect(() => {
    let timer: number | undefined;
    const update = () => {
      const now = Date.now();
      seenDrags.current = seeDrags(seenDrags.current, drags, now);
      const { live, staleAt } = liveDrags(seenDrags.current, now);
      remoteDragged.current = new Set(live.keys());
      setRemoteDrags((previous) =>
        previous.size === 0 && live.size === 0 ? previous : live,
      );
      if (staleAt !== undefined) {
        timer = window.setTimeout(update, staleAt - now);
      }
    };
    update();
    return () => window.clearTimeout(timer);
  }, [drags]);

  const isDraggedByOthers = useCallback(
    (id: string) => remoteDragged.current.has(id),
    [],
  );

  return { remoteDrags, isDraggedByOthers };
}
