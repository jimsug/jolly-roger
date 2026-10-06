import type { XYPosition } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";
import type React from "react";
import { useCallback } from "react";
import Puzzles from "../../lib/models/Puzzles";
import Tags from "../../lib/models/Tags";
import type {
  Box,
  BoxChange,
  FrameAround,
} from "../../lib/whiteboard/frameTools";
import {
  fitFrame,
  growFrameFor,
  tidyFrame,
} from "../../lib/whiteboard/frameTools";
import { roundMetas } from "../../lib/whiteboard/layout";
import { MAX_FRAME_DEPTH } from "../../lib/whiteboard/limits";
import type { WhiteboardNodeInput } from "../../methods/upsertWhiteboardNodes";
import frameToolBox from "../components/whiteboard/frameToolBox";
import { MIN_SIZES } from "../components/whiteboard/NodeChrome";
import type { WhiteboardActions } from "../components/whiteboard/WhiteboardContext";
import type {
  WhiteboardFlowEdge,
  WhiteboardFlowNode,
} from "./useWhiteboardSync";

// A node that has just been dropped, nudged or aligned, where it now is.
export interface Landed {
  id: string;
  parent: string | undefined;
  position: XYPosition;
}

// The frame tools (see imports/lib/whiteboard/frameTools.ts): Fit to
// contents, Tidy, and growing a frame round what has just landed in it.
export default function useFrameTools({
  huntId,
  isDraggedByOthers,
  markPending,
  setNodes,
  updateNodes,
  showLockRefused,
}: {
  huntId: string;
  isDraggedByOthers: (id: string) => boolean;
  // Holds a change until the server has it, and shows it on the board.
  markPending: (
    id: string,
    change: { position?: XYPosition; width?: number; height?: number },
  ) => void;
  setNodes: React.Dispatch<React.SetStateAction<WhiteboardFlowNode[]>>;
  updateNodes: WhiteboardActions["updateNodes"];
  showLockRefused: () => void;
}) {
  const flow = useReactFlow<WhiteboardFlowNode, WhiteboardFlowEdge>();

  // A node's box for the frame tools. Something someone else is dragging
  // counts where it's saved: where they have it is theirs to save.
  const toolBox = useCallback(
    (n: WhiteboardFlowNode): Box => {
      const found = frameToolBox(n);
      return isDraggedByOthers(n.id)
        ? { ...found, ...n.data.doc.position }
        : found;
    },
    [isDraggedByOthers],
  );

  // The frame tools' changes, less any to something someone else is
  // dragging other than the frame being worked on, which are theirs to save.
  const notDraggedByOthers = useCallback(
    (changes: BoxChange[], frameId: string) =>
      changes.filter((c) => c.id === frameId || !isDraggedByOthers(c.id)),
    [isDraggedByOthers],
  );

  // A frame, what's directly in it, and the frames around it (innermost
  // first) with what's directly in each, as the frame tools take them.
  const aroundFrame = useCallback(
    (frameId: string) => {
      const all = flow.getNodes();
      const byId = new Map(all.map((n) => [n.id, n]));
      const childrenOf = (id: string) => all.filter((n) => n.parentId === id);
      const ancestors: FrameAround[] = [];
      let parentId = byId.get(frameId)?.parentId;
      for (let i = 0; parentId && i < MAX_FRAME_DEPTH; i++) {
        const parent = byId.get(parentId);
        if (!parent) break;
        ancestors.push({
          frame: toolBox(parent),
          children: childrenOf(parent.id).map(toolBox),
        });
        parentId = parent.parentId;
      }
      return {
        frame: byId.get(frameId),
        children: childrenOf(frameId),
        ancestors,
      };
    },
    [flow, toolBox],
  );

  // Shows the frame tools' changes straight away and holds them until the
  // server has them, and gives them back as inputs to save.
  const showBoxChanges = useCallback(
    (changes: BoxChange[]): WhiteboardNodeInput[] => {
      if (changes.length === 0) return [];
      const byId = new Map(changes.map((c) => [c.id, c]));
      changes.forEach(({ id, ...change }) => markPending(id, change));
      setNodes((nds) =>
        nds.map((n) => {
          const change = byId.get(n.id);
          if (!change) return n;
          return {
            ...n,
            ...(change.position ? { position: change.position } : {}),
            ...(change.width !== undefined ? { width: change.width } : {}),
            ...(change.height !== undefined && !n.data.collapsed
              ? { height: change.height }
              : {}),
          };
        }),
      );
      return changes.map(({ id, ...change }) => ({ _id: id, ...change }));
    },
    [markPending, setNodes],
  );

  // Grows the frames that what has just landed in them overhangs on the
  // right or bottom, and the frames around those, never shrinking anything.
  // A frame that's locked, or that would make a locked frame around it grow,
  // stays as it is. Gives back the inputs to save with the move.
  const growForLanded = useCallback(
    (landed: Landed[]): WhiteboardNodeInput[] => {
      const byFrame = new Map<string, Box[]>();
      landed.forEach(({ id, parent, position }) => {
        const node = parent && flow.getNode(id);
        if (!parent || !node) return;
        byFrame.set(parent, [
          ...(byFrame.get(parent) ?? []),
          { ...frameToolBox(node), ...position },
        ]);
      });
      // Growing only reaches right and down, so where two frames grow the
      // same frame around them, the bigger size takes both.
      const grown = new Map<string, BoxChange>();
      byFrame.forEach((boxes, frameId) => {
        const { frame, ancestors } = aroundFrame(frameId);
        if (!frame || frame.data.collapsed) return;
        const result = growFrameFor(toolBox(frame), boxes, ancestors);
        if (result.locked.length > 0) return;
        result.changes.forEach(({ id, width, height }) => {
          const merged = { ...grown.get(id), id };
          if (width !== undefined) {
            merged.width = Math.max(width, merged.width ?? 0);
          }
          if (height !== undefined) {
            merged.height = Math.max(height, merged.height ?? 0);
          }
          grown.set(id, merged);
        });
      });
      return showBoxChanges([...grown.values()]);
    },
    [flow, toolBox, aroundFrame, showBoxChanges],
  );

  // Fit to contents: the frame shrinks or grows to just take what's in it,
  // and the frames around it grow if it would overhang them, with nothing
  // moving on the board.
  const fitToContents = useCallback(
    (frameId: string) => {
      const { frame, children, ancestors } = aroundFrame(frameId);
      if (!frame || frame.data.collapsed) return;
      const result = fitFrame(
        toolBox(frame),
        children.map(toolBox),
        ancestors,
        MIN_SIZES.frame,
      );
      if (result.locked.length > 0) {
        showLockRefused();
        return;
      }
      updateNodes(showBoxChanges(notDraggedByOthers(result.changes, frameId)));
    },
    [
      aroundFrame,
      toolBox,
      notDraggedByOthers,
      showBoxChanges,
      showLockRefused,
      updateNodes,
    ],
  );

  // Tidy: lays a frame's cards out as a new board would, metas first, going
  // round everything else in it, and grows the frame to take them.
  const tidyCards = useCallback(
    (frameId: string) => {
      const { frame, children, ancestors } = aroundFrame(frameId);
      if (!frame || frame.data.collapsed) return;
      const puzzles = Puzzles.find(
        { hunt: huntId },
        { projection: { tags: 1, createdAt: 1 } },
      ).fetch();
      const tags = Tags.find(
        { hunt: huntId },
        { projection: { name: 1 } },
      ).fetch();
      const metaPuzzles = roundMetas(frame.data.doc.tag, tags, puzzles);
      const createdAt = new Map(puzzles.map((p) => [p._id, +p.createdAt]));
      // A card someone else is dragging stays put like everything else
      const isCard = (n: WhiteboardFlowNode) =>
        n.type === "puzzle" && !isDraggedByOthers(n.id);
      const cards = children.filter(isCard);
      const result = tidyFrame(
        toolBox(frame),
        cards.map((n) => ({
          ...toolBox(n),
          createdAt:
            (n.data.doc.puzzle
              ? createdAt.get(n.data.doc.puzzle)
              : undefined) ?? Number.MAX_SAFE_INTEGER,
        })),
        new Set(
          cards
            .filter(
              (n) => n.data.doc.puzzle && metaPuzzles.has(n.data.doc.puzzle),
            )
            .map((n) => n.id),
        ),
        children.filter((n) => !isCard(n)).map(toolBox),
        ancestors,
      );
      if (result.locked.length > 0) {
        showLockRefused();
        return;
      }
      updateNodes(showBoxChanges(notDraggedByOthers(result.changes, frameId)));
    },
    [
      huntId,
      aroundFrame,
      toolBox,
      notDraggedByOthers,
      showBoxChanges,
      showLockRefused,
      updateNodes,
      isDraggedByOthers,
    ],
  );

  return { growForLanded, fitToContents, tidyCards };
}
