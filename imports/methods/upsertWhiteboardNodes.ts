import type {
  WhiteboardColour,
  WhiteboardNodeKind,
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
  text?: string | null;
  label?: string | null;
  colour?: WhiteboardColour;
  points?: [number, number, number][];
  strokeWidth?: WhiteboardStrokeWidth;
  stroke?: string;
};

export default new TypedMethod<
  { boardId: string; nodes: WhiteboardNodeInput[] },
  void
>("Whiteboards.methods.upsertNodes");
