import type {
  WhiteboardColour,
  WhiteboardStrokeWidth,
} from "../lib/models/WhiteboardNodes";
import TypedMethod from "./TypedMethod";

export type WhiteboardLiveState = {
  cursor: { x: number; y: number } | null;
  drag: { node: string; x: number; y: number }[] | null;
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
