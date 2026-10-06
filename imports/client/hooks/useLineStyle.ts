import { useCallback, useMemo } from "react";
import { MAX_BATCH } from "../../lib/whiteboard/limits";
import type { LineStyle } from "../../lib/whiteboard/lineStyle";
import type { Commit } from "../components/whiteboard/boardWrites";
import { DEFAULT_LINE_STYLE } from "../components/whiteboard/LineStyleControls";
import { useWhiteboardLineStyle } from "./persisted-state";
import type { WhiteboardFlowEdge } from "./useWhiteboardSync";

// The look the line tool's next line takes, kept across boards, and the
// restyling of the lines selected.
export default function useLineStyle({
  edges,
  markEdgePending,
  commit,
}: {
  edges: WhiteboardFlowEdge[];
  // Shows a change to a line until the server has it.
  markEdgePending: (id: string, change: Partial<LineStyle>) => void;
  commit: Commit;
}) {
  const [lineStyle, setLineStyle] = useWhiteboardLineStyle(DEFAULT_LINE_STYLE);
  const updateLineStyle = useCallback(
    (patch: Partial<LineStyle>) =>
      setLineStyle((current) => ({ ...current, ...patch })),
    [setLineStyle],
  );

  const selectedLines = useMemo(
    () => edges.filter((e) => e.selected && !e.data?.doc.auto),
    [edges],
  );
  // The first selected line's look, for the restyling controls.
  const selectedLineStyle = useMemo((): LineStyle => {
    const doc = selectedLines[0]?.data?.doc;
    return {
      pathStyle: doc?.pathStyle ?? DEFAULT_LINE_STYLE.pathStyle,
      arrowHead: doc?.arrowHead ?? DEFAULT_LINE_STYLE.arrowHead,
      color: doc?.color ?? DEFAULT_LINE_STYLE.color,
      dashed: doc?.dashed ?? DEFAULT_LINE_STYLE.dashed,
    };
  }, [selectedLines]);
  const restyleLines = useCallback(
    (patch: Partial<LineStyle>) => {
      if (selectedLines.length === 0) return;
      const lines = selectedLines.slice(0, MAX_BATCH);
      const inputs = lines.map((e) => ({ _id: e.id, ...patch }));
      lines.forEach((e) => markEdgePending(e.id, patch));
      commit({ upsertEdges: inputs }, { pendingEdges: lines.map((e) => e.id) });
    },
    [selectedLines, markEdgePending, commit],
  );

  return {
    lineStyle,
    updateLineStyle,
    selectedLines,
    selectedLineStyle,
    restyleLines,
  };
}
