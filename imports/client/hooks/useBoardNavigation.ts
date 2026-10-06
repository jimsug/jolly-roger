import type { XYPosition } from "@xyflow/react";
import { getViewportForBounds, useReactFlow } from "@xyflow/react";
import type { RefObject } from "react";
import { useCallback, useEffect, useState } from "react";
import type { WhiteboardNodeType } from "../../lib/models/WhiteboardNodes";
import { centerOf } from "../../lib/whiteboard/connectors";
import { MAX_ZOOM, MIN_ZOOM } from "../../lib/whiteboard/links";
import { OUTLINE_WIDTH } from "../components/whiteboard/OutlinePanel";
import type {
  WhiteboardFlowEdge,
  WhiteboardFlowNode,
} from "./useWhiteboardSync";

// The room left round a frame the Outline fits the view to, as a share of
// the view.
const OUTLINE_FIT_PADDING = 0.1;
// Beside a wide board the Outline stays open at the top right, so a fit
// leaves its width clear on that side, with the panel's margin and a gap.
const OUTLINE_FIT_PADDING_BESIDE = {
  top: OUTLINE_FIT_PADDING,
  bottom: OUTLINE_FIT_PADDING,
  left: OUTLINE_FIT_PADDING,
  right: `${OUTLINE_WIDTH + 40}px`,
} as const;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Bringing something on the board into view: a node, a line, a frame the
// Outline picked or the whole board, each marked for a moment once there.
// Something inside a collapsed frame is shown once the frame is open for
// this viewer and it's drawn.
export default function useBoardNavigation({
  wrapperRef,
  compact,
  absoluteRect,
  nodeCenter,
  pulseAt,
  nodeDocs,
  nodes,
  edges,
  shownLines,
  peekAround,
  closeOutlineSheet,
}: {
  wrapperRef: RefObject<HTMLDivElement | null>;
  compact: boolean;
  // A node's box on the board as React Flow last laid it out, and its
  // middle.
  absoluteRect: (id: string) => Rect | undefined;
  nodeCenter: (id: string) => XYPosition | undefined;
  // Marks a node, or a point, for a moment.
  pulseAt: (at: { node?: string; point?: XYPosition }) => void;
  nodeDocs: WhiteboardNodeType[];
  // The board as React Flow has it; the effects re-run as it's laid out.
  nodes: WhiteboardFlowNode[];
  edges: WhiteboardFlowEdge[];
  shownLines: ReadonlySet<string>;
  // Opens the collapsed frames around a node for this viewer, and says
  // whether there were any.
  peekAround: (nodeId: string) => boolean;
  // Closes the Outline's sheet on a phone, as the board starts to move.
  closeOutlineSheet: () => void;
}) {
  const flow = useReactFlow<WhiteboardFlowNode, WhiteboardFlowEdge>();

  // Brings a point on the board to the middle of the screen, zooming in far
  // enough to read a card.
  const panTo = useCallback(
    (at: XYPosition) => {
      void flow.setCenter(at.x, at.y, {
        zoom: Math.max(flow.getZoom(), 0.8),
        duration: 400,
      });
    },
    [flow],
  );

  // Pans to a node and marks it, if it's on the board.
  const showNode = useCallback(
    (id: string) => {
      const rect = absoluteRect(id);
      if (!rect) return false;
      panTo(centerOf(rect));
      pulseAt({ node: id });
      return true;
    },
    [absoluteRect, panTo, pulseAt],
  );

  // Pans to the middle of a line and marks it, if it's drawn, and says
  // whether it was.
  const showLine = useCallback(
    (id: string) => {
      const edge = flow.getEdge(id);
      const from = edge && nodeCenter(edge.source);
      const to = edge && nodeCenter(edge.target);
      if (!from || !to) return false;
      const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
      panTo(middle);
      pulseAt({ point: middle });
      return true;
    },
    [flow, nodeCenter, panTo, pulseAt],
  );
  const outlineFitPadding = compact
    ? OUTLINE_FIT_PADDING
    : OUTLINE_FIT_PADDING_BESIDE;
  // Fits the view to a frame and marks it, if it's drawn, and says whether
  // it was. The zoom is kept within the board's own limits.
  const fitViewToFrame = useCallback(
    (id: string) => {
      const rect = absoluteRect(id);
      const wrapper = wrapperRef.current;
      if (!rect || rect.width <= 0 || rect.height <= 0 || !wrapper) {
        return false;
      }
      void flow.setViewport(
        getViewportForBounds(
          rect,
          wrapper.clientWidth,
          wrapper.clientHeight,
          MIN_ZOOM,
          MAX_ZOOM,
          outlineFitPadding,
        ),
        { duration: 400 },
      );
      pulseAt({ node: id });
      return true;
    },
    [absoluteRect, wrapperRef, flow, pulseAt, outlineFitPadding],
  );
  // A frame picked in the Outline from inside a collapsed frame, fitted to
  // once that frame is open for this viewer and it's drawn.
  const [pendingFit, setPendingFit] = useState<string>();
  useEffect(() => {
    if (!pendingFit) return;
    const doc = nodeDocs.find((d) => d._id === pendingFit);
    if (!doc || doc.hidden || fitViewToFrame(pendingFit))
      setPendingFit(undefined);
    // nodes isn't read: it re-runs this once React Flow has drawn the frame
    // its collapsed parent hid.
  }, [pendingFit, nodeDocs, nodes, fitViewToFrame]);

  // A line the search found inside a collapsed frame, shown once the frame
  // is open and the line is drawn to its real ends.
  const [pendingLine, setPendingLine] = useState<string>();
  useEffect(() => {
    if (!pendingLine) return;
    if (!shownLines.has(pendingLine)) {
      setPendingLine(undefined);
      return;
    }
    if (flow.getEdge(pendingLine)?.data?.folded) return;
    if (showLine(pendingLine)) setPendingLine(undefined);
  }, [pendingLine, shownLines, flow, showLine, edges, nodes]);

  const showOutlineFrame = useCallback(
    (id: string) => {
      // A frame inside a collapsed one is fitted to once that one is open.
      const later = peekAround(id) || !fitViewToFrame(id);
      setPendingFit(later ? id : undefined);
      closeOutlineSheet();
    },
    [peekAround, fitViewToFrame, closeOutlineSheet],
  );
  const fitWholeBoard = useCallback(() => {
    setPendingFit(undefined);
    void flow.fitView({ padding: outlineFitPadding, duration: 400 });
    closeOutlineSheet();
  }, [flow, outlineFitPadding, closeOutlineSheet]);

  return {
    showNode,
    showLine,
    // Shows a line once it's drawn to its real ends.
    setPendingLine,
    showOutlineFrame,
    fitWholeBoard,
  };
}
