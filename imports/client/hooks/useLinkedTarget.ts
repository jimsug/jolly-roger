import type { Viewport } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { WhiteboardNodeType } from "../../lib/models/WhiteboardNodes";
import type { BoardTarget } from "../../lib/whiteboard/links";
import { boardTargetKey } from "../../lib/whiteboard/links";
import type { ShowNotice } from "./useBoardNotices";
import type {
  WhiteboardFlowEdge,
  WhiteboardFlowNode,
} from "./useWhiteboardSync";

// A card, node or view a link asked for (?puzzle=, ?node= or ?v=), shown once
// the board has loaded and the node it names is laid out, as a comment link
// is (see the canvas's pendingFocus). Something the search finds inside a
// collapsed frame waits the same way.
export default function useLinkedTarget({
  initialTarget,
  onInitialTargetShown,
  initialViewport,
  openedAt,
  boardLoaded,
  livePuzzleIds,
  nodeDocs,
  nodes,
  peekAround,
  showNode,
  showNotice,
}: {
  initialTarget: BoardTarget | undefined;
  onInitialTargetShown: (() => void) | undefined;
  // The viewport the board opened at, if it had one saved, and the key of
  // the target it opened with: with neither, the board fitted itself.
  initialViewport: Viewport | undefined;
  openedAt: string;
  boardLoaded: boolean;
  livePuzzleIds: Set<string>;
  nodeDocs: WhiteboardNodeType[];
  // The board as React Flow has it; the effect re-runs as it's laid out.
  nodes: WhiteboardFlowNode[];
  peekAround: (nodeId: string) => boolean;
  showNode: (id: string) => boolean;
  showNotice: ShowNotice;
}) {
  const flow = useReactFlow<WhiteboardFlowNode, WhiteboardFlowEdge>();
  const { t } = useTranslation();
  const [pendingTarget, setPendingTarget] = useState(initialTarget);
  const [linkedTarget, setLinkedTarget] = useState(
    boardTargetKey(initialTarget),
  );
  if (boardTargetKey(initialTarget) !== linkedTarget) {
    setLinkedTarget(boardTargetKey(initialTarget));
    if (initialTarget) setPendingTarget(initialTarget);
  }

  useEffect(() => {
    if (!pendingTarget || !boardLoaded || !flow.viewportInitialized) return;
    const done = () => {
      setPendingTarget(undefined);
      if (boardTargetKey(pendingTarget) === boardTargetKey(initialTarget)) {
        onInitialTargetShown?.();
      }
    };
    if (pendingTarget.kind === "view") {
      void flow.setCenter(pendingTarget.x, pendingTarget.y, {
        zoom: pendingTarget.zoom,
      });
      done();
      return;
    }
    const doc =
      pendingTarget.kind === "puzzle"
        ? nodeDocs.find(
            (d) => d.type === "puzzle" && d.puzzle === pendingTarget.id,
          )
        : nodeDocs.find((d) => d._id === pendingTarget.id);
    const gone =
      !doc ||
      !!doc.hidden ||
      (doc.type === "puzzle" && !livePuzzleIds.has(doc.puzzle ?? ""));
    if (gone) {
      showNotice(
        pendingTarget.kind === "puzzle"
          ? t("whiteboard.link.puzzleGone", "That puzzle isn't on the board.")
          : t("whiteboard.link.nodeGone", "That isn't on the board any more."),
      );
      // The board skipped fitting itself to open here, so it does now.
      if (!initialViewport && boardTargetKey(pendingTarget) === openedAt) {
        void flow.fitView();
      }
      done();
      return;
    }
    if (peekAround(doc._id)) return;
    if (showNode(doc._id)) done();
  }, [
    pendingTarget,
    boardLoaded,
    flow,
    peekAround,
    nodeDocs,
    livePuzzleIds,
    showNode,
    showNotice,
    t,
    initialTarget,
    initialViewport,
    openedAt,
    onInitialTargetShown,
    nodes,
  ]);

  // Shows a node once it's laid out.
  return setPendingTarget;
}
