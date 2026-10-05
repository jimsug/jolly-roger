import type {
  WhiteboardColor,
  WhiteboardStrokeWidth,
} from "../lib/models/WhiteboardNodes";
import TypedMethod from "./TypedMethod";

export type WhiteboardLiveState = {
  cursor: { x: number; y: number } | null;
  // Positions are relative to `parent`, the frame the node is in (or the
  // board), so others can tell a drag apart from a later move between frames.
  drag: { node: string; x: number; y: number; parent?: string | null }[] | null;
  stroke: {
    color: WhiteboardColor;
    strokeWidth: WhiteboardStrokeWidth;
    points: [number, number, number][];
  } | null;
  // The nodes selected, and the node or line whose text is being typed in.
  // Optional so a tab still running an older client isn't refused.
  selection?: string[] | null;
  editing?: string | null;
  // Refreshed every EDITING_KEEPALIVE_MS while editing is set, so the
  // presence document changes while someone types.
  editingAt?: Date | null;
};

export default new TypedMethod<{ boardId: string } & WhiteboardLiveState, void>(
  "Whiteboards.methods.setLive",
);
