import type {
  WhiteboardColor,
  WhiteboardStrokeWidth,
} from "../lib/models/WhiteboardNodes";
import type { BoardView } from "../lib/whiteboard/links";
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
  // What the sender is looking at (the point at the centre of their canvas,
  // and their zoom), null while their tab is hidden, and who they're
  // following, if anyone. Optional for the same reason.
  view?: BoardView | null;
  followedUser?: string | null;
};

export default new TypedMethod<{ boardId: string } & WhiteboardLiveState, void>(
  "Whiteboards.methods.setLive",
);
