import type React from "react";
import { createContext, useContext } from "react";
import type { WhiteboardEdgeInput } from "../../../methods/upsertWhiteboardEdges";
import type { WhiteboardNodeInput } from "../../../methods/upsertWhiteboardNodes";

export interface PuzzlePeople {
  callers: string[];
  viewers: { user: string; passive: boolean }[];
}

export interface WhiteboardActions {
  boardId: string;
  huntId: string;
  readOnly: boolean;
  updateNodes: (inputs: WhiteboardNodeInput[]) => void;
  deleteNodes: (ids: string[]) => void;
  updateEdge: (input: WhiteboardEdgeInput) => void;
  // Persists a node's size and position, and its children's positions, after
  // a resize (resizing from the top or left moves the origin).
  persistResize: (id: string) => void;
  // Stops moves gliding while we drag or resize something ourselves.
  beginInteraction: () => void;
  // Starts dragging one end of a line, from its grip.
  beginEndpointDrag: (
    edgeId: string,
    end: "source" | "target",
    event: React.PointerEvent,
  ) => void;
  // A node created by this client that should open for editing when it
  // appears.
  editOnAppear: string | undefined;
  clearEditOnAppear: () => void;
}

export const WhiteboardContext = createContext<WhiteboardActions | undefined>(
  undefined,
);

export function useWhiteboard(): WhiteboardActions {
  const value = useContext(WhiteboardContext);
  if (!value) {
    throw new Error("useWhiteboard must be used inside a whiteboard");
  }
  return value;
}

export const PeopleContext = createContext<Map<string, PuzzlePeople>>(
  new Map(),
);
