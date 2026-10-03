import type {
  WhiteboardColour,
  WhiteboardStrokeWidth,
} from "../lib/models/WhiteboardNodes";
import TypedMethod from "./TypedMethod";

export type WhiteboardLiveState = {
  cursor: { x: number; y: number } | null;
  // Positions are relative to `parent`, the frame the node is in (or the
  // board), so others can tell a drag apart from a later move between frames.
  drag: { node: string; x: number; y: number; parent?: string | null }[] | null;
  stroke: {
    id: string;
    colour: WhiteboardColour;
    strokeWidth: WhiteboardStrokeWidth;
    points: [number, number, number][];
  } | null;
};

export default new TypedMethod<{ boardId: string } & WhiteboardLiveState, void>(
  "Whiteboards.methods.setLive",
);
