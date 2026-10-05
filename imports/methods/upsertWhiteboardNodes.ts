import type {
  WhiteboardColor,
  WhiteboardNodeKind,
  WhiteboardShape,
  WhiteboardStrokeWidth,
} from "../lib/models/WhiteboardNodes";
import TypedMethod from "./TypedMethod";

// Creates or updates nodes on a board. New nodes carry a client-generated _id
// so the client can refer to them before the server echoes them back. Fields
// left out are left alone; null clears a field.
export type WhiteboardNodeInput = {
  _id: string;
  type?: WhiteboardNodeKind;
  puzzle?: string;
  position?: { x: number; y: number };
  parent?: string | null;
  width?: number;
  height?: number;
  hidden?: boolean;
  // Frames only: true folds the frame for everyone, false opens it.
  collapsed?: boolean;
  // Existing nodes only, not points: true locks the node for the caller,
  // false unlocks it (for whoever locked it, or an operator).
  locked?: boolean;
  text?: string | null;
  label?: string | null;
  color?: WhiteboardColor | null;
  points?: [number, number, number][];
  strokeWidth?: WhiteboardStrokeWidth;
  stroke?: string;
  // New image nodes only: an upload to the image bucket and its size in
  // pixels.
  image?: { url: string; width: number; height: number };
  // New shape nodes only: which shape.
  shape?: WhiteboardShape;
};

export default new TypedMethod<
  { boardId: string; nodes: WhiteboardNodeInput[] },
  void
>("Whiteboards.methods.upsertNodes");
