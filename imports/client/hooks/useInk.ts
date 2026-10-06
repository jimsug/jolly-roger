import { Random } from "meteor/random";
import type { XYPosition } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";
import type React from "react";
import { useCallback, useRef, useState } from "react";
import type {
  WhiteboardColor,
  WhiteboardStrokeWidth,
} from "../../lib/models/WhiteboardNodes";
import { contains } from "../../lib/whiteboard/connectors";
import type { InkPoint } from "../../lib/whiteboard/ink";
import {
  distanceToInk,
  InkSegmenter,
  inkBounds,
  relativeTo,
  STROKE_SIZES,
  simulatedPressure,
} from "../../lib/whiteboard/ink";
import type { WhiteboardLiveState } from "../../methods/setWhiteboardLive";
import type { WhiteboardNodeInput } from "../../methods/upsertWhiteboardNodes";
import type { Done } from "../components/whiteboard/boardWrites";
import type { Rect } from "./useBoardGeometry";
import type {
  WhiteboardFlowEdge,
  WhiteboardFlowNode,
} from "./useWhiteboardSync";

interface Drawing {
  stroke: string;
  color: WhiteboardColor;
  strokeWidth: WhiteboardStrokeWidth;
  segmenter: InkSegmenter;
  committed: number;
  parent?: string;
}

// The stroke being drawn, as it's shown until it's saved.
const strokeSoFar = (state: Drawing) => ({
  color: state.color,
  strokeWidth: state.strokeWidth,
  points: [...state.segmenter.points],
});

export type LocalStroke = ReturnType<typeof strokeSoFar>;

// The pen and the eraser: pointer samples become a stroke in flow
// coordinates, saved in segments as it's drawn so other people see it grow,
// and the eraser fades the strokes it passes over until they're deleted.
export default function useInk({
  penColor,
  penWidth,
  erasingStrokes,
  setErasingStrokes,
  absoluteRect,
  frameAt,
  flowPoint,
  updateNodes,
  deleteNodes,
  tidyLater,
  setLiveStroke,
}: {
  penColor: WhiteboardColor;
  penWidth: WhiteboardStrokeWidth;
  // The strokes under the eraser, shown faded by useWhiteboardSync, which
  // the canvas keeps since the sync comes before the writes made here.
  erasingStrokes: Set<string>;
  setErasingStrokes: React.Dispatch<React.SetStateAction<Set<string>>>;
  absoluteRect: (id: string) => Rect | undefined;
  frameAt: (
    point: XYPosition,
    exclude: (id: string) => boolean,
  ) => string | undefined;
  flowPoint: (event: React.PointerEvent | PointerEvent) => XYPosition;
  // Saves nodes; a stroke's segments go in one group, to undo as one.
  updateNodes: (
    inputs: WhiteboardNodeInput[],
    onDone?: Done,
    group?: string,
  ) => void;
  deleteNodes: (ids: string[]) => void;
  // Runs something after a while, unless the canvas has gone by then.
  tidyLater: (tidy: () => void, ms: number) => void;
  // Sends the stroke being drawn to other people, or null once it's done.
  setLiveStroke: (stroke: WhiteboardLiveState["stroke"]) => void;
}) {
  const flow = useReactFlow<WhiteboardFlowNode, WhiteboardFlowEdge>();
  const drawing = useRef<Drawing | undefined>(undefined);
  const [localStroke, setLocalStroke] = useState<LocalStroke>();

  const commitSegment = useCallback(
    (state: Drawing, points: InkPoint[]) => {
      const size = STROKE_SIZES[state.strokeWidth];
      const bounds = inkBounds(points, size);
      const parentRect = state.parent ? absoluteRect(state.parent) : undefined;
      updateNodes(
        [
          {
            _id: Random.id(),
            type: "ink",
            position: {
              x: bounds.x - (parentRect?.x ?? 0),
              y: bounds.y - (parentRect?.y ?? 0),
            },
            width: Math.max(1, bounds.width),
            height: Math.max(1, bounds.height),
            parent: state.parent ?? null,
            points: relativeTo(points, bounds),
            strokeWidth: state.strokeWidth,
            color: state.color,
            stroke: state.stroke,
          },
        ],
        undefined,
        `stroke:${state.stroke}`,
      );
      state.committed += 1;
    },
    [absoluteRect, updateNodes],
  );

  // Starts a stroke at a press, in the frame under it.
  const startStroke = useCallback(
    (point: XYPosition, event: React.PointerEvent) => {
      const stroke = Random.id();
      const state: Drawing = {
        stroke,
        color: penColor,
        strokeWidth: penWidth,
        segmenter: new InkSegmenter(),
        committed: 0,
        parent: frameAt(point, () => false),
      };
      drawing.current = state;
      const pressure =
        event.pointerType === "pen" && event.pressure > 0
          ? event.pressure
          : 0.5;
      state.segmenter.push([point.x, point.y, pressure]);
      setLocalStroke(strokeSoFar(state));
    },
    [penColor, penWidth, frameAt],
  );

  // Adds a move's samples to the stroke being drawn, if there is one.
  const extendStroke = useCallback(
    (event: React.PointerEvent) => {
      const state = drawing.current;
      if (!state) return;
      const samples =
        typeof event.nativeEvent.getCoalescedEvents === "function"
          ? event.nativeEvent.getCoalescedEvents()
          : [event.nativeEvent];
      const size = STROKE_SIZES[state.strokeWidth];
      (samples.length > 0 ? samples : [event.nativeEvent]).forEach((sample) => {
        const p = flowPoint(sample);
        const previous = state.segmenter.points.at(-1);
        const pressure =
          sample.pointerType === "pen" && sample.pressure > 0
            ? sample.pressure
            : simulatedPressure(previous, p.x, p.y, size);
        const full = state.segmenter.push([p.x, p.y, pressure]);
        if (full) commitSegment(state, full);
      });
      setLocalStroke(strokeSoFar(state));
      setLiveStroke({
        color: state.color,
        strokeWidth: state.strokeWidth,
        points: state.segmenter.points,
      });
    },
    [flowPoint, commitSegment, setLiveStroke],
  );

  // Finishes the stroke being drawn where the pointer was let go.
  const endStroke = useCallback(() => {
    const state = drawing.current;
    if (!state) return;
    drawing.current = undefined;
    const rest = state.segmenter.finish(state.committed > 0);
    if (rest) commitSegment(state, rest);
    setLocalStroke(undefined);
    setLiveStroke(null);
  }, [commitSegment, setLiveStroke]);

  // Drops the stroke being drawn (a second finger turned it into a pinch).
  // One long enough to have been saved in part is finished where it got to
  // instead.
  const dropStroke = useCallback(() => {
    const state = drawing.current;
    if (!state) return;
    drawing.current = undefined;
    if (state.committed > 0) {
      const rest = state.segmenter.finish(true);
      if (rest) commitSegment(state, rest);
    }
    setLocalStroke(undefined);
    setLiveStroke(null);
  }, [commitSegment, setLiveStroke]);

  // Locked ink isn't erased.
  const eraseAt = useCallback(
    (point: XYPosition) => {
      const hits: string[] = [];
      const all = flow.getNodes();
      const locked = new Set(
        all.flatMap((n) =>
          n.data.doc.locked && n.data.doc.stroke ? [n.data.doc.stroke] : [],
        ),
      );
      all.forEach((n) => {
        const stroke = n.data.doc.stroke;
        if (
          n.type !== "ink" ||
          !stroke ||
          erasingStrokes.has(stroke) ||
          locked.has(stroke)
        ) {
          return;
        }
        const rect = absoluteRect(n.id);
        if (!rect || !contains(rect, point)) return;
        const size = STROKE_SIZES[n.data.doc.strokeWidth ?? "medium"];
        const distance = distanceToInk(
          n.data.doc.points ?? [],
          point.x - rect.x,
          point.y - rect.y,
        );
        if (distance <= size + 4 / flow.getZoom()) hits.push(stroke);
      });
      if (hits.length > 0) {
        setErasingStrokes((current) => new Set([...current, ...hits]));
      }
    },
    [flow, absoluteRect, erasingStrokes, setErasingStrokes],
  );

  const finishErasing = useCallback(() => {
    if (erasingStrokes.size === 0) return;
    const ids = flow
      .getNodes()
      .filter((n) => n.data.doc.stroke && erasingStrokes.has(n.data.doc.stroke))
      .map((n) => n.id);
    deleteNodes(ids);
    // Leave them faded until the server removes them.
    tidyLater(() => setErasingStrokes(new Set()), 1500);
  }, [flow, erasingStrokes, deleteNodes, tidyLater, setErasingStrokes]);

  return {
    localStroke,
    startStroke,
    extendStroke,
    endStroke,
    dropStroke,
    eraseAt,
    finishErasing,
  };
}
